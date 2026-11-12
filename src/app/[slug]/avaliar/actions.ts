"use server";

import { logger } from "@/lib/logger";
import { requireClient } from "@/modules/clients/session";
import { reviewSchema } from "@/modules/clinic-page/fields";
import { createReview } from "@/modules/clinic-page/public";
import { hasModule, MODULE_OFF_ERROR } from "@/modules/clinics/modules";

export type ReviewResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid" | "not_allowed" | "failed" | "module_off";
      message: string;
    };

// Sends her review. Who she is comes from the server session; the database
// policy (a completed appointment in this clinic) is the real gate, this only
// maps its answer to a message.
export async function submitReview(
  slug: string,
  input: unknown,
): Promise<ReviewResult> {
  const { ctx, clinic } = await requireClient(slug, `/${slug}/avaliar`);
  if (!hasModule(clinic, "reviews")) {
    return { ok: false, reason: "module_off", message: MODULE_OFF_ERROR };
  }
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      message: parsed.error.issues[0]?.message ?? "Confira os dados.",
    };
  }
  try {
    const result = await createReview(ctx, parsed.data);
    if (result.ok) return result;
    if (result.reason === "module_off") {
      return { ok: false, reason: "module_off", message: MODULE_OFF_ERROR };
    }
    return result.reason === "not_allowed"
      ? {
          ok: false,
          reason: "not_allowed",
          message: "Você poderá avaliar depois do seu primeiro atendimento.",
        }
      : { ok: false, reason: "invalid", message: "Confira os dados." };
  } catch (error) {
    logger.error("review failed", { error });
    return {
      ok: false,
      reason: "failed",
      message: "Não foi possível enviar agora. Tente de novo.",
    };
  }
}
