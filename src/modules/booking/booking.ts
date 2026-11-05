import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  sql,
} from "drizzle-orm";
import { DateTime } from "luxon";

import { asClient, type Tx } from "@/db/client";
import { findPgError, isAppointmentOverlapError } from "@/db/errors";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  appointments,
  auditLogs,
  clinics,
  patients,
  services,
} from "@/db/schema";
import { lockAgenda } from "@/modules/appointments/appointments";
import type { Status } from "@/modules/appointments/fields";
import type { DayHours } from "@/modules/schedule/schedule";

import { type BusyInterval, freeSlots, parseLocalDate } from "./slots";

// Online booking by a signed-in client, as app_client (asClient). Row-level
// security keeps every query inside her clinic and her own patients row; what
// she needs of the rest of the agenda (busy time, opening hours) comes from
// the definer functions of migrations 0013 and 0014, without names or ids.
// Nothing here returns another patient's data, nor pending_link_patient_id.
// Errors never carry patient data. The clock is always the server's own
// (new Date() inside each function): min advance, past slots and the active
// limit must never depend on a caller-supplied time.

// Who is booking. Every field comes from the server: clinicId and patientId
// from getClientContext, userId and emailVerified from the Better Auth
// session. Never build it from browser input; userId in particular must only
// ever come from the server session. These functions take it as given.
export type BookingContext = {
  clinicId: string;
  patientId: string;
  userId: string;
  emailVerified: boolean;
};

export type BookableService = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  // Null when the clinic keeps the price hidden.
  priceCents: number | null;
  priceDisplay: (typeof services.$inferSelect)["priceDisplay"];
  preparationInstructions: string | null;
};

export type BookingResult =
  | { ok: true; appointmentId: string }
  | { ok: false; reason: "taken" | "limit" | "unavailable" | "unverified" };

export type MyAppointment = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  serviceName: string;
  status: Status;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const MINUTE = 60_000;
const PAST_LIST_LIMIT = 50;

type BookingClinic = {
  timezone: string;
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
  slotStepMinutes: number;
  maxActiveAppointmentsPerPhone: number;
};

type BookingService = {
  id: string;
  name: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
};

const scope = (ctx: BookingContext) => ({
  clinicId: ctx.clinicId,
  patientId: ctx.patientId,
  userId: ctx.userId,
});

const validContext = (ctx: BookingContext) =>
  UUID_PATTERN.test(ctx.clinicId) &&
  UUID_PATTERN.test(ctx.patientId) &&
  UUID_PATTERN.test(ctx.userId);

// Never lets driver details (which can echo values) out of this module.
function unexpected(error: unknown): Error {
  return new Error("Não foi possível concluir o agendamento.", {
    cause: error,
  });
}

// The clinic, when it is active (policy clinics_client) and takes online
// bookings.
async function readClinic(
  tx: Tx,
  clinicId: string,
): Promise<BookingClinic | null> {
  const [row] = await tx
    .select({
      onlineBookingEnabled: clinics.onlineBookingEnabled,
      timezone: clinics.timezone,
      minAdvanceMinutes: clinics.minAdvanceMinutes,
      maxAdvanceDays: clinics.maxAdvanceDays,
      slotStepMinutes: clinics.slotStepMinutes,
      maxActiveAppointmentsPerPhone: clinics.maxActiveAppointmentsPerPhone,
    })
    .from(clinics)
    .where(eq(clinics.id, clinicId))
    .limit(1);
  if (!row?.onlineBookingEnabled) return null;
  return row;
}

// The service, when it is open to online booking. Policy services_client
// hides every other one (inactive, offline, flexible, inactive category).
// The WHERE repeats the service-level conditions (active, online, not
// flexible); the category check is left to the policy, and the insert policy
// of 0014 checks all of them again.
async function readService(
  tx: Tx,
  clinicId: string,
  serviceId: string,
): Promise<BookingService | null> {
  if (!UUID_PATTERN.test(serviceId)) return null;
  const [row] = await tx
    .select({
      id: services.id,
      name: services.name,
      durationMinutes: services.durationMinutes,
      bufferBeforeMinutes: services.bufferBeforeMinutes,
      bufferAfterMinutes: services.bufferAfterMinutes,
    })
    .from(services)
    .where(
      and(
        eq(services.id, serviceId),
        eq(services.clinicId, clinicId),
        eq(services.isActive, true),
        eq(services.onlineBookingEnabled, true),
        eq(services.isFlexible, false),
      ),
    )
    .limit(1);
  return row ?? null;
}

