"use server";

import * as z from "zod";

import { requireAdmin } from "@/modules/auth/session";
import {
  businessHoursSchema,
  timeBlockSchema,
  type BusinessHoursInput,
  type TimeBlockInput,
} from "@/modules/schedule/fields";
import {
  addNationalHolidays,
  createTimeBlock,
  deleteTimeBlock,
  saveBusinessHours,
} from "@/modules/schedule/schedule";
import { todayLocal } from "@/modules/schedule/time";

// Server Actions for business hours and time blocks. Each one checks the
// session first, returns values (never a redirect) and turns unexpected errors
// into a generic message.

const GENERIC_ERROR = "Não foi possível salvar. Tente novamente.";

export type ActionFailure = {
  ok: false;
  // Keys are dotted paths such as "days.1.intervals.0" or "startDate".
  fieldErrors: Record<string, string>;
  formError?: string;
};

const failure = (formError: string): ActionFailure => ({
  ok: false,
  fieldErrors: {},
  formError,
});

function collectErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function saveBusinessHoursAction(
  input: BusinessHoursInput,
): Promise<{ ok: true } | ActionFailure> {
  const session = await requireAdmin();
  const parsed = businessHoursSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectErrors(parsed.error) };
  }
  try {
    await saveBusinessHours(session.clinicId, parsed.data, session.user.id);
  } catch {
    return failure(GENERIC_ERROR);
  }
  return { ok: true };
}

export async function createTimeBlockAction(
  input: TimeBlockInput,
): Promise<{ ok: true; conflicts: string[] } | ActionFailure> {
  const session = await requireAdmin();
  const parsed = timeBlockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectErrors(parsed.error) };
  }
  try {
    const result = await createTimeBlock(
      session.clinicId,
      parsed.data,
      session.user.id,
    );
    return { ok: true, conflicts: result.conflicts };
  } catch {
    return failure(GENERIC_ERROR);
  }
}

export async function deleteTimeBlockAction(
  id: string,
): Promise<{ ok: true } | ActionFailure> {
  const session = await requireAdmin();
  try {
    const result = await deleteTimeBlock(session.clinicId, id, session.user.id);
    if (result.ok) return { ok: true };
    return failure(
      result.reason === "not_found"
        ? "Bloqueio não encontrado."
        : "Só é possível excluir bloqueios que ainda não começaram.",
    );
  } catch {
    return failure("Não foi possível excluir. Tente novamente.");
  }
}

export async function addNationalHolidaysAction(
  year: number,
): Promise<{ ok: true; created: number } | ActionFailure> {
  const session = await requireAdmin();
  const current = Number(todayLocal().slice(0, 4));
  if (year !== current && year !== current + 1) {
    return failure("Escolha o ano atual ou o próximo.");
  }
  try {
    const result = await addNationalHolidays(
      session.clinicId,
      year,
      session.user.id,
    );
    return { ok: true, created: result.created };
  } catch {
    return failure("Não foi possível adicionar os feriados. Tente novamente.");
  }
}
