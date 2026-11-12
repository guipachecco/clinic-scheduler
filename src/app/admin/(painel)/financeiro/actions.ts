"use server";

import * as z from "zod";

import {
  moduleActive,
  requireAdmin,
  type PanelContext,
} from "@/modules/auth/session";
import { MODULE_OFF_ERROR } from "@/modules/clinics/modules";
import { cancelExpense, createExpense } from "@/modules/finance/expenses";
import {
  approveSchema,
  expenseSchema,
  issuesToFieldErrors,
  paymentSchema,
  quoteFormSchema,
  reasonSchema,
  receiptSchema,
  reviseSchema,
  scheduleSessionsSchema,
  type ApproveInput,
  type ExpenseInput,
  type PaymentInput,
  type QuoteFormInput,
  type ReceiptInput,
  type ReviseInput,
  type ScheduleSessionsInput,
} from "@/modules/finance/fields";
import {
  approveQuote,
  createQuote,
  duplicateQuote,
  setQuoteStatus,
  updateQuote,
} from "@/modules/finance/quotes";
import { createReceipt, reverseReceipt } from "@/modules/finance/receipts";
import {
  cancelSale,
  receivePayment,
  reviseSale,
  scheduleSessions,
} from "@/modules/finance/sales";
import { disconnect, NotConnectedError } from "@/modules/mercado-pago/accounts";
import {
  createCharge,
  reverseWithRefund,
} from "@/modules/mercado-pago/charges";
import { DateTime } from "luxon";

import { CLINIC_TIME_ZONE, todayLocal } from "@/modules/schedule/time";

// Server Actions of the financial module. Each one checks the session first,
// takes the clinic from it, parses the raw input again, and turns unexpected
// errors into a generic message (driver errors can echo values).

export type ActionResult = {
  ok: boolean;
  id?: string;
  formError?: string;
  fieldErrors?: Record<string, string>;
  problems?: { index: number; kind: "conflict" | "warning"; message: string }[];
};

const GENERIC_ERROR = "Não foi possível salvar. Tente novamente.";
const idSchema = z.uuid();

function invalid(error: z.ZodError): ActionResult {
  return { ok: false, fieldErrors: issuesToFieldErrors(error.issues) };
}

// The session of a financial action, or null while the clinic has the
// finance module off: hiding the menu is not enough, a direct call is
// refused too. Every action below starts here.
async function financeSession(): Promise<PanelContext | null> {
  const ctx = await requireAdmin();
  return moduleActive(ctx, "finance") ? ctx : null;
}

const MODULE_OFF: ActionResult = { ok: false, formError: MODULE_OFF_ERROR };

async function run(work: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await work();
  } catch {
    return { ok: false, formError: GENERIC_ERROR };
  }
}

// ----------------------------------------------------------------- quotes

export async function saveQuoteAction(
  id: string | null,
  input: QuoteFormInput,
): Promise<ActionResult> {
  const session = await financeSession();
  if (!session) return MODULE_OFF;
  const { clinicId, user } = session;
  const parsed = quoteFormSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  if (id !== null && !idSchema.safeParse(id).success) {
    return { ok: false, formError: GENERIC_ERROR };
  }
  return run(() =>
    id === null
      ? createQuote(clinicId, parsed.data, user.id)
      : updateQuote(clinicId, id, parsed.data, user.id),
  );
}

export async function quoteStatusAction(
  id: string,
  to: "sent" | "rejected" | "cancelled",
): Promise<ActionResult> {
  const session = await financeSession();
  if (!session) return MODULE_OFF;
  const { clinicId, user } = session;
  if (
    !idSchema.safeParse(id).success ||
    !["sent", "rejected", "cancelled"].includes(to)
  ) {
    return { ok: false, formError: GENERIC_ERROR };
  }
  return run(() => setQuoteStatus(clinicId, id, to, user.id));
}

export async function duplicateQuoteAction(id: string): Promise<ActionResult> {
  const session = await financeSession();
  if (!session) return MODULE_OFF;
  const { clinicId, user } = session;
  if (!idSchema.safeParse(id).success)
    return { ok: false, formError: GENERIC_ERROR };
  const validUntil = DateTime.now()
    .setZone(CLINIC_TIME_ZONE)
    .plus({ days: 15 })
    .toFormat("yyyy-MM-dd");
  return run(() => duplicateQuote(clinicId, id, validUntil, user.id));
}

export async function approveQuoteAction(
  id: string,
  input: ApproveInput,
): Promise<ActionResult> {
  const session = await financeSession();
  if (!session) return MODULE_OFF;
  const { clinicId, user } = session;
  if (!idSchema.safeParse(id).success)
    return { ok: false, formError: GENERIC_ERROR };
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run(async () => {
    const result = await approveQuote(
      clinicId,
      id,
      parsed.data,
      user.id,
      todayLocal(),
    );
    return result.ok ? { ok: true, id: result.saleId } : result;
  });
}

// ------------------------------------------------------------------ sales

export async function receivePaymentAction(
  input: PaymentInput,
): Promise<ActionResult> {
  const session = await financeSession();
  if (!session) return MODULE_OFF;
  const { clinicId, user } = session;
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run(() => receivePayment(clinicId, parsed.data, user.id));
}

