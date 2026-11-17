"use server";

import { revalidatePath } from "next/cache";

import { moduleActive, requireAdmin } from "@/modules/auth/session";
import {
  activateAccount,
  asaasEnabled,
  refreshAccount,
  setDepositEnabled,
} from "@/modules/asaas/accounts";
import { activationSchema, type ActivationInput } from "@/modules/asaas/fields";
import { MODULE_OFF_ERROR } from "@/modules/clinics/modules";
import { issuesToFieldErrors } from "@/modules/finance/fields";

// Server Actions of "Receber sinal por Pix". Each one checks the panel
// session first (clinic owner or root, like the other financial actions) and
// takes the clinic from it. Errors become generic messages: Asaas answers can
// echo personal data.

export type SinalActionResult = {
  ok: boolean;
  formError?: string;
  fieldErrors?: Record<string, string>;
};

const GENERIC_ERROR = "Não foi possível salvar. Tente novamente.";

async function session() {
  const ctx = await requireAdmin();
  if (!asaasEnabled() || !moduleActive(ctx, "finance")) return null;
  return ctx;
}

const OFF: SinalActionResult = { ok: false, formError: MODULE_OFF_ERROR };

export async function activateAction(
  input: ActivationInput,
): Promise<SinalActionResult> {
  const ctx = await session();
  if (!ctx) return OFF;
  const parsed = activationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  }
  try {
    const result = await activateAccount(
      ctx.clinicId,
      parsed.data,
      ctx.user.id,
    );
    if (result.ok) revalidatePath("/admin/financeiro/sinal-pix");
    return result.ok
      ? { ok: true }
      : { ok: false, formError: result.formError };
  } catch {
    return { ok: false, formError: GENERIC_ERROR };
  }
}

export async function refreshAction(): Promise<SinalActionResult> {
  const ctx = await session();
  if (!ctx) return OFF;
  try {
    await refreshAccount(ctx.clinicId);
    revalidatePath("/admin/financeiro/sinal-pix");
    return { ok: true };
  } catch {
    return { ok: false, formError: GENERIC_ERROR };
  }
}

export async function setDepositEnabledAction(
  enabled: boolean,
): Promise<SinalActionResult> {
  const ctx = await session();
  if (!ctx) return OFF;
  try {
    await setDepositEnabled(ctx.clinicId, enabled === true, ctx.user.id);
    revalidatePath("/admin/financeiro/sinal-pix");
    return { ok: true };
  } catch {
    return { ok: false, formError: GENERIC_ERROR };
  }
}
