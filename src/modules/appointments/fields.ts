import { DateTime } from "luxon";
import * as z from "zod";

import type {
  appointmentStatus,
  CANCELLATION_REASONS,
} from "@/db/schema/clinic";
import { CLINIC_TIME_ZONE, localToUtc } from "@/modules/schedule/time";

// Form schemas, labels and status transition rules for appointments.
// Imported by client components, so no database or server-only code here
// (the schema imports above are type-only).

export const APPOINTMENT_STATUSES = [
  "requested",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
] as const satisfies readonly (typeof appointmentStatus.enumValues)[number][];

export type Status = (typeof APPOINTMENT_STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  requested: "Solicitado",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  completed: "Concluído",
  no_show: "Falta",
};

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export const CANCELLATION_REASON_LABELS: Record<CancellationReason, string> = {
  patient_request: "Pedido do paciente",
  rescheduled: "Remarcado",
  clinic_unavailable: "Clínica indisponível",
  other: "Outro",
};

const REASON_CODES = Object.keys(CANCELLATION_REASON_LABELS) as [
  CancellationReason,
  ...CancellationReason[],
];

// Only these can be edited, moved or resized.
export function isEditableStatus(status: Status): boolean {
  return status === "requested" || status === "confirmed";
}

const ALLOWED: Record<Status, readonly Status[]> = {
  requested: ["confirmed", "cancelled"],
  confirmed: ["cancelled", "completed", "no_show"],
  completed: ["no_show"],
  no_show: ["completed"],
  cancelled: [],
};

const AFTER_START_MESSAGE = "Só depois do horário de início.";

export function canTransition(
  from: Status,
  to: Status,
  startsAt: Date,
  now: Date,
): { ok: true } | { ok: false; message: string } {
  if (from === "cancelled") {
    return {
      ok: false,
      message: "Um atendimento cancelado não pode mudar de status.",
    };
  }
  if (from === to) {
    return { ok: false, message: "O atendimento já está neste status." };
  }
  if (!ALLOWED[from].includes(to)) {
    return { ok: false, message: "Mudança de status não permitida." };
  }
  if ((to === "completed" || to === "no_show") && now < startsAt) {
    return { ok: false, message: AFTER_START_MESSAGE };
  }
  return { ok: true };
}

const TIME_MESSAGE = "Use horários de 5 em 5 minutos (HH:MM).";
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DURATION_MESSAGE = "A duração deve ser de 5 a 720 minutos.";
export const MIN_DURATION_MINUTES = 5;
export const MAX_DURATION_MINUTES = 720;
export const LABEL_MAX_LENGTH = 60;

// Checkboxes: true / "on" when ticked, absent when not.
const checkbox = z
  .union([z.boolean(), z.literal("on")])
  .optional()
  .transform((value) => value === true || value === "on");

export const appointmentFormSchema = z
  .object({
    patientId: z.uuid("Escolha o paciente."),
    serviceId: z.uuid("Escolha o serviço."),
    // Required or forbidden depending on the service; the data layer checks.
    customLabel: z
      .string()
      .trim()
      .max(
        LABEL_MAX_LENGTH,
        `O rótulo pode ter no máximo ${LABEL_MAX_LENGTH} caracteres.`,
      )
      .optional()
      .transform((value) => (value ? value : null)),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida.")
      .refine(
        (value) => DateTime.fromISO(value).isValid,
        "Informe uma data válida.",
      ),
    startTime: z
      .string()
      .regex(TIME_PATTERN, TIME_MESSAGE)
      .refine((value) => Number(value.slice(3)) % 5 === 0, TIME_MESSAGE),
    // Number inputs arrive as text.
    durationMinutes: z
      .union([z.string(), z.number()])
      .transform((value, ctx): number => {
        const text = String(value).trim();
        const number = /^\d+$/.test(text) ? Number(text) : NaN;
        if (
          !Number.isSafeInteger(number) ||
          number < MIN_DURATION_MINUTES ||
          number > MAX_DURATION_MINUTES
        ) {
          ctx.addIssue({ code: "custom", message: DURATION_MESSAGE });
          return z.NEVER;
        }
        return number;
      }),
    idempotencyKey: z.uuid("Recarregue a página e tente de novo."),
    acknowledgeWarnings: checkbox,
  })
  .transform((value) => {
    // A wall-clock time in a DST gap moves forward (see localToUtc).
    const startsAt = localToUtc(value.date, value.startTime);
    return {
      patientId: value.patientId,
      serviceId: value.serviceId,
      customLabel: value.customLabel,
      startsAt,
      endsAt: new Date(startsAt.getTime() + value.durationMinutes * 60_000),
      durationMinutes: value.durationMinutes,
      idempotencyKey: value.idempotencyKey,
      acknowledgeWarnings: value.acknowledgeWarnings,
    };
  });

export type AppointmentFormInput = z.input<typeof appointmentFormSchema>;
export type AppointmentFormValues = z.output<typeof appointmentFormSchema>;

// An ISO instant with an explicit offset, so the machine zone never matters.
const instant = z
  .string()
  .refine(
    (value) =>
      /(Z|[+-]\d{2}:?\d{2})$/.test(value) && DateTime.fromISO(value).isValid,
    "Horário inválido.",
  )
  .transform((value) => DateTime.fromISO(value).toJSDate());

// From a calendar drag or resize. The start keeps the 5-minute step in the
// clinic zone; the duration is free within 5 to 720 whole minutes.
export const rescheduleSchema = z
  .object({
    id: z.uuid(),
    startsAt: instant,
    endsAt: instant,
    acknowledgeWarnings: checkbox,
  })
  .superRefine((value, ctx) => {
    // Zod still runs this when a field failed; there is nothing to check then.
    if (!(value.startsAt instanceof Date) || !(value.endsAt instanceof Date)) {
      return;
    }
    const local = DateTime.fromJSDate(value.startsAt, {
      zone: CLINIC_TIME_ZONE,
    });
    if (
      local.second !== 0 ||
      local.millisecond !== 0 ||
      local.minute % 5 !== 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: TIME_MESSAGE,
      });
    }
    const minutes =
      (value.endsAt.getTime() - value.startsAt.getTime()) / 60_000;
    if (
      !Number.isInteger(minutes) ||
      minutes < MIN_DURATION_MINUTES ||
      minutes > MAX_DURATION_MINUTES
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: DURATION_MESSAGE,
      });
    }
  });

export type RescheduleFormInput = z.input<typeof rescheduleSchema>;

// Cancelling needs a reason code; no free text, so no personal data.
export const statusChangeSchema = z
  .object({
    id: z.uuid(),
    to: z.enum(APPOINTMENT_STATUSES, "Escolha o novo status."),
    reason: z.string().optional(),
  })
  .transform((value, ctx) => {
    if (value.to !== "cancelled") return { id: value.id, to: value.to };
    const reason = REASON_CODES.find((code) => code === value.reason);
    if (!reason) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Escolha o motivo do cancelamento.",
      });
      return z.NEVER;
    }
    return { id: value.id, to: value.to, reason };
  });

export type StatusChangeInput = z.input<typeof statusChangeSchema>;
