"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import { requireRoot } from "@/modules/auth/session";
import {
  dateField,
  issuesToFieldErrors,
  moneyField,
} from "@/modules/finance/fields";
import {
  addLedgerEntry,
  deleteLedgerEntry,
  setLedgerPaid,
} from "@/modules/platform/ledger";

// Root only: Zemana's own money in and bills (zemana_ledger).

export type LedgerActionResult = {
  ok: boolean;
  fieldErrors?: Record<string, string>;
  formError?: string;
};

const PATH = "/admin/zemana";
const ERROR = "Não foi possível salvar. Tente novamente.";

const entrySchema = z.object({
  direction: z.enum(["in", "out"]),
  description: z
    .string()
    .trim()
    .min(1, "Diga o que é.")
    .max(120, "No máximo 120 letras."),
  amount: moneyField(),
  dueOn: dateField(),
  paid: z.boolean(),
  clinicId: z.union([z.uuid(), z.literal("")]),
});

export async function addLedgerEntryAction(
  input: z.input<typeof entrySchema>,
): Promise<LedgerActionResult> {
  await requireRoot();
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  const { direction, description, amount, dueOn, paid, clinicId } =
    parsed.data;
  try {
    await addLedgerEntry({
      direction,
      description,
      amountCents: amount,
      dueOn,
      paidOn: paid ? dueOn : null,
      clinicId: clinicId || null,
    });
  } catch {
    return { ok: false, formError: ERROR };
  }
  revalidatePath(PATH);
  return { ok: true };
}

const paidSchema = z.object({
  id: z.uuid(),
  paidOn: z.union([dateField(), z.null()]),
});

export async function setLedgerPaidAction(input: {
  id: string;
  paidOn: string | null;
}): Promise<LedgerActionResult> {
  await requireRoot();
  const parsed = paidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, formError: ERROR };
  try {
    await setLedgerPaid(parsed.data.id, parsed.data.paidOn);
  } catch {
    return { ok: false, formError: ERROR };
  }
  revalidatePath(PATH);
  return { ok: true };
}

export async function deleteLedgerEntryAction(
  id: string,
): Promise<LedgerActionResult> {
  await requireRoot();
  if (!z.uuid().safeParse(id).success) return { ok: false, formError: ERROR };
  try {
    await deleteLedgerEntry(id);
  } catch {
    return { ok: false, formError: ERROR };
  }
  revalidatePath(PATH);
  return { ok: true };
}
