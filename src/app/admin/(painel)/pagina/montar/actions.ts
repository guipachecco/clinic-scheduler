"use server";

import type * as z from "zod";

import { requireAdmin } from "@/modules/auth/session";
import {
  discardDraft,
  type DraftImageSlot,
  publishDraft,
  saveDraftPatch,
  uploadDraftImage,
} from "@/modules/page-builder/builder";
import { pageDraftSchema } from "@/modules/page-builder/draft";

import type { ActionFailure } from "../actions";

// Server Actions of the "Monte a cara da sua página" wizard. Each one checks
// the session first, returns values (never a redirect) and turns unexpected
// errors into a generic message. Nothing here changes the public page until
// publishAction.

const GENERIC_ERROR = "Não foi possível salvar. Tente novamente.";
const UPLOAD_ERROR = "Não foi possível enviar a imagem. Tente novamente.";
// Same limit as reencodeImage; next.config allows 11 MB for the request.
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const SLOTS = [
  "logo",
  "ownerPhoto",
  "cover",
  "gallery",
] as const satisfies readonly DraftImageSlot[];

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

// Saves what one step changed on top of the draft. An empty patch is fine.
export async function saveStepAction(
  patch: unknown,
): Promise<{ ok: true } | ActionFailure> {
  const session = await requireAdmin();
  const parsed = pageDraftSchema.safeParse(patch);
  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: collectErrors(parsed.error),
      formError: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
    };
  }
  try {
    const result = await saveDraftPatch(session.clinicId, parsed.data);
    if (!result.ok) return failure(result.formError);
  } catch {
    return failure(GENERIC_ERROR);
  }
  return { ok: true };
}

// FormData with "slot" (logo, ownerPhoto, cover or gallery) and "file".
export async function uploadImageAction(
  formData: FormData,
): Promise<{ ok: true; mediaId: string } | ActionFailure> {
  const session = await requireAdmin();
  const slot = SLOTS.find((s) => s === formData.get("slot"));
  const file = formData.get("file");
  if (!slot || !(file instanceof File) || file.size === 0) {
    return failure("Escolha uma imagem.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return failure("A foto deve ter no máximo 10 MB.");
  }
  try {
    const result = await uploadDraftImage(session.clinicId, slot, {
      bytes: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type,
    });
    if (!result.ok) return failure(result.formError);
    return { ok: true, mediaId: result.mediaId };
  } catch {
    return failure(UPLOAD_ERROR);
  }
}

export async function publishAction(): Promise<{ ok: true } | ActionFailure> {
  const session = await requireAdmin();
  try {
    const result = await publishDraft(session.clinicId, session.user.id);
    if (!result.ok) return failure(result.formError);
  } catch {
    return failure("Não foi possível publicar. Tente novamente.");
  }
  return { ok: true };
}

export async function discardAction(): Promise<{ ok: true } | ActionFailure> {
  const session = await requireAdmin();
  try {
    await discardDraft(session.clinicId, session.user.id);
  } catch {
    return failure("Não foi possível descartar. Tente novamente.");
  }
  return { ok: true };
}
