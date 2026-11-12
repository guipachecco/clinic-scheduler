"use server";

import * as z from "zod";

import {
  moduleActive,
  requireAdmin,
  type PanelContext,
} from "@/modules/auth/session";
import {
  clinicPageSchema,
  loyaltySchema,
  productSchema,
} from "@/modules/clinic-page/fields";
import {
  addExampleProducts,
  createProduct,
  deleteProduct,
  redeemLoyalty,
  setReviewHidden,
  updateClinicPage,
  updateLoyalty,
  updateProduct,
} from "@/modules/clinic-page/panel";
import { MODULE_OFF_ERROR, type ClinicModule } from "@/modules/clinics/modules";

// Server Actions of "Minha página". Each one checks the session first,
// returns values (never a redirect) and turns unexpected errors into a
// generic message.

const GENERIC_ERROR = "Não foi possível salvar. Tente novamente.";

export type ActionFailure = {
  ok: false;
  // Keys are the form field names, such as "instagram" or "price".
  fieldErrors: Record<string, string>;
  formError?: string;
};

const failure = (formError: string): ActionFailure => ({
  ok: false,
  fieldErrors: {},
  formError,
});

// The session of an action of an optional module, or null while the clinic
// has it off: hiding the link is not enough, a direct call is refused too.
async function moduleSession(key: ClinicModule): Promise<PanelContext | null> {
  const session = await requireAdmin();
  return moduleActive(session, key) ? session : null;
}

function collectErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function savePageAction(
  input: z.input<typeof clinicPageSchema>,
): Promise<{ ok: true } | ActionFailure> {
  const session = await requireAdmin();
  const parsed = clinicPageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectErrors(parsed.error) };
  }
  try {
    await updateClinicPage(session.clinicId, parsed.data);
  } catch {
    return failure(GENERIC_ERROR);
  }
  return { ok: true };
}

export async function saveLoyaltyAction(
  input: z.input<typeof loyaltySchema>,
): Promise<{ ok: true } | ActionFailure> {
  const session = await moduleSession("loyalty");
  if (!session) return failure(MODULE_OFF_ERROR);
  const parsed = loyaltySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectErrors(parsed.error) };
  }
  try {
    await updateLoyalty(session.clinicId, parsed.data);
  } catch {
    return failure(GENERIC_ERROR);
  }
  return { ok: true };
}

export async function createProductAction(
  input: z.input<typeof productSchema>,
): Promise<{ ok: true } | ActionFailure> {
  const session = await moduleSession("products");
  if (!session) return failure(MODULE_OFF_ERROR);
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectErrors(parsed.error) };
  }
  try {
    await createProduct(session.clinicId, parsed.data);
  } catch {
    return failure(GENERIC_ERROR);
  }
  return { ok: true };
}

export async function updateProductAction(
  id: string,
  input: z.input<typeof productSchema>,
): Promise<{ ok: true } | ActionFailure> {
  const session = await moduleSession("products");
  if (!session) return failure(MODULE_OFF_ERROR);
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectErrors(parsed.error) };
  }
  try {
    const found = await updateProduct(session.clinicId, id, parsed.data);
    if (!found) return failure("Produto não encontrado.");
  } catch {
    return failure(GENERIC_ERROR);
  }
  return { ok: true };
}

export async function deleteProductAction(
  id: string,
): Promise<{ ok: true } | ActionFailure> {
  const session = await moduleSession("products");
  if (!session) return failure(MODULE_OFF_ERROR);
  try {
    const found = await deleteProduct(session.clinicId, id);
    if (!found) return failure("Produto não encontrado.");
  } catch {
    return failure("Não foi possível excluir. Tente novamente.");
  }
  return { ok: true };
}

export async function addExampleProductsAction(): Promise<
  { ok: true } | ActionFailure
> {
  const session = await moduleSession("products");
  if (!session) return failure(MODULE_OFF_ERROR);
  try {
    await addExampleProducts(session.clinicId);
  } catch {
    return failure("Não foi possível adicionar os exemplos. Tente novamente.");
  }
  return { ok: true };
}

export async function setReviewHiddenAction(
  id: string,
  hidden: boolean,
): Promise<{ ok: true } | ActionFailure> {
  const session = await moduleSession("reviews");
  if (!session) return failure(MODULE_OFF_ERROR);
  try {
    const found = await setReviewHidden(
      session.clinicId,
      id,
      hidden === true,
      session.user.id,
    );
    if (!found) return failure("Avaliação não encontrada.");
  } catch {
    return failure(GENERIC_ERROR);
  }
  return { ok: true };
}

export async function redeemLoyaltyAction(
  patientId: string,
): Promise<{ ok: true } | ActionFailure> {
  const session = await moduleSession("loyalty");
  if (!session) return failure(MODULE_OFF_ERROR);
  try {
    const result = await redeemLoyalty(
      session.clinicId,
      patientId,
      session.user.id,
    );
    if (!result.ok) return failure("Esta paciente não tem prêmio disponível.");
  } catch {
    return failure(GENERIC_ERROR);
  }
  return { ok: true };
}
