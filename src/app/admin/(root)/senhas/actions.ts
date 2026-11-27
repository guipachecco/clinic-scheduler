"use server";

import * as z from "zod";

import { logger } from "@/lib/logger";
import {
  AdminAccountError,
  setClinicAccountPassword,
} from "@/modules/auth/admin-accounts";
import { requireRoot } from "@/modules/auth/session";

// Root only: sets the password of an owner or client account of a clinic.

const inputSchema = z.object({
  clinicId: z.uuid(),
  kind: z.enum(["owner", "patient"]),
  userId: z.uuid(),
  password: z.string(),
});

export async function setPasswordAction(
  input: z.infer<typeof inputSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireRoot();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Escolha a conta." };
  try {
    await setClinicAccountPassword({
      ...parsed.data,
      actorUserId: session.user.id,
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof AdminAccountError) {
      return { ok: false, error: error.message };
    }
    logger.error("root password reset failed", { error });
    return { ok: false, error: "Não foi possível salvar. Tente de novo." };
  }
}
