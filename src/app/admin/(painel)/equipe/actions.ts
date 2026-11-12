"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import { requireAdmin } from "@/modules/auth/session";
import {
  professionalFormSchema,
  type ProfessionalFormInput,
} from "@/modules/professionals/fields";
import {
  createProfessional,
  updateProfessional,
} from "@/modules/professionals/professionals";

// Server Actions of the team page. Each one checks the session first;
// unexpected errors become a generic message.

const GENERIC_ERROR = "Não foi possível salvar. Tente novamente.";

export type SaveFailure = {
  ok: false;
  fieldErrors: Partial<Record<keyof ProfessionalFormInput, string>>;
  formError?: string;
};

export type SaveResult = { ok: true } | SaveFailure;

const idSchema = z.uuid();

function collectErrors(error: z.ZodError): SaveFailure["fieldErrors"] {
  const fieldErrors: SaveFailure["fieldErrors"] = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof ProfessionalFormInput | undefined;
    if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

const failure = (formError: string): SaveFailure => ({
  ok: false,
  fieldErrors: {},
  formError,
});

// The team shows up in the agenda's form and calendar too.
function revalidateTeam() {
  revalidatePath("/admin/equipe");
  revalidatePath("/admin/agenda", "layout");
}

export async function createProfessionalAction(
  input: ProfessionalFormInput,
): Promise<SaveResult> {
  const session = await requireAdmin();
  const parsed = professionalFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectErrors(parsed.error) };
  }
  try {
    await createProfessional(session.clinicId, parsed.data, session.user.id);
  } catch {
    return failure(GENERIC_ERROR);
  }
  revalidateTeam();
  return { ok: true };
}

export async function updateProfessionalAction(
  id: string,
  input: ProfessionalFormInput,
): Promise<SaveResult> {
  const session = await requireAdmin();
  if (!idSchema.safeParse(id).success) {
    return failure("Profissional não encontrada.");
  }
  const parsed = professionalFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectErrors(parsed.error) };
  }
  let result;
  try {
    result = await updateProfessional(
      session.clinicId,
      id,
      parsed.data,
      session.user.id,
    );
  } catch {
    return failure(GENERIC_ERROR);
  }
  if (!result.ok) {
    return {
      ok: false,
      fieldErrors: result.fieldErrors,
      formError: result.formError,
    };
  }
  revalidateTeam();
  return { ok: true };
}
