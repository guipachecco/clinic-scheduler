"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";

import { requireAdmin } from "@/modules/auth/session";
import {
  categoryFormSchema,
  serviceFormSchema,
  type CategoryFormInput,
  type ServiceFormInput,
} from "@/modules/services/fields";
import {
  createCategory,
  createService,
  updateCategory,
  updateService,
} from "@/modules/services/services";

// Server Actions for the services catalog. Each one checks the session first.
// Unexpected errors never reach the client: they become a generic message.
// Nothing is ever deleted here and is_flexible is not part of any input.

const GENERIC_ERROR = "Não foi possível salvar. Tente novamente.";

type FieldKeys = keyof ServiceFormInput | keyof CategoryFormInput;

export type SaveResult = {
  ok: false;
  fieldErrors: Partial<Record<FieldKeys, string>>;
  formError?: string;
};

export type CategoryResult = { ok: true } | SaveResult;

const idSchema = z.uuid();

function collectErrors(error: z.ZodError): SaveResult["fieldErrors"] {
  const fieldErrors: SaveResult["fieldErrors"] = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as FieldKeys | undefined;
    if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

const failure = (formError: string): SaveResult => ({
  ok: false,
  fieldErrors: {},
  formError,
});

export async function createServiceAction(
  input: ServiceFormInput,
): Promise<SaveResult> {
  const session = await requireAdmin();
  const parsed = serviceFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectErrors(parsed.error) };
  }

  let result;
  try {
    result = await createService(parsed.data, session.user.id);
  } catch {
    return failure(GENERIC_ERROR);
  }
  if (!result.ok) return result;
  redirect("/admin/servicos");
}

export async function updateServiceAction(
  id: string,
  input: ServiceFormInput,
): Promise<SaveResult> {
  const session = await requireAdmin();
  if (!idSchema.safeParse(id).success) return failure(GENERIC_ERROR);
  const parsed = serviceFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectErrors(parsed.error) };
  }

  let result;
  try {
    result = await updateService(id, parsed.data, session.user.id);
  } catch {
    return failure(GENERIC_ERROR);
  }
  if (!result.ok) {
    const empty = Object.keys(result.fieldErrors).length === 0;
    return empty ? failure("Serviço não encontrado.") : result;
  }
  redirect("/admin/servicos");
}

export async function createCategoryAction(
  input: CategoryFormInput,
): Promise<CategoryResult> {
  const session = await requireAdmin();
  const parsed = categoryFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectErrors(parsed.error) };
  }

  let result;
  try {
    result = await createCategory(parsed.data, session.user.id);
  } catch {
    return failure(GENERIC_ERROR);
  }
  if (!result.ok) return result;
  revalidatePath("/admin/servicos");
  return { ok: true };
}

export async function updateCategoryAction(
  id: string,
  input: CategoryFormInput,
): Promise<CategoryResult> {
  const session = await requireAdmin();
  if (!idSchema.safeParse(id).success) return failure(GENERIC_ERROR);
  const parsed = categoryFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectErrors(parsed.error) };
  }

  let result;
  try {
    result = await updateCategory(id, parsed.data, session.user.id);
  } catch {
    return failure(GENERIC_ERROR);
  }
  if (!result.ok) {
    const empty = Object.keys(result.fieldErrors).length === 0;
    return empty ? failure("Categoria não encontrada.") : result;
  }
  revalidatePath("/admin/servicos");
  return { ok: true };
}
