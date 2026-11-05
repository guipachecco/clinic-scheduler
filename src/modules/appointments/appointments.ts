import "server-only";

import { and, asc, desc, eq, gt, gte, inArray, lt, ne, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { isAppointmentOverlapError, isUniqueViolation } from "@/db/errors";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  appointments,
  auditLogs,
  patients,
  serviceCategories,
  services,
} from "@/db/schema";
import { syncSessionInstallment } from "@/modules/finance/session-links";
import { ANONYMIZED_NAME } from "@/modules/patients/patients";
import { findBlocksAndHours } from "@/modules/schedule/schedule";
import { formatLocal } from "@/modules/schedule/time";

import {
  APPOINTMENT_STATUSES,
  type AppointmentFormValues,
  type CancellationReason,
  CANCELLATION_REASON_LABELS,
  canTransition,
  isEditableStatus,
  type Status,
} from "./fields";
import { checkWarnings, type Warning } from "./rules";

// Data functions for the admin agenda of one clinic: every function takes the
// clinicId from the session and never reads or writes another clinic. Every
// write runs in one transaction that takes, in this order: the clinic's
// agenda advisory lock, the patient row
// FOR SHARE, the appointment row FOR UPDATE (updates only), then reads the
// service. Patient names and labels never go to audit_logs or into error
// messages; audit `changes` hold ids, ISO instants, durations and codes only.

export type AppointmentResult =
  | { ok: true; id: string }
  | {
      ok: false;
      fieldErrors?: Record<string, string>;
      formError?: string;
      warnings?: Warning[];
    };

export type AppointmentRecord = {
  id: string;
  patientId: string;
  patientName: string;
  serviceId: string;
  serviceName: string;
  isFlexible: boolean;
  customLabel: string | null;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  status: Status;
  source: "online" | "admin";
  cancellationReason: CancellationReason | null;
  confirmedAt: Date | null;
  editable: boolean;
  allowedTransitions: Status[];
};

export type CalendarEvent = {
  id: string;
  // "Name · Service", for the list view and the accessible name.
  title: string;
  patientLabel: string;
  serviceLabel: string;
  start: string;
  end: string;
  status: Status;
  editable: boolean;
};

export type PatientAppointmentItem = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  serviceName: string;
  customLabel: string | null;
  status: Status;
};

