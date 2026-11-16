"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/modules/auth/session";
import { removeOwnerPhoto, saveOwnerPhoto } from "@/modules/branding/photo";

// Server Actions of "Meu perfil". Each one checks the session first, returns
// values (never a redirect) and turns unexpected errors into a generic
// message. The photo goes straight to the panel and the public page: there
// is no draft here.

const UPLOAD_ERROR = "Não foi possível enviar a foto. Tente novamente.";
const REMOVE_ERROR = "Não foi possível remover a foto. Tente novamente.";
// Same limit as reencodeImage; next.config allows 11 MB for the request.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type Result = { ok: true } | { ok: false; formError: string };

// FormData with "file".
export async function saveProfilePhotoAction(
  formData: FormData,
): Promise<Result> {
  const session = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, formError: "Escolha uma foto." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, formError: "A foto deve ter no máximo 10 MB." };
  }
  try {
    const result = await saveOwnerPhoto(
      session.clinicId,
      { bytes: Buffer.from(await file.arrayBuffer()), mimeType: file.type },
      session.user.id,
    );
    if (!result.ok) return result;
  } catch {
    return { ok: false, formError: UPLOAD_ERROR };
  }
  // The photo sits in the sidebar of every panel screen.
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function removeProfilePhotoAction(): Promise<Result> {
  const session = await requireAdmin();
  try {
    await removeOwnerPhoto(session.clinicId, session.user.id);
  } catch {
    return { ok: false, formError: REMOVE_ERROR };
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}