export async function reversePaymentAction(
  paymentId: string,
  reason: string,
): Promise<ActionResult> {
  const session = await financeSession();
  if (!session) return MODULE_OFF;
  const { clinicId, user } = session;
  const parsed = reasonSchema.safeParse(reason);
  if (!parsed.success) return invalid(parsed.error);
  if (!idSchema.safeParse(paymentId).success) {
    return { ok: false, formError: GENERIC_ERROR };
  }
  // A payment that came from a Mercado Pago link is refunded there first.
  return run(() =>
    reverseWithRefund(clinicId, paymentId, parsed.data, user.id),
  );
}

// ------------------------------------------------------------ mercado pago

export type ChargeActionResult = ActionResult & {
  link?: { checkoutUrl: string; amountCents: number; expiresAt: string };
};

export async function createChargeAction(
  installmentId: string,
): Promise<ChargeActionResult> {
  const session = await financeSession();
  if (!session) return MODULE_OFF;
  const { clinicId, clinic, user } = session;
  if (!idSchema.safeParse(installmentId).success) {
    return { ok: false, formError: GENERIC_ERROR };
  }
  try {
    const result = await createCharge(
      clinicId,
      { installmentId, clinicName: clinic.name },
      user.id,
    );
    if (!result.ok) return { ok: false, formError: result.formError };
    return {
      ok: true,
      id: result.link.id,
      link: {
        checkoutUrl: result.link.checkoutUrl,
        amountCents: result.link.amountCents,
        expiresAt: result.link.expiresAt.toISOString(),
      },
    };
  } catch (error) {
    if (error instanceof NotConnectedError) {
      return { ok: false, formError: error.message };
    }
    return {
      ok: false,
      formError: "O Mercado Pago não respondeu. Tente de novo em instantes.",
    };
  }
}

export async function disconnectMercadoPagoAction(): Promise<ActionResult> {
  const session = await financeSession();
  if (!session) return MODULE_OFF;
  const { clinicId, user } = session;
  return run(async () => {
    await disconnect(clinicId, user.id);
    return { ok: true };
  });
}

// --------------------------------------------------------------- receipts

export async function createReceiptAction(
  input: ReceiptInput,
): Promise<ActionResult> {
  const session = await financeSession();
  if (!session) return MODULE_OFF;
  const { clinicId, user } = session;
  const parsed = receiptSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run(() => createReceipt(clinicId, parsed.data, user.id));
}

export async function reverseReceiptAction(
  receiptId: string,
  reason: string,
): Promise<ActionResult> {
  const session = await financeSession();
  if (!session) return MODULE_OFF;
  const { clinicId, user } = session;
  const parsed = reasonSchema.safeParse(reason);
  if (!parsed.success) return invalid(parsed.error);
  if (!idSchema.safeParse(receiptId).success) {
    return { ok: false, formError: GENERIC_ERROR };
  }
  return run(() => reverseReceipt(clinicId, receiptId, parsed.data, user.id));
}

export async function cancelSaleAction(
  saleId: string,
  input: { reason: string; cancelFutureSessions: boolean },
): Promise<ActionResult> {
  const session = await financeSession();
  if (!session) return MODULE_OFF;
  const { clinicId, user } = session;
  const reason = reasonSchema.safeParse(input.reason);
  if (!reason.success) return invalid(reason.error);
  if (!idSchema.safeParse(saleId).success) {
    return { ok: false, formError: GENERIC_ERROR };
  }
  return run(() =>
    cancelSale(
      clinicId,
      saleId,
      {
        reason: reason.data,
        cancelFutureSessions: input.cancelFutureSessions === true,
      },
      user.id,
    ),
  );
}

export async function reviseSaleAction(
  saleId: string,
  input: ReviseInput,
): Promise<ActionResult> {
  const session = await financeSession();
  if (!session) return MODULE_OFF;
  const { clinicId, user } = session;
  if (!idSchema.safeParse(saleId).success) {
    return { ok: false, formError: GENERIC_ERROR };
  }
  const parsed = reviseSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run(() =>
    reviseSale(clinicId, saleId, parsed.data, user.id, todayLocal()),
  );
}

export async function scheduleSessionsAction(
  input: ScheduleSessionsInput,
): Promise<ActionResult> {
  const session = await financeSession();
  if (!session) return MODULE_OFF;
  const { clinicId, user } = session;
  const parsed = scheduleSessionsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run(() => scheduleSessions(clinicId, parsed.data, user.id));
}

// --------------------------------------------------------------- expenses

export async function createExpenseAction(
  input: ExpenseInput,
): Promise<ActionResult> {
  const session = await financeSession();
  if (!session) return MODULE_OFF;
  const { clinicId, user } = session;
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run(() => createExpense(clinicId, parsed.data, user.id));
}

export async function cancelExpenseAction(
  id: string,
  reason: string,
): Promise<ActionResult> {
  const session = await financeSession();
  if (!session) return MODULE_OFF;
  const { clinicId, user } = session;
  const parsed = reasonSchema.safeParse(reason);
  if (!parsed.success) return invalid(parsed.error);
  if (!idSchema.safeParse(id).success)
    return { ok: false, formError: GENERIC_ERROR };
  return run(() => cancelExpense(clinicId, id, parsed.data, user.id));
}
