"use server";

import { redirect } from "next/navigation";
import * as z from "zod";

import { requireAdmin } from "@/modules/auth/session";
import {
  patientFormSchema,
  type PatientFormInput,
} from "@/modules/patients/fields";
import {
  anonymizePatient,
  createPatient,
  searchPatients,
  updatePatient,
  type PatientCursor,
  type PatientListItem,
} from "@/modules/patients/patients";

// Server Actions for the patient registry. Each one checks the session first.
// Nothing here logs patient data, and unexpected errors (whose messages may
// carry patient values) never reach the client: they become a generic message.

const GENERIC_ERROR = "Não foi possível salvar. Tente novamente.";

export type SaveResult = {
  ok: false;
  fieldErrors: Partial<Record<keyof PatientFormInput, string>>;
  existingPatientId?: string;
  formError?: string;
};

export type SearchResult = {
  items: PatientListItem[];
  next?: PatientCursor;
  error?: string;
};

export type AnonymizeResult = { ok: false; message: string };

const searchSchema = z.object({
  term: z.string().max(100),
  after: z
    .object({
      nameNormalized: z.string().max(200),
      id: z.uuid(),
    })
    .optional(),
});

const idSchema = z.uuid();

function parseForm(
  input: unknown,
):
  | { ok: true; values: z.output<typeof patientFormSchema> }
  | { ok: false; result: SaveResult } {
  const parsed = patientFormSchema.safeParse(input);
  if (parsed.success) return { ok: true, values: parsed.data };
  const fieldErrors: SaveResult["fieldErrors"] = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as keyof PatientFormInput | undefined;
    if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return { ok: false, result: { ok: false, fieldErrors } };
}

export async function searchPatientsAction(input: {
  term: string;
  after?: PatientCursor;
}): Promise<SearchResult> {
  await requireAdmin();
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) {
    return { items: [], error: "Busca inválida. Tente novamente." };
  }
  try {
    return await searchPatients(parsed.data);
  } catch {
    return { items: [], error: "Não foi possível buscar. Tente novamente." };
  }
}

export async function createPatientAction(
  input: PatientFormInput,
): Promise<SaveResult> {
  const session = await requireAdmin();
  const parsed = parseForm(input);
  if (!parsed.ok) return parsed.result;

  let result;
  try {
    result = await createPatient(parsed.values, session.user.id);
  } catch {
    return { ok: false, fieldErrors: {}, formError: GENERIC_ERROR };
  }
  if (!result.ok) return result;
  redirect(`/admin/pacientes/${result.id}`);
}

export async function updatePatientAction(
  id: string,
  input: PatientFormInput,
): Promise<SaveResult> {
  const session = await requireAdmin();
  if (!idSchema.safeParse(id).success) {
    return { ok: false, fieldErrors: {}, formError: GENERIC_ERROR };
  }
  const parsed = parseForm(input);
  if (!parsed.ok) return parsed.result;

  let result;
  try {
    result = await updatePatient(id, parsed.values, session.user.id);
  } catch {
    return { ok: false, fieldErrors: {}, formError: GENERIC_ERROR };
  }
  if (!result.ok) {
    const empty = Object.keys(result.fieldErrors).length === 0;
    return empty
      ? { ...result, formError: "Paciente não encontrado." }
      : result;
  }
  redirect(`/admin/pacientes/${result.id}`);
}

export async function anonymizePatientAction(
  id: string,
  confirmation: string,
): Promise<AnonymizeResult> {
  const session = await requireAdmin();
  if (!idSchema.safeParse(id).success || confirmation !== "ANONIMIZAR") {
    return { ok: false, message: "Confirmação inválida." };
  }
  let result;
  try {
    result = await anonymizePatient(id, session.user.id);
  } catch {
    return {
      ok: false,
      message: "Não foi possível anonimizar. Tente novamente.",
    };
  }
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.reason === "has_future_appointments"
          ? "Este paciente tem consultas futuras. Cancele-as antes de anonimizar."
          : "Paciente não encontrado.",
    };
  }
  redirect(`/admin/pacientes/${id}`);
}