export type RescheduleInput = {
  startsAt: Date;
  endsAt: Date;
  acknowledgeWarnings: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Arbitrary constant: every agenda write of a clinic serializes on it,
// together with a hash of the clinic id.
const AGENDA_LOCK = 7_204_512;

const MINUTE = 60_000;
const PATIENT_LIST_LIMIT = 10;

const NOT_FOUND = "Atendimento não encontrado.";
const NOT_EDITABLE = "Este atendimento não pode mais ser alterado.";
const ANONYMIZED = "Paciente anonimizado não pode ser agendado.";
const PATIENT_MISSING = "Escolha um paciente cadastrado.";
const SERVICE_MISSING = "Escolha um serviço cadastrado.";
const SERVICE_INACTIVE = "Serviço inativo.";
const LABEL_REQUIRED = "Informe o rótulo deste atendimento.";
const LABEL_FORBIDDEN = "Este serviço não usa rótulo.";
const OVERLAP_RACE = "Este horário conflita com outro atendimento.";
const REASON_REQUIRED = "Escolha o motivo do cancelamento.";
const ALREADY_SUBMITTED =
  "Este formulário já foi enviado. Recarregue a página para criar outro agendamento.";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Fail = Extract<AppointmentResult, { ok: false }>;

type ServiceRow = {
  id: string;
  name: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  isFlexible: boolean;
  bookable: boolean;
};

// Never lets driver details (which can echo values) out of this module.
function unexpected(error: unknown): Error {
  return new Error("Não foi possível salvar o agendamento.", { cause: error });
}

const formFail = (formError: string): Fail => ({ ok: false, formError });
const fieldFail = (field: string, message: string): Fail => ({
  ok: false,
  fieldErrors: { [field]: message },
});

const minutesBetween = (startsAt: Date, endsAt: Date) =>
  Math.round((endsAt.getTime() - startsAt.getTime()) / MINUTE);

const period = (startsAt: Date, endsAt: Date) => ({
  startsAt: startsAt.toISOString(),
  endsAt: endsAt.toISOString(),
  durationMinutes: minutesBetween(startsAt, endsAt),
});

export async function lockAgenda(tx: Tx, clinicId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${AGENDA_LOCK}, hashtext(${clinicId}))`,
  );
}

async function lockPatient(
  tx: Tx,
  clinicId: string,
  patientId: string,
): Promise<Fail | null> {
  const [patient] = await tx
    .select({ anonymizedAt: patients.anonymizedAt })
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId)))
    .for("share");
  if (!patient) return fieldFail("patientId", PATIENT_MISSING);
  if (patient.anonymizedAt) return formFail(ANONYMIZED);
  return null;
}

// A service is bookable when it and its category are both active.
async function readService(
  tx: Tx,
  clinicId: string,
  serviceId: string,
): Promise<ServiceRow | undefined> {
  const [row] = await tx
    .select({
      id: services.id,
      name: services.name,
      durationMinutes: services.durationMinutes,
      bufferBeforeMinutes: services.bufferBeforeMinutes,
      bufferAfterMinutes: services.bufferAfterMinutes,
      isFlexible: services.isFlexible,
      bookable: sql<boolean>`${services.isActive} and ${serviceCategories.isActive}`,
    })
    .from(services)
    .innerJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
    .where(and(eq(services.id, serviceId), eq(services.clinicId, clinicId)))
    .limit(1);
  return row;
}

// `keptServiceId` is the appointment's current service, which stays allowed
// on edit even when it is no longer bookable.
function serviceRefusal(
  service: ServiceRow | undefined,
  customLabel: string | null,
  keptServiceId?: string,
): Fail | null {
  if (!service) return fieldFail("serviceId", SERVICE_MISSING);
  if (!service.bookable && service.id !== keptServiceId) {
    return fieldFail("serviceId", SERVICE_INACTIVE);
  }
  if (service.isFlexible && !customLabel) {
    return fieldFail("customLabel", LABEL_REQUIRED);
  }
  if (!service.isFlexible && customLabel) {
    return fieldFail("customLabel", LABEL_FORBIDDEN);
  }
  return null;
}

function occupiedRange(startsAt: Date, endsAt: Date, service: ServiceRow) {
  return {
    occupiedFrom: new Date(
      startsAt.getTime() - service.bufferBeforeMinutes * MINUTE,
    ),
    occupiedUntil: new Date(
      endsAt.getTime() + service.bufferAfterMinutes * MINUTE,
    ),
  };
}

// Pre-check with the same '[)' semantics as appointments_no_overlap. The
// message shows the other appointment's own times, never its patient.
async function overlapRefusal(
  tx: Tx,
  clinicId: string,
  range: { occupiedFrom: Date; occupiedUntil: Date },
  excludeId?: string,
): Promise<Fail | null> {
  const [other] = await tx
    .select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt })
    .from(appointments)
    .where(
      and(
        eq(appointments.clinicId, clinicId),
        inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
        lt(appointments.occupiedFrom, range.occupiedUntil),
        gt(appointments.occupiedUntil, range.occupiedFrom),
        excludeId ? ne(appointments.id, excludeId) : undefined,
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(1);
  if (!other) return null;
  return formFail(
    `Este horário conflita com outro atendimento das ${formatLocal(other.startsAt, "HH:mm")} às ${formatLocal(other.endsAt, "HH:mm")}.`,
  );
}

// Reads hours and blocks inside the transaction, only once every refusal
// has passed.
async function warningRefusal(
  tx: Tx,
  clinicId: string,
  startsAt: Date,
  endsAt: Date,
  now: Date,
  acknowledged: boolean,
): Promise<{ fail: Fail | null; codes: Warning["code"][] }> {
  const { hours, blocks } = await findBlocksAndHours(
    clinicId,
    { from: startsAt, to: endsAt },
    now,
    tx,
  );
  const warnings = checkWarnings({ startsAt, endsAt, hours, blocks, now });
  const codes = warnings.map((w) => w.code);
  if (warnings.length > 0 && !acknowledged) {
    return { fail: { ok: false, warnings }, codes };
  }
  return { fail: null, codes };
}

// Locks the patient, then the appointment. The patient id is read first
// without a lock; it never changes once the appointment exists. Status
// changes pass allowAnonymized: anonymization only rules out future active
// appointments, so past ones must stay correctable.
async function lockAppointment(
  tx: Tx,
  clinicId: string,
  id: string,
  options: { allowAnonymized?: boolean } = {},
) {
  const sameClinic = and(
    eq(appointments.id, id),
    eq(appointments.clinicId, clinicId),
  );
  const [ref] = await tx
    .select({ patientId: appointments.patientId })
    .from(appointments)
    .where(sameClinic);
  if (!ref) return { fail: formFail(NOT_FOUND) } as const;
  const patientFail = await lockPatient(tx, clinicId, ref.patientId);
  const skip = options.allowAnonymized && patientFail?.formError === ANONYMIZED;
  if (patientFail && !skip) {
    return {
      fail: patientFail.fieldErrors ? formFail(NOT_FOUND) : patientFail,
    } as const;
  }
  const [current] = await tx
    .select()
    .from(appointments)
    .where(sameClinic)
    .for("update");
  if (!current) return { fail: formFail(NOT_FOUND) } as const;
  return { current } as const;
}

function backstop(error: unknown): AppointmentResult {
  if (isAppointmentOverlapError(error)) return formFail(OVERLAP_RACE);
  throw unexpected(error);
}

const REPLAY_COLUMNS = {
  id: appointments.id,
  patientId: appointments.patientId,
  serviceId: appointments.serviceId,
  startsAt: appointments.startsAt,
};

// A repeated key is the same submit again only when it asks for the same
// patient, service and start. Anything else (say, a form restored by the
// browser's Back button) must not silently open the earlier appointment.
function replay(
  existing: {
    id: string;
    patientId: string;
    serviceId: string;
    startsAt: Date;
  },
  values: AppointmentFormValues,
): AppointmentResult {
  const same =
    existing.patientId === values.patientId &&
    existing.serviceId === values.serviceId &&
    existing.startsAt.getTime() === values.startsAt.getTime();
  return same ? { ok: true, id: existing.id } : formFail(ALREADY_SUBMITTED);
}

export async function createAppointment(
  clinicId: string,
  values: AppointmentFormValues,
  actorUserId: string,
  now: Date = new Date(),
): Promise<AppointmentResult> {
  if (!UUID_PATTERN.test(values.patientId)) {
    return fieldFail("patientId", PATIENT_MISSING);
  }
  if (!UUID_PATTERN.test(values.serviceId)) {
    return fieldFail("serviceId", SERVICE_MISSING);
  }
  if (!UUID_PATTERN.test(values.idempotencyKey)) {
    return formFail("Recarregue a página e tente de novo.");
  }
  try {
    return await db.transaction(async (tx): Promise<AppointmentResult> => {
      await lockAgenda(tx, clinicId);

      const [existing] = await tx
        .select(REPLAY_COLUMNS)
        .from(appointments)
        .where(
          and(
            eq(appointments.idempotencyKey, values.idempotencyKey),
            eq(appointments.clinicId, clinicId),
          ),
        )
        .limit(1);
      if (existing) return replay(existing, values);

      const patientFail = await lockPatient(tx, clinicId, values.patientId);
      if (patientFail) return patientFail;

      const service = await readService(tx, clinicId, values.serviceId);
      const serviceFail = serviceRefusal(service, values.customLabel);
      if (serviceFail || !service) return serviceFail!;

      const occupied = occupiedRange(values.startsAt, values.endsAt, service);
      const overlap = await overlapRefusal(tx, clinicId, occupied);
      if (overlap) return overlap;

      const warned = await warningRefusal(
        tx,
        clinicId,
        values.startsAt,
        values.endsAt,
        now,
        values.acknowledgeWarnings,
      );
      if (warned.fail) return warned.fail;

      const [row] = await tx
        .insert(appointments)
        .values({
          clinicId,
          patientId: values.patientId,
          serviceId: service.id,
          serviceName: service.name,
          serviceDurationMinutes: service.durationMinutes,
          customLabel: values.customLabel,
          startsAt: values.startsAt,
          endsAt: values.endsAt,
          ...occupied,
          status: "confirmed",
          source: "admin",
          confirmedAt: now,
          idempotencyKey: values.idempotencyKey,
        })
        .returning({ id: appointments.id });

      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: "appointment.created",
        entityType: "appointment",
        entityId: row!.id,
        changes: {
          patientId: values.patientId,
          serviceId: service.id,
          ...period(values.startsAt, values.endsAt),
          status: "confirmed",
          ...(warned.codes.length > 0 ? { warnings: warned.codes } : {}),
        },
      });
      return { ok: true, id: row!.id };
    });
  } catch (error) {
    if (isUniqueViolation(error, "appointments_idempotency_key_unique")) {
      const [existing] = await db
        .select(REPLAY_COLUMNS)
        .from(appointments)
        .where(
          and(
            eq(appointments.idempotencyKey, values.idempotencyKey),
            eq(appointments.clinicId, clinicId),
          ),
        )
        .limit(1);
      if (existing) return replay(existing, values);
    }
    return backstop(error);
  }
}

export type SessionSlot = { startsAt: Date; endsAt: Date };

export type SessionSlotProblem = {
  index: number;
  kind: "conflict" | "warning";
  message: string;
};

export type SessionBatchResult =
  | { ok: true; ids: string[] }
  | { ok: false; formError?: string; problems?: SessionSlotProblem[] };

// Creates the sessions of a package in one go, inside the caller's
// transaction, which must already hold lockAgenda for the clinic. Checks
// every slot first, against the agenda and against the other slots, and
// inserts nothing when a slot conflicts, or when one falls outside business
// hours, on a block or in the past and the admin has not acknowledged it.
// Sessions are confirmed admin appointments, like the ones from the agenda.
export async function insertSessionAppointments(
  tx: Tx,
  clinicId: string,
  input: {
    patientId: string;
    serviceId: string;
    slots: SessionSlot[];
    acknowledgeWarnings: boolean;
  },
  actorUserId: string,
  now: Date = new Date(),
): Promise<SessionBatchResult> {
  const patientFail = await lockPatient(tx, clinicId, input.patientId);
  if (patientFail) {
    return { ok: false, formError: patientFail.formError ?? PATIENT_MISSING };
  }
  const service = await readService(tx, clinicId, input.serviceId);
  if (!service) return { ok: false, formError: SERVICE_MISSING };
  if (service.isFlexible) {
    return {
      ok: false,
      formError: "Este serviço não pode ser agendado em pacote.",
    };
  }

  const ranges = input.slots.map((slot) =>
    occupiedRange(slot.startsAt, slot.endsAt, service),
  );
  const problems: SessionSlotProblem[] = [];
  for (const [index, slot] of input.slots.entries()) {
    const range = ranges[index]!;
    const clash = ranges.findIndex(
      (other, j) =>
        j < index &&
        other.occupiedFrom < range.occupiedUntil &&
        other.occupiedUntil > range.occupiedFrom,
    );
    if (clash >= 0) {
      problems.push({
        index,
        kind: "conflict",
        message: `Conflita com a sessão ${clash + 1} desta lista.`,
      });
      continue;
    }
    const overlap = await overlapRefusal(tx, clinicId, range);
    if (overlap) {
      problems.push({ index, kind: "conflict", message: overlap.formError! });
      continue;
    }
    const warned = await warningRefusal(
      tx,
      clinicId,
      slot.startsAt,
      slot.endsAt,
      now,
      input.acknowledgeWarnings,
    );
    for (const warning of warned.fail?.warnings ?? []) {
      problems.push({ index, kind: "warning", message: warning.message });
    }
  }
  if (problems.length > 0) return { ok: false, problems };

  const ids: string[] = [];
  for (const [index, slot] of input.slots.entries()) {
    const [row] = await tx
      .insert(appointments)
      .values({
        clinicId,
        patientId: input.patientId,
        serviceId: service.id,
        serviceName: service.name,
        serviceDurationMinutes: service.durationMinutes,
        customLabel: null,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        ...ranges[index]!,
        status: "confirmed",
        source: "admin",
        confirmedAt: now,
      })
      .returning({ id: appointments.id });
    ids.push(row!.id);
    await tx.insert(auditLogs).values({
      clinicId,
      actorType: "admin",
      actorUserId,
      action: "appointment.created",
      entityType: "appointment",
      entityId: row!.id,
      changes: {
        patientId: input.patientId,
        serviceId: service.id,
        ...period(slot.startsAt, slot.endsAt),
        status: "confirmed",
        package: true,
      },
    });
  }
  return { ok: true, ids };
}

// Changes the service, label, start and duration. The patient and the
// idempotency key in `values` are ignored. A change that touches the time
// or the service recomputes the occupied range with the service's current
// buffers.
export async function updateAppointment(
  clinicId: string,
  id: string,
  values: AppointmentFormValues,
  actorUserId: string,
  now: Date = new Date(),
): Promise<AppointmentResult> {
  if (!UUID_PATTERN.test(id)) return formFail(NOT_FOUND);
  if (!UUID_PATTERN.test(values.serviceId)) {
    return fieldFail("serviceId", SERVICE_MISSING);
  }
  try {
    return await db.transaction(async (tx): Promise<AppointmentResult> => {
      await lockAgenda(tx, clinicId);
      const locked = await lockAppointment(tx, clinicId, id);
      if (locked.fail) return locked.fail;
      const { current } = locked;
      if (!isEditableStatus(current.status)) return formFail(NOT_EDITABLE);

      const service = await readService(tx, clinicId, values.serviceId);
      const serviceFail = serviceRefusal(
        service,
        values.customLabel,
        current.serviceId,
      );
      if (serviceFail || !service) return serviceFail!;

      const serviceChanged = service.id !== current.serviceId;
      const labelChanged = values.customLabel !== current.customLabel;
      const timeChanged =
        values.startsAt.getTime() !== current.startsAt.getTime() ||
        values.endsAt.getTime() !== current.endsAt.getTime();
      if (!serviceChanged && !labelChanged && !timeChanged) {
        return { ok: true, id };
      }

      let occupied: { occupiedFrom: Date; occupiedUntil: Date } | undefined;
      if (serviceChanged || timeChanged) {
        occupied = occupiedRange(values.startsAt, values.endsAt, service);
        const overlap = await overlapRefusal(tx, clinicId, occupied, id);
        if (overlap) return overlap;
      }

      let codes: Warning["code"][] = [];
      if (timeChanged) {
        const warned = await warningRefusal(
          tx,
          clinicId,
          values.startsAt,
          values.endsAt,
          now,
          values.acknowledgeWarnings,
        );
        if (warned.fail) return warned.fail;
        codes = warned.codes;
      }

      await tx
        .update(appointments)
        .set({
          serviceId: service.id,
          ...(serviceChanged
            ? {
                serviceName: service.name,
                serviceDurationMinutes: service.durationMinutes,
              }
            : {}),
          customLabel: values.customLabel,
          startsAt: values.startsAt,
          endsAt: values.endsAt,
          ...occupied,
        })
        .where(
          and(eq(appointments.id, id), eq(appointments.clinicId, clinicId)),
        );

      const serviceChanges = serviceChanged
        ? {
            serviceChanged: true,
            fromServiceId: current.serviceId,
            toServiceId: service.id,
          }
        : {};
      const labelChanges = labelChanged ? { labelChanged: true } : {};
      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: timeChanged ? "appointment.rescheduled" : "appointment.updated",
        entityType: "appointment",
        entityId: id,
        changes: timeChanged
          ? {
              from: period(current.startsAt, current.endsAt),
              to: period(values.startsAt, values.endsAt),
              ...serviceChanges,
              ...labelChanges,
              ...(codes.length > 0 ? { warnings: codes } : {}),
            }
          : { ...serviceChanges, ...labelChanges },
      });
      if (timeChanged) await syncSessionInstallment(tx, clinicId, id);
      return { ok: true, id };
    });
  } catch (error) {
    return backstop(error);
  }
}

// For drag and resize on the calendar: the same rules as an edit that keeps
// the service and the label.
export async function rescheduleAppointment(
  clinicId: string,
  id: string,
  input: RescheduleInput,
  actorUserId: string,
  now: Date = new Date(),
): Promise<AppointmentResult> {
  if (!UUID_PATTERN.test(id)) return formFail(NOT_FOUND);
  try {
    return await db.transaction(async (tx): Promise<AppointmentResult> => {
      await lockAgenda(tx, clinicId);
      const locked = await lockAppointment(tx, clinicId, id);
      if (locked.fail) return locked.fail;
      const { current } = locked;
      if (!isEditableStatus(current.status)) return formFail(NOT_EDITABLE);

      const service = await readService(tx, clinicId, current.serviceId);
      if (!service) return formFail(NOT_FOUND);

      if (
        input.startsAt.getTime() === current.startsAt.getTime() &&
        input.endsAt.getTime() === current.endsAt.getTime()
      ) {
        return { ok: true, id };
      }

      const occupied = occupiedRange(input.startsAt, input.endsAt, service);
      const overlap = await overlapRefusal(tx, clinicId, occupied, id);
      if (overlap) return overlap;

      const warned = await warningRefusal(
        tx,
        clinicId,
        input.startsAt,
        input.endsAt,
        now,
        input.acknowledgeWarnings,
      );
      if (warned.fail) return warned.fail;

      await tx
        .update(appointments)
        .set({ startsAt: input.startsAt, endsAt: input.endsAt, ...occupied })
        .where(
          and(eq(appointments.id, id), eq(appointments.clinicId, clinicId)),
        );
      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: "appointment.rescheduled",
        entityType: "appointment",
        entityId: id,
        changes: {
          from: period(current.startsAt, current.endsAt),
          to: period(input.startsAt, input.endsAt),
          ...(warned.codes.length > 0 ? { warnings: warned.codes } : {}),
        },
      });
      await syncSessionInstallment(tx, clinicId, id);
      return { ok: true, id };
    });
  } catch (error) {
    return backstop(error);
  }
}

const isReason = (value: unknown): value is CancellationReason =>
  typeof value === "string" && Object.hasOwn(CANCELLATION_REASON_LABELS, value);

export async function changeAppointmentStatus(
  clinicId: string,
  id: string,
  input: { to: Status; reason?: CancellationReason },
  actorUserId: string,
  now: Date = new Date(),
): Promise<AppointmentResult> {
  if (!UUID_PATTERN.test(id)) return formFail(NOT_FOUND);
  if (!APPOINTMENT_STATUSES.includes(input.to)) {
    return fieldFail("to", "Escolha o novo status.");
  }
  if (input.to === "cancelled" && !isReason(input.reason)) {
    return fieldFail("reason", REASON_REQUIRED);
  }
  try {
    return await db.transaction(async (tx): Promise<AppointmentResult> => {
      await lockAgenda(tx, clinicId);
      const locked = await lockAppointment(tx, clinicId, id, {
        allowAnonymized: true,
      });
      if (locked.fail) return locked.fail;
      const { current } = locked;

      const allowed = canTransition(
        current.status,
        input.to,
        current.startsAt,
        now,
      );
      if (!allowed.ok) return formFail(allowed.message);

      const reason = input.to === "cancelled" ? input.reason! : undefined;
      await tx
        .update(appointments)
        .set({
          status: input.to,
          ...(input.to === "confirmed" ? { confirmedAt: now } : {}),
          ...(reason
            ? {
                cancelledAt: now,
                cancelledBy: "clinic" as const,
                cancellationReason: reason,
              }
            : {}),
        })
        .where(
          and(eq(appointments.id, id), eq(appointments.clinicId, clinicId)),
        );
      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: "appointment.status_changed",
        entityType: "appointment",
        entityId: id,
        changes: {
          from: current.status,
          to: input.to,
          ...(reason ? { reason } : {}),
        },
      });
      await syncSessionInstallment(tx, clinicId, id);
      return { ok: true, id };
    });
  } catch (error) {
    return backstop(error);
  }
}

// The nickname, else the first word of the name. Anonymized patients only
// have past appointments, shown with the fixed label.
function displayName(patient: {
  name: string;
  nickname: string | null;
  anonymizedAt: Date | null;
}): string {
  if (patient.anonymizedAt) return ANONYMIZED_NAME;
  const nickname = patient.nickname?.trim();
  if (nickname) return nickname;
  return patient.name.trim().split(/\s+/)[0] ?? patient.name;
}

export async function getAppointment(
  clinicId: string,
  id: string,
  now: Date = new Date(),
): Promise<AppointmentRecord | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const [row] = await db
    .select({
      id: appointments.id,
      patientId: appointments.patientId,
      patientName: patients.name,
      anonymizedAt: patients.anonymizedAt,
      serviceId: appointments.serviceId,
      serviceName: appointments.serviceName,
      isFlexible: services.isFlexible,
      customLabel: appointments.customLabel,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
      source: appointments.source,
      cancellationReason: appointments.cancellationReason,
      confirmedAt: appointments.confirmedAt,
    })
    .from(appointments)
    .innerJoin(patients, eq(appointments.patientId, patients.id))
    .innerJoin(services, eq(appointments.serviceId, services.id))
    .where(and(eq(appointments.id, id), eq(appointments.clinicId, clinicId)))
    .limit(1);
  if (!row) return null;
  // Anonymized patients cannot be (re)scheduled, but their appointments
  // still take status corrections.
  const writable = !row.anonymizedAt;
  return {
    id: row.id,
    patientId: row.patientId,
    patientName: row.anonymizedAt ? ANONYMIZED_NAME : row.patientName,
    serviceId: row.serviceId,
    serviceName: row.serviceName,
    isFlexible: row.isFlexible,
    customLabel: row.customLabel,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    durationMinutes: minutesBetween(row.startsAt, row.endsAt),
    status: row.status,
    source: row.source,
    cancellationReason: isReason(row.cancellationReason)
      ? row.cancellationReason
      : null,
    confirmedAt: row.confirmedAt,
    editable: writable && isEditableStatus(row.status),
    allowedTransitions: APPOINTMENT_STATUSES.filter(
      (to) => canTransition(row.status, to, row.startsAt, now).ok,
    ),
  };
}

const calendarColumns = {
  id: appointments.id,
  startsAt: appointments.startsAt,
  endsAt: appointments.endsAt,
  status: appointments.status,
  serviceName: appointments.serviceName,
  customLabel: appointments.customLabel,
  name: patients.name,
  nickname: patients.nickname,
  anonymizedAt: patients.anonymizedAt,
};

function toCalendarEvent(row: {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: Status;
  serviceName: string;
  customLabel: string | null;
  name: string;
  nickname: string | null;
  anonymizedAt: Date | null;
}): CalendarEvent {
  const patientLabel = displayName(row);
  const serviceLabel = row.customLabel ?? row.serviceName;
  return {
    id: row.id,
    title: `${patientLabel} · ${serviceLabel}`,
    patientLabel,
    serviceLabel,
    start: row.startsAt.toISOString(),
    end: row.endsAt.toISOString(),
    status: row.status,
    editable: !row.anonymizedAt && isEditableStatus(row.status),
  };
}

// Appointments that intersect [from, to), ordered by start.
export async function listAppointmentsInRange(
  clinicId: string,
  input: {
    from: Date;
    to: Date;
    includeCancelled: boolean;
  },
): Promise<CalendarEvent[]> {
  const rows = await db
    .select(calendarColumns)
    .from(appointments)
    .innerJoin(patients, eq(appointments.patientId, patients.id))
    .where(
      and(
        eq(appointments.clinicId, clinicId),
        lt(appointments.startsAt, input.to),
        gt(appointments.endsAt, input.from),
        input.includeCancelled
          ? undefined
          : ne(appointments.status, "cancelled"),
      ),
    )
    .orderBy(asc(appointments.startsAt), asc(appointments.id));
  return rows.map(toCalendarEvent);
}

export type RequestedItem = CalendarEvent & { requiresApproval: boolean };

const pendingFrom = (clinicId: string, now: Date) =>
  and(
    eq(appointments.clinicId, clinicId),
    eq(appointments.status, "requested"),
    gte(appointments.startsAt, now),
  );

// Requested appointments that start at or after `now`, ordered by start:
// the ones still waiting for the admin's confirmation.
export async function listRequestedFrom(
  clinicId: string,
  now: Date = new Date(),
): Promise<RequestedItem[]> {
  const rows = await db
    .select({ ...calendarColumns, requiresApproval: services.requiresApproval })
    .from(appointments)
    .innerJoin(patients, eq(appointments.patientId, patients.id))
    .innerJoin(services, eq(appointments.serviceId, services.id))
    .where(pendingFrom(clinicId, now))
    .orderBy(asc(appointments.startsAt), asc(appointments.id));
  return rows.map((row) => ({
    ...toCalendarEvent(row),
    requiresApproval: row.requiresApproval,
  }));
}

// How many of those there are, for the menu badge.
export async function countRequestedFrom(
  clinicId: string,
  now: Date = new Date(),
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(appointments)
    .where(pendingFrom(clinicId, now));
  return row?.count ?? 0;
}

// The next and the latest appointments of a patient, every status included.
export async function listPatientAppointments(
  clinicId: string,
  patientId: string,
  now: Date = new Date(),
): Promise<{
  upcoming: PatientAppointmentItem[];
  past: PatientAppointmentItem[];
}> {
  if (!UUID_PATTERN.test(patientId)) return { upcoming: [], past: [] };
  const columns = {
    id: appointments.id,
    startsAt: appointments.startsAt,
    endsAt: appointments.endsAt,
    serviceName: appointments.serviceName,
    customLabel: appointments.customLabel,
    status: appointments.status,
  };
  const [upcoming, past] = await Promise.all([
    db
      .select(columns)
      .from(appointments)
      .where(
        and(
          eq(appointments.clinicId, clinicId),
          eq(appointments.patientId, patientId),
          gte(appointments.startsAt, now),
        ),
      )
      .orderBy(asc(appointments.startsAt), asc(appointments.id))
      .limit(PATIENT_LIST_LIMIT),
    db
      .select(columns)
      .from(appointments)
      .where(
        and(
          eq(appointments.clinicId, clinicId),
          eq(appointments.patientId, patientId),
          lt(appointments.startsAt, now),
        ),
      )
      .orderBy(desc(appointments.startsAt), desc(appointments.id))
      .limit(PATIENT_LIST_LIMIT),
  ]);
  return { upcoming, past };
}
