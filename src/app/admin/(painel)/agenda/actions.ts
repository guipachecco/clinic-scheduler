"use server";

import { DateTime } from "luxon";
import { revalidatePath } from "next/cache";
import * as z from "zod";

import {
  changeAppointmentStatus,
  createAppointment,
  listAppointmentsInRange,
  rescheduleAppointment,
  updateAppointment,
  type AppointmentResult,
  type CalendarEvent,
} from "@/modules/appointments/appointments";
import {
  appointmentFormSchema,
  rescheduleSchema,
  statusChangeSchema,
  type AppointmentFormInput,
  type RescheduleFormInput,
  type StatusChangeInput,
} from "@/modules/appointments/fields";
import { moduleActive, requireAdmin } from "@/modules/auth/session";
import { MODULE_OFF_ERROR } from "@/modules/clinics/modules";
import { TIME_BLOCK_TYPES } from "@/modules/schedule/fields";
import { findBlocksAndHours } from "@/modules/schedule/schedule";
import { usageSchema, type UsageInput } from "@/modules/stock/fields";
import { recordUsage, reverseMovement } from "@/modules/stock/stock";

// Server Actions for the calendar and the appointment pages. Each one checks the session first, returns
// values (never a redirect) and turns unexpected errors into a generic
// message. The visible range travels in the action body, never in the URL.

const LOAD_ERROR = "Não foi possível carregar a agenda. Tente novamente.";
const SAVE_ERROR = "Não foi possível remarcar. Tente novamente.";
const FORM_ERROR = "Não foi possível salvar o agendamento. Tente novamente.";
const STATUS_ERROR = "Não foi possível mudar o status. Tente novamente.";

// The month view spans six weeks; anything much longer is not a calendar view.
const MAX_RANGE_DAYS = 62;

const instant = z
  .string()
  .refine(
    (value) =>
      /(Z|[+-]\d{2}:?\d{2})$/.test(value) && DateTime.fromISO(value).isValid,
  )
  .transform((value) => DateTime.fromISO(value).toJSDate());

const rangeSchema = z
  .object({
    from: instant,
    to: instant,
    includeCancelled: z.boolean(),
  })
  .refine(
    ({ from, to }) =>
      to > from && to.getTime() - from.getTime() <= MAX_RANGE_DAYS * 86_400_000,
  );

export type CalendarBlock = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
};

const blockTypeLabel = (type: string) =>
  TIME_BLOCK_TYPES.find((item) => item.value === type)?.label ?? "Bloqueio";

export type LoadCalendarResult =
  | { ok: true; events: CalendarEvent[]; blocks: CalendarBlock[] }
  | { ok: false; formError: string };

export async function loadCalendarAction(input: {
  from: string;
  to: string;
  includeCancelled: boolean;
}): Promise<LoadCalendarResult> {
  const { clinicId } = await requireAdmin();
  const parsed = rangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, formError: LOAD_ERROR };
  const { from, to, includeCancelled } = parsed.data;

  try {
    const [events, { blocks }] = await Promise.all([
      listAppointmentsInRange(clinicId, { from, to, includeCancelled }),
      findBlocksAndHours(clinicId, { from, to }),
    ]);
    return {
      ok: true,
      events,
      blocks: blocks.map((block) => ({
        id: block.id,
        title: block.title ?? blockTypeLabel(block.type),
        start: block.startsAt.toISOString(),
        end: block.endsAt.toISOString(),
        allDay: block.allDay,
      })),
    };
  } catch {
    return { ok: false, formError: LOAD_ERROR };
  }
}

export async function rescheduleAction(
  input: RescheduleFormInput,
): Promise<AppointmentResult> {
  const session = await requireAdmin();
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      formError: parsed.error.issues[0]?.message ?? SAVE_ERROR,
    };
  }
  const { id, startsAt, endsAt, acknowledgeWarnings } = parsed.data;

  try {
    return await rescheduleAppointment(
      session.clinicId,
      id,
      { startsAt, endsAt, acknowledgeWarnings },
      session.user.id,
    );
  } catch {
    return { ok: false, formError: SAVE_ERROR };
  }
}

type Failure = Extract<AppointmentResult, { ok: false }>;

// Zod issues keyed by the form field. The schema's final transform builds
// startsAt and endsAt, so its own issues (none today) would have no field.
function fieldErrorsOf(issues: z.ZodError["issues"]): Failure {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) {
      fieldErrors[key] = issue.message;
    }
  }
  return Object.keys(fieldErrors).length > 0
    ? { ok: false, fieldErrors }
    : { ok: false, formError: issues[0]?.message ?? FORM_ERROR };
}