// Her patients row in this clinic is still hers and not anonymized.
async function isOwnRow(tx: Tx, ctx: BookingContext): Promise<boolean> {
  const [row] = await tx
    .select({ id: patients.id })
    .from(patients)
    .where(
      and(
        eq(patients.id, ctx.patientId),
        eq(patients.clinicId, ctx.clinicId),
        eq(patients.userId, ctx.userId),
        isNull(patients.anonymizedAt),
      ),
    );
  return Boolean(row);
}

// Rolls the booking transaction back when her row changed under it.
class RowNoLongerHers extends Error {}

// The owner may change the agenda between the checks and the insert: the
// service switched off or its category deactivated (the insert policy of
// 0014 refuses it, 42501), or the service or her row deleted (foreign key,
// 23503). Those become "unavailable"; nothing else is caught here.
class InsertRefused extends Error {}

const REFUSED_FOREIGN_KEYS = new Set([
  "appointments_service_fk",
  "appointments_patient_fk",
]);

async function insertBooking<T>(insert: () => Promise<T>): Promise<T> {
  try {
    return await insert();
  } catch (error) {
    const pgError = findPgError(error);
    if (
      pgError?.code === "42501" ||
      (pgError?.code === "23503" &&
        REFUSED_FOREIGN_KEYS.has(pgError.constraint ?? ""))
    ) {
      throw new InsertRefused();
    }
    throw error;
  }
}

async function readHours(tx: Tx, clinicId: string): Promise<DayHours[]> {
  const result = await tx.execute<{
    weekday: number;
    opens: string;
    closes: string;
  }>(
    sql`select weekday, opens, closes from client_business_hours(${clinicId}::uuid)`,
  );
  const week: DayHours[] = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    intervals: [],
  }));
  for (const row of result.rows) {
    week[Number(row.weekday)]?.intervals.push({
      start: row.opens.slice(0, 5),
      end: row.closes.slice(0, 5),
    });
  }
  return week;
}

async function readBusy(
  tx: Tx,
  clinicId: string,
  from: Date,
  to: Date,
): Promise<BusyInterval[]> {
  const result = await tx.execute<{ starts_at: string; ends_at: string }>(
    sql`select starts_at, ends_at from client_busy_intervals(${clinicId}::uuid, ${from.toISOString()}::timestamptz, ${to.toISOString()}::timestamptz)`,
  );
  return result.rows.map((row) => ({
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
  }));
}

// Busy time for the local days [first, last], padded so that buffers that run
// past midnight are seen too (buffers are at most 240 minutes).
function busyWindow(first: DateTime, last: DateTime) {
  return {
    from: first.minus({ days: 1 }).toJSDate(),
    to: last.plus({ days: 2 }).toJSDate(),
  };
}

function slotInput(
  clinic: BookingClinic,
  service: BookingService,
  hours: DayHours[],
  busy: BusyInterval[],
  now: Date,
) {
  return {
    zone: clinic.timezone,
    hours,
    busy,
    durationMinutes: service.durationMinutes,
    bufferBeforeMinutes: service.bufferBeforeMinutes,
    bufferAfterMinutes: service.bufferAfterMinutes,
    stepMinutes: clinic.slotStepMinutes,
    now,
    minAdvanceMinutes: clinic.minAdvanceMinutes,
    maxAdvanceDays: clinic.maxAdvanceDays,
  };
}

// Services she can book online, in the clinic's order. Empty while the
// clinic does not take online bookings.
export async function listBookableServices(
  ctx: BookingContext,
): Promise<BookableService[]> {
  if (!validContext(ctx)) return [];
  return asClient(scope(ctx), async (tx) => {
    if (!(await readClinic(tx, ctx.clinicId))) return [];
    const rows = await tx
      .select({
        id: services.id,
        name: services.name,
        description: services.description,
        durationMinutes: services.durationMinutes,
        priceCents: services.priceCents,
        priceDisplay: services.priceDisplay,
        preparationInstructions: services.preparationInstructions,
      })
      .from(services)
      .where(
        and(
          eq(services.clinicId, ctx.clinicId),
          eq(services.isActive, true),
          eq(services.onlineBookingEnabled, true),
          eq(services.isFlexible, false),
        ),
      )
      .orderBy(asc(services.sortOrder), asc(services.name), asc(services.id));
    return rows.map((row) => ({
      ...row,
      priceCents: row.priceDisplay === "hidden" ? null : row.priceCents,
    }));
  });
}

