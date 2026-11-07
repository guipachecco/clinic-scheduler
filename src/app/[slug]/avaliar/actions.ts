"use server";

import { logger } from "@/lib/logger";
import { requireClient } from "@/modules/clients/session";
import { reviewSchema } from "@/modules/clinic-page/fields";
import { createReview } from "@/modules/clinic-page/public";

export type ReviewResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid" | "not_allowed" | "failed";
      message: string;
    };

// Sends her review. Who she is comes from the server session; the database
// policy (a completed appointment in this clinic) is the real gate, this only
// maps its answer to a message.
export async function submitReview(
  slug: string,
  input: unknown,
): Promise<ReviewResult> {
  const { ctx } = await requireClient(slug, `/${slug}/avaliar`);
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
