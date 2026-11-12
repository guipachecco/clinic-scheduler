"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import {
  moduleActive,
  requireAdmin,
  type PanelContext,
} from "@/modules/auth/session";
import { MODULE_OFF_ERROR } from "@/modules/clinics/modules";
import {
  productCategoryFormSchema,
  productFormSchema,
  type ProductCategoryFormInput,
  type ProductFormInput,
} from "@/modules/products/fields";
import {
  addExampleProducts,
  createProduct,
  createProductCategory,
  deleteProduct,
  updateProduct,
  updateProductCategory,
} from "@/modules/products/products";
import { entrySchema, type EntryInput } from "@/modules/stock/fields";
import { recordEntry, reverseMovement } from "@/modules/stock/stock";

// Server Actions of the products catalog. Each one checks the session and the
// "products" module first; unexpected errors become a generic message.

const GENERIC_ERROR = "Não foi possível salvar. Tente novamente.";

type FieldKeys = keyof ProductFormInput | keyof ProductCategoryFormInput;

export type SaveFailure = {
  ok: false;
  fieldErrors: Partial<Record<FieldKeys, string>>;
  formError?: string;
};

// Success is returned (never a redirect) so the client navigates itself.
export type SaveResult = { ok: true } | SaveFailure;

const idSchema = z.uuid();

function collectErrors(error: z.ZodError): SaveFailure["fieldErrors"] {
  const fieldErrors: SaveFailure["fieldErrors"] = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as FieldKeys | undefined;
    if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

const failure = (formError: string): SaveFailure => ({
  ok: false,
  fieldErrors: {},
  formError,
});

// The session of an action, or null while the clinic has Produtos off:
// hiding the menu is not enough, a direct call is refused too.
async function productsSession(): Promise<PanelContext | null> {
  const session = await requireAdmin();
  return moduleActive(session, "products") ? session : null;
}

export async function createProductAction(
  input: ProductFormInput,
): Promise<SaveResult> {
  const session = await productsSession();
  if (!session) return failure(MODULE_OFF_ERROR);
  const parsed = productFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectErrors(parsed.error) };
  }
  let result;
  try {
    result = await createProduct(
      session.clinicId,
      parsed.data,
      session.user.id,
    );
  } catch {
    return failure(GENERIC_ERROR);
  }
  if (!result.ok) return result;
  revalidatePath("/admin/produtos");
  return { ok: true };
}

export async function updateProductAction(
  id: string,
  input: ProductFormInput,
): Promise<SaveResult> {
  const session = await productsSession();
  if (!session) return failure(MODULE_OFF_ERROR);
  if (!idSchema.safeParse(id).success) return failure(GENERIC_ERROR);
  const parsed = productFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectErrors(parsed.error) };
  }
  let result;
  try {
    result = await updateProduct(
      session.clinicId,
      id,
      parsed.data,
      session.user.id,
    );
  } catch {
    return failure(GENERIC_ERROR);
  }
  if (!result.ok) {
    const empty = Object.keys(result.fieldErrors).length === 0;
    return empty ? failure("Produto não encontrado.") : result;
  }
  revalidatePath("/admin/produtos");
  return { ok: true };
}

export async function deleteProductAction(id: string): Promise<SaveResult> {
  const session = await productsSession();
  if (!session) return failure(MODULE_OFF_ERROR);
  if (!idSchema.safeParse(id).success) {
    return failure("Produto não encontrado.");
  }
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
  revalidatePath("/admin/produtos");
  return { ok: true };
}

export async function addExampleProductsAction(): Promise<SaveResult> {
  const session = await productsSession();
  if (!session) return failure(MODULE_OFF_ERROR);
  try {
    await addExampleProducts(session.clinicId);
  } catch {
    return failure("Não foi possível adicionar os exemplos. Tente novamente.");
  }
  revalidatePath("/admin/produtos");
  return { ok: true };
}

export type StockActionResult =
  | { ok: true }
  | {
      ok: false;
      fieldErrors: { quantity?: string; note?: string };
      formError?: string;
    };

const stockFailure = (formError: string): StockActionResult => ({
  ok: false,
  fieldErrors: {},
  formError,
});

export async function recordEntryAction(
  productId: string,
  input: EntryInput,
): Promise<StockActionResult> {
  const session = await productsSession();
  if (!session) return stockFailure(MODULE_OFF_ERROR);
  if (!idSchema.safeParse(productId).success) {
    return stockFailure("Produto não encontrado.");
  }
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: { quantity?: string; note?: string } = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if ((key === "quantity" || key === "note") && !(key in fieldErrors)) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, fieldErrors };
  }
  let result;
  try {
    result = await recordEntry(
      session.clinicId,
      productId,
      parsed.data,
      session.user.id,
    );
  } catch {
    return stockFailure(GENERIC_ERROR);
  }
  if (!result.ok) return stockFailure(result.formError);
  revalidatePath("/admin/produtos");
  revalidatePath(`/admin/produtos/${productId}`);
  return { ok: true };
}

export async function reverseMovementAction(
  movementId: string,
): Promise<SaveResult> {
  const session = await productsSession();
  if (!session) return failure(MODULE_OFF_ERROR);
  if (!idSchema.safeParse(movementId).success) {
    return failure("Movimento não encontrado.");
  }
  let result;
  try {
    result = await reverseMovement(
      session.clinicId,
      movementId,
      session.user.id,
    );
  } catch {
    return failure(GENERIC_ERROR);
  }
  if (!result.ok) return failure(result.formError);
  revalidatePath("/admin/produtos", "layout");
  revalidatePath("/admin/agenda", "layout");
  revalidatePath("/admin/financeiro", "layout");
  return { ok: true };
}

export async function createProductCategoryAction(
  input: ProductCategoryFormInput,
): Promise<SaveResult> {
  const session = await productsSession();
  if (!session) return failure(MODULE_OFF_ERROR);
  const parsed = productCategoryFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectErrors(parsed.error) };
  }
  let result;
  try {
    result = await createProductCategory(
      session.clinicId,
      parsed.data,
      session.user.id,
    );
  } catch {
    return failure(GENERIC_ERROR);
  }
  if (!result.ok) return result;
  revalidatePath("/admin/produtos");
  return { ok: true };
}

export async function updateProductCategoryAction(
  id: string,
  input: ProductCategoryFormInput,
): Promise<SaveResult> {
  const session = await productsSession();
  if (!session) return failure(MODULE_OFF_ERROR);
  if (!idSchema.safeParse(id).success) return failure(GENERIC_ERROR);
  const parsed = productCategoryFormSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: collectErrors(parsed.error) };
  }
  let result;
  try {
    result = await updateProductCategory(
      session.clinicId,
      id,
      parsed.data,
      session.user.id,
    );
  } catch {
    return failure(GENERIC_ERROR);
  }
  if (!result.ok) {
    const empty = Object.keys(result.fieldErrors).length === 0;
    return empty ? failure("Categoria não encontrada.") : result;
  }
  revalidatePath("/admin/produtos");
  return { ok: true };
}
