import "server-only";

import { and, asc, eq, gte, lt, ne } from "drizzle-orm";
import { DateTime } from "luxon";

import { inClinic } from "@/db/client";
import { appointments, patients, services } from "@/db/schema";
import { countRequestedFrom } from "@/modules/appointments/appointments";
import { getClinicTimezone } from "@/modules/clinic-page/panel";
import { listPendingLinks } from "@/modules/patients/links";
import {
  findBlocksAndHours,
  getSlotStepMinutes,
} from "@/modules/schedule/schedule";
import { localDayRange } from "@/modules/schedule/time";

import {
  daySummary,
  freeIntervals,
  nextItem,
  type DayItem,
  type FreeInterval,
} from "./day";

// Data for the owner's panel: one day's agenda, the week's marks and the
// home summary. Every function takes the clinicId from the session.

const MINUTE = 60_000;
const LOOK_AHEAD_DAYS = 14;
const ANONYMIZED_LABEL = "Paciente anonimizada";

export type DayAgenda = {
  date: string;
  zone: string;
  items: DayItem[];
  free: FreeInterval[];
  closed: boolean;
  blocks: { title: string | null; allDay: boolean }[];
};

const itemColumns = {
  id: appointments.id,
  startsAt: appointments.startsAt,
  endsAt: appointments.endsAt,
  status: appointments.status,
  source: appointments.source,
  patientId: appointments.patientId,
  serviceName: appointments.serviceName,
  customLabel: appointments.customLabel,
  priceCents: services.priceCents,
  name: patients.name,
  phone: patients.phone,
  anonymizedAt: patients.anonymizedAt,
};

function toItem(row: {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: DayItem["status"];
  source: "online" | "admin";
  patientId: string;
  serviceName: string;
  customLabel: string | null;
  priceCents: number | null;
  name: string;
  phone: string | null;
  anonymizedAt: Date | null;
}): DayItem {
  const anonymized = row.anonymizedAt !== null;
  return {
    id: row.id,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    online: row.source === "online",
    priceCents: row.priceCents,
    patientId: row.patientId,
    patientName: anonymized ? ANONYMIZED_LABEL : row.name,
    patientPhone: anonymized ? null : row.phone,
    serviceName: row.customLabel ?? row.serviceName,
    durationMinutes: Math.round(
      (row.endsAt.getTime() - row.startsAt.getTime()) / MINUTE,
    ),
  };
}

// Appointments (every status) that start in [from, to), ordered by start.
function selectItems(
  tx: Parameters<Parameters<typeof inClinic>[1]>[0],
  clinicId: string,
  from: Date,
  to: Date,
  withoutCancelled = false,
  limit?: number,
) {
  const query = tx
    .select(itemColumns)
    .from(appointments)
    .innerJoin(patients, eq(appointments.patientId, patients.id))
    .leftJoin(
      services,
      and(
        eq(services.clinicId, appointments.clinicId),
        eq(services.id, appointments.serviceId),
      ),
    )
    .where(
      and(
        eq(appointments.clinicId, clinicId),
        gte(appointments.startsAt, from),
        lt(appointments.startsAt, to),
        withoutCancelled ? ne(appointments.status, "cancelled") : undefined,
      ),
    )
    .orderBy(asc(appointments.startsAt), asc(appointments.id));
  return limit ? query.limit(limit) : query;
}

export async function getDayAgenda(
  clinicId: string,
  date: string,
  now: Date = new Date(),
): Promise<DayAgenda> {
  const zone = await getClinicTimezone(clinicId);
  const stepMinutes = await getSlotStepMinutes(clinicId);
  const range = localDayRange(date, date, zone);

  const { rows, blocks, hours } = await inClinic(clinicId, async (tx) => {
    const found = await findBlocksAndHours(
      clinicId,
      { from: range.startsAt, to: range.endsAt },
      now,
      tx,
    );
    return {
      rows: await selectItems(tx, clinicId, range.startsAt, range.endsAt),
      ...found,
    };
  });

  const items = rows.map(toItem);
  const weekday = DateTime.fromISO(date, { zone }).weekday % 7;
  const closed =
    (hours.find((entry) => entry.weekday === weekday)?.intervals.length ??
      0) === 0;

  return {
    date,
    zone,
    items,
    free: freeIntervals({
      date,
      zone,
      hours,
      blocks,
      items,
      stepMinutes,
      now,
    }),
    closed,
    blocks: blocks.map((b) => ({ title: b.title, allDay: b.allDay })),
  };
}

// Local dates in [from, from + days) with at least one non-cancelled appointment.
export async function getWeekMarks(
  clinicId: string,
  from: string,
  days: number,
): Promise<string[]> {
  const zone = await getClinicTimezone(clinicId);
  const last = DateTime.fromISO(from, { zone })
    .plus({ days: days - 1 })
    .toISODate();
  if (!last || days < 1) return [];
  const range = localDayRange(from, last, zone);
  const rows = await inClinic(clinicId, (tx) =>
    tx
      .select({ startsAt: appointments.startsAt })
      .from(appointments)
      .where(
        and(
          eq(appointments.clinicId, clinicId),
          gte(appointments.startsAt, range.startsAt),
          lt(appointments.startsAt, range.endsAt),
          ne(appointments.status, "cancelled"),
        ),
      ),
  );
  const marks = new Set(
    rows.map((r) => DateTime.fromJSDate(r.startsAt, { zone }).toISODate()!),
  );
  return [...marks].sort();
}

export async function getPanelHome(
  clinicId: string,
  now: Date = new Date(),
): Promise<{
  today: DayAgenda;
  summary: ReturnType<typeof daySummary>;
  next: DayItem | null;
  nextDayFirst: DayItem | null;
  alerts: number;
}> {
  const zone = await getClinicTimezone(clinicId);
  const date = DateTime.fromJSDate(now, { zone }).toISODate()!;
  const today = await getDayAgenda(clinicId, date, now);
  const next = nextItem(today.items, now);

  let nextDayFirst: DayItem | null = null;
  if (!next) {
    const tomorrow = DateTime.fromISO(date, { zone })
      .plus({ days: 1 })
      .toISODate()!;
    const lastDay = DateTime.fromISO(date, { zone })
      .plus({ days: LOOK_AHEAD_DAYS })
      .toISODate()!;
    const range = localDayRange(tomorrow, lastDay, zone);
    const [row] = await inClinic(clinicId, (tx) =>
      selectItems(tx, clinicId, range.startsAt, range.endsAt, true, 1),
    );
    nextDayFirst = row ? toItem(row) : null;
  }

  const [links, requested] = await Promise.all([
    listPendingLinks(clinicId),
    countRequestedFrom(clinicId, now),
  ]);

  return {
    today,
    summary: daySummary(today.items),
    next,
    nextDayFirst,
    alerts: links.length + requested,
  };
}
