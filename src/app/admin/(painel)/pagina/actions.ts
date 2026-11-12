"use server";

import * as z from "zod";

import {
  moduleActive,
  requireAdmin,
  type PanelContext,
} from "@/modules/auth/session";
import { clinicPageSchema, loyaltySchema } from "@/modules/clinic-page/fields";
import {
  redeemLoyalty,
  setReviewHidden,
  updateClinicPage,
  updateLoyalty,
} from "@/modules/clinic-page/panel";
import { MODULE_OFF_ERROR, type ClinicModule } from "@/modules/clinics/modules";
import { productFormSchema } from "@/modules/products/fields";
import {
  addExampleProducts,
  createProduct,
  deleteProduct,
  getOtherCategoryId,
  getProduct,
  updateProduct,
} from "@/modules/products/products";

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

// The old products screen has no category or "Ativo" field: its "Aparece na
// página" box is now "Mostrar na página". New products go to "Outros" and
// stay active; an edit keeps the product's category and "Ativo". The new
// screen (Task 3) replaces these actions.
type LegacyProductInput = {
  name: string;
  price: string;
  description: string;
  isActive: boolean;
};

export async function createProductAction(
  input: LegacyProductInput,
): Promise<{ ok: true } | ActionFailure> {
  const session = await moduleSession("products");
  if (!session) return failure(MODULE_OFF_ERROR);
  try {
    const parsed = productFormSchema.safeParse({
      ...input,
      categoryId: await getOtherCategoryId(session.clinicId),
      showOnPage: input.isActive,
      isActive: true,
    });
    if (!parsed.success) {
      return { ok: false, fieldErrors: collectErrors(parsed.error) };
    }
    const result = await createProduct(
      session.clinicId,
      parsed.data,
      session.user.id,
    );
    if (!result.ok) return { ok: false, fieldErrors: result.fieldErrors };
  } catch {
    return failure(GENERIC_ERROR);
  }
  return { ok: true };
}

export async function updateProductAction(
  id: string,
  input: LegacyProductInput,
): Promise<{ ok: true } | ActionFailure> {
  const session = await moduleSession("products");
  if (!session) return failure(MODULE_OFF_ERROR);
  try {
    const current = await getProduct(session.clinicId, id);
    if (!current) return failure("Produto não encontrado.");
    const parsed = productFormSchema.safeParse({
      ...input,
      categoryId: current.categoryId,
      showOnPage: input.isActive,
      isActive: current.isActive,
    });
    if (!parsed.success) {
      return { ok: false, fieldErrors: collectErrors(parsed.error) };
    }
    const result = await updateProduct(
      session.clinicId,
      id,
      parsed.data,
      session.user.id,
    );
    if (!result.ok) return failure("Produto não encontrado.");
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
    const result = await deleteProduct(session.clinicId, id, session.user.id);
    if (!result.ok) {
      return failure(
        result.reason === "in_use"
          ? "Este produto já foi usado e não pode ser excluído. Desative-o."
          : "Produto não encontrado.",
      );
    }
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