// Free slot starts of one local day (yyyy-mm-dd), as ISO strings with the
// clinic's offset. Empty when the clinic or the service is not open to online
// booking, or the date is invalid.
export async function listFreeSlots(
  ctx: BookingContext,
  serviceId: string,
  date: string,
): Promise<string[]> {
  if (!validContext(ctx)) return [];
  const now = new Date();
  return asClient(scope(ctx), async (tx) => {
    const clinic = await readClinic(tx, ctx.clinicId);
    if (!clinic) return [];
    const day = parseLocalDate(date, clinic.timezone);
    if (!day) return [];
    const service = await readService(tx, ctx.clinicId, serviceId);
    if (!service) return [];
    const window = busyWindow(day, day);
    const hours = await readHours(tx, ctx.clinicId);
    const busy = await readBusy(tx, ctx.clinicId, window.from, window.to);
    return freeSlots({
      date,
      ...slotInput(clinic, service, hours, busy, now),
    });
  });
}

// The days of a month (yyyy-mm) with at least one free slot, as yyyy-mm-dd.
export async function listDaysWithSlots(
  ctx: BookingContext,
  serviceId: string,
  month: string,
): Promise<string[]> {
  if (!validContext(ctx) || !MONTH_PATTERN.test(month)) return [];
  const now = new Date();
  return asClient(scope(ctx), async (tx) => {
    const clinic = await readClinic(tx, ctx.clinicId);
    if (!clinic) return [];
    const first = parseLocalDate(`${month}-01`, clinic.timezone);
    if (!first) return [];
    const today = DateTime.fromJSDate(now, { zone: clinic.timezone }).startOf(
      "day",
    );
    const lastOpen = today.plus({ days: clinic.maxAdvanceDays });
    const start = first < today ? today : first;
    const monthEnd = first.endOf("month").startOf("day");
    const end = monthEnd > lastOpen ? lastOpen : monthEnd;
    if (start > end) return [];

    const service = await readService(tx, ctx.clinicId, serviceId);
    if (!service) return [];
    const window = busyWindow(start, end);
    const hours = await readHours(tx, ctx.clinicId);
    const busy = await readBusy(tx, ctx.clinicId, window.from, window.to);
    const input = slotInput(clinic, service, hours, busy, now);

    const days: string[] = [];
    for (let day = start; day <= end; day = day.plus({ days: 1 })) {
      const date = day.toFormat("yyyy-MM-dd");
      if (freeSlots({ date, ...input }).length > 0) days.push(date);
    }
    return days;
  });
}

