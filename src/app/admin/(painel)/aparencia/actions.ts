"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/modules/auth/session";
import {
  setClinicPalette,
  updateBrandingText,
} from "@/modules/branding/branding";
import {
  brandingTextSchema,
  type BrandingTextInput,
} from "@/modules/branding/fields";
import { removeOwnerPhoto, saveOwnerPhoto } from "@/modules/branding/photo";
import { issuesToFieldErrors } from "@/modules/finance/fields";

// Server Actions of the Aparência screen. Each one checks the session first
// and takes the clinic from it.

export type BrandingActionResult = {
  ok: boolean;
  formError?: string;
  fieldErrors?: Record<string, string>;
};

const GENERIC_ERROR = "Não foi possível salvar. Tente novamente.";

async function run(
  work: () => Promise<BrandingActionResult>,
): Promise<BrandingActionResult> {
  try {
    const result = await work();
    if (result.ok) revalidatePath("/admin", "layout");
    return result;
  } catch {
    return { ok: false, formError: GENERIC_ERROR };
  }
}

export async function choosePaletteAction(
  paletteId: string,
): Promise<BrandingActionResult> {
  const { clinicId, user } = await requireAdmin();
  if (typeof paletteId !== "string") {
    return { ok: false, formError: GENERIC_ERROR };
  }
  return run(() => setClinicPalette(clinicId, paletteId, user.id));
}

export async function saveBrandingTextAction(
  input: BrandingTextInput,
): Promise<BrandingActionResult> {
  const { clinicId, user } = await requireAdmin();
  const parsed = brandingTextSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  }
  return run(() => updateBrandingText(clinicId, parsed.data, user.id));
}

export async function uploadOwnerPhotoAction(
  formData: FormData,
): Promise<BrandingActionResult> {
  const { clinicId, user } = await requireAdmin();
  const file = formData.get("foto");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, formError: "Escolha uma foto." };
  }
  return run(async () =>
    saveOwnerPhoto(
      clinicId,
      { bytes: Buffer.from(await file.arrayBuffer()), mimeType: file.type },
      user.id,
    ),
  );
}

export async function removeOwnerPhotoAction(): Promise<BrandingActionResult> {
  const { clinicId, user } = await requireAdmin();
  return run(() => removeOwnerPhoto(clinicId, user.id));
}