export async function createAppointmentAction(
  input: AppointmentFormInput,
): Promise<AppointmentResult> {
  const session = await requireAdmin();
  const parsed = appointmentFormSchema.safeParse(input);
  if (!parsed.success) return fieldErrorsOf(parsed.error.issues);
  try {
    return await createAppointment(
      session.clinicId,
      parsed.data,
      session.user.id,
    );
  } catch {
    return { ok: false, formError: FORM_ERROR };
  }
}

export async function updateAppointmentAction(
  id: string,
  input: AppointmentFormInput,
): Promise<AppointmentResult> {
  const session = await requireAdmin();
  if (!z.uuid().safeParse(id).success) {
    return { ok: false, formError: "Atendimento não encontrado." };
  }
  const parsed = appointmentFormSchema.safeParse(input);
  if (!parsed.success) return fieldErrorsOf(parsed.error.issues);
  try {
    return await updateAppointment(
      session.clinicId,
      id,
      parsed.data,
      session.user.id,
    );
  } catch {
    return { ok: false, formError: FORM_ERROR };
  }
}

export async function changeStatusAction(
  input: StatusChangeInput,
): Promise<AppointmentResult> {
  const session = await requireAdmin();
  const parsed = statusChangeSchema.safeParse(input);
  if (!parsed.success) return fieldErrorsOf(parsed.error.issues);
  const { id, ...change } = parsed.data;
  try {
    return await changeAppointmentStatus(
      session.clinicId,
      id,
      change,
      session.user.id,
    );
  } catch {
    return { ok: false, formError: STATUS_ERROR };
  }
}

// ------------------------------------------------------------ stock usage

type UsageFieldErrors = {
  productId?: string;
  quantity?: string;
  saleItemId?: string;
};

export type UsageActionResult =
  | { ok: true }
  | { ok: false; fieldErrors: UsageFieldErrors; formError?: string };

const USAGE_ERROR = "Não foi possível salvar o produto. Tente novamente.";

const usageFailure = (formError: string): UsageActionResult => ({
  ok: false,
  fieldErrors: {},
  formError,
});

// The stock changed: the appointment, the product pages (balance and
// history) and the sale pages ("Produtos da venda") show it.
function revalidateStock(appointmentId: string) {
  revalidatePath(`/admin/agenda/${appointmentId}`);
  revalidatePath("/admin/produtos", "layout");
  revalidatePath("/admin/financeiro/vendas", "layout");
}

// "Produtos usados" > "Registrar". Needs the products module; counting the
// usage against a sale ("Conta na venda nº X") needs finance too.
export async function recordUsageAction(
  appointmentId: string,
  input: UsageInput,
): Promise<UsageActionResult> {
  const session = await requireAdmin();
  if (!moduleActive(session, "products")) return usageFailure(MODULE_OFF_ERROR);
  if (!z.uuid().safeParse(appointmentId).success) {
    return usageFailure("Atendimento não encontrado.");
  }
  const parsed = usageSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: UsageFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (
        (key === "productId" || key === "quantity" || key === "saleItemId") &&
        !(key in fieldErrors)
      ) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, fieldErrors };
  }
  if (parsed.data.saleItemId && !moduleActive(session, "finance")) {
    return usageFailure(MODULE_OFF_ERROR);
  }
  let result;
  try {
    result = await recordUsage(
      session.clinicId,
      appointmentId,
      parsed.data,
      session.user.id,
    );
  } catch {
    return usageFailure(USAGE_ERROR);
  }
  if (!result.ok) return usageFailure(result.formError);
  revalidateStock(appointmentId);
  return { ok: true };
}

// "Desfazer" on a product used in the appointment.
export async function reverseUsageAction(
  appointmentId: string,
  movementId: string,
): Promise<UsageActionResult> {
  const session = await requireAdmin();
  if (!moduleActive(session, "products")) return usageFailure(MODULE_OFF_ERROR);
  if (
    !z.uuid().safeParse(appointmentId).success ||
    !z.uuid().safeParse(movementId).success
  ) {
    return usageFailure("Movimento não encontrado.");
  }
  let result;
  try {
    result = await reverseMovement(
      session.clinicId,
      movementId,
      session.user.id,
    );
  } catch {
    return usageFailure(USAGE_ERROR);
  }
  if (!result.ok) return usageFailure(result.formError);
  revalidateStock(appointmentId);
  return { ok: true };
}