// Books a free slot for her, confirmed and online (services.requiresApproval
// does not apply online). Under the clinic's agenda lock it checks again that
// the clinic and the service take online bookings, that her row is hers,
// her limit of active appointments (upcoming requested or confirmed ones of
// her own patients row) and that the start is still a free slot: hours,
// blocks, other appointments with buffers, step, minimum and maximum
// advance. appointments_no_overlap backs this up: its violation is "taken".
export async function bookOnline(
  ctx: BookingContext,
  input: { serviceId: string; startsAt: string | Date },
): Promise<BookingResult> {
  if (!ctx.emailVerified) return { ok: false, reason: "unverified" };
  if (!validContext(ctx)) return { ok: false, reason: "unavailable" };
  const startsAt = new Date(input.startsAt);
  const now = new Date();
  try {
    return await asClient(scope(ctx), async (tx): Promise<BookingResult> => {
      await lockAgenda(tx, ctx.clinicId);

      const clinic = await readClinic(tx, ctx.clinicId);
      if (!clinic) return { ok: false, reason: "unavailable" };
      const service = await readService(tx, ctx.clinicId, input.serviceId);
      if (!service) return { ok: false, reason: "unavailable" };

      if (!(await isOwnRow(tx, ctx))) {
        return { ok: false, reason: "unavailable" };
      }

      const [active] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(appointments)
        .where(
          and(
            eq(appointments.clinicId, ctx.clinicId),
            eq(appointments.patientId, ctx.patientId),
            inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
            gt(appointments.endsAt, now),
          ),
        );
      if ((active?.count ?? 0) >= clinic.maxActiveAppointmentsPerPhone) {
        return { ok: false, reason: "limit" };
      }

      if (Number.isNaN(startsAt.getTime())) {
        return { ok: false, reason: "taken" };
      }
      const date = DateTime.fromJSDate(startsAt, {
        zone: clinic.timezone,
      }).toFormat("yyyy-MM-dd");
      const day = parseLocalDate(date, clinic.timezone);
      if (!day) return { ok: false, reason: "taken" };
      const window = busyWindow(day, day);
      const hours = await readHours(tx, ctx.clinicId);
      const busy = await readBusy(tx, ctx.clinicId, window.from, window.to);
      const free = freeSlots({
        date,
        ...slotInput(clinic, service, hours, busy, now),
      });
      if (!free.some((slot) => Date.parse(slot) === startsAt.getTime())) {
        return { ok: false, reason: "taken" };
      }

      const endsAt = new Date(
        startsAt.getTime() + service.durationMinutes * MINUTE,
      );
      const [row] = await insertBooking(() =>
        tx
          .insert(appointments)
          .values({
            clinicId: ctx.clinicId,
            patientId: ctx.patientId,
            serviceId: service.id,
            serviceName: service.name,
            serviceDurationMinutes: service.durationMinutes,
            customLabel: null,
            startsAt,
            endsAt,
            occupiedFrom: new Date(
              startsAt.getTime() - service.bufferBeforeMinutes * MINUTE,
            ),
            occupiedUntil: new Date(
              endsAt.getTime() + service.bufferAfterMinutes * MINUTE,
            ),
            status: "confirmed",
            source: "online",
            confirmedAt: now,
          })
          .returning({ id: appointments.id }),
      );

      await tx.insert(auditLogs).values({
        clinicId: ctx.clinicId,
        actorType: "patient",
        actorUserId: ctx.userId,
        action: "appointment.created",
        entityType: "appointment",
        entityId: row!.id,
        changes: {
          patientId: ctx.patientId,
          serviceId: service.id,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          durationMinutes: service.durationMinutes,
          status: "confirmed",
          source: "online",
        },
      });
      // app_client cannot lock her row (that needs UPDATE), but the insert's
      // foreign key check waits for an anonymization in progress. Reading
      // the row again afterwards sees it, and the booking is undone.
      if (!(await isOwnRow(tx, ctx))) throw new RowNoLongerHers();
      return { ok: true, appointmentId: row!.id };
    });
  } catch (error) {
    if (error instanceof RowNoLongerHers || error instanceof InsertRefused) {
      return { ok: false, reason: "unavailable" };
    }
    if (isAppointmentOverlapError(error)) return { ok: false, reason: "taken" };
    throw unexpected(error);
  }
}

// Her appointments in this clinic, every status included (the owner's
// cancellations show as cancelled): upcoming ones first, soonest first, then
// the latest past ones.
export async function listMyAppointments(
  ctx: BookingContext,
): Promise<{ upcoming: MyAppointment[]; past: MyAppointment[] }> {
  if (!validContext(ctx)) return { upcoming: [], past: [] };
  const now = new Date();
  const columns = {
    id: appointments.id,
    startsAt: appointments.startsAt,
    endsAt: appointments.endsAt,
    serviceName: appointments.serviceName,
    status: appointments.status,
  };
  const own = and(
    eq(appointments.clinicId, ctx.clinicId),
    eq(appointments.patientId, ctx.patientId),
  );
  return asClient(scope(ctx), async (tx) => {
    const upcoming = await tx
      .select(columns)
      .from(appointments)
      .where(and(own, gte(appointments.startsAt, now)))
      .orderBy(asc(appointments.startsAt), asc(appointments.id));
    const past = await tx
      .select(columns)
      .from(appointments)
      .where(and(own, lt(appointments.startsAt, now)))
      .orderBy(desc(appointments.startsAt), desc(appointments.id))
      .limit(PAST_LIST_LIMIT);
    return { upcoming, past };
  });
}
