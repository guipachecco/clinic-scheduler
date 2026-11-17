import "server-only";

import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { DateTime } from "luxon";

import type { Tx } from "@/db/client";
import {
  appointments,
  asaasDeposits,
  installments,
  payments,
  quoteItems,
  quotes,
  saleItems,
  sales,
} from "@/db/schema";
import { logger } from "@/lib/logger";
import { QUOTE_NUMBER_LOCK } from "@/modules/finance/quotes";
import { CLINIC_TIME_ZONE } from "@/modules/schedule/time";

import { accountApiKey, ensurePixOnlineMethod } from "./accounts";
import { AsaasError, deletePayment, type Fetch } from "./api";
import type { CloseReason } from "./rules";

// The sale an online booking gets when its Pix deposit is paid: an approved
// quote (the sales screens join quotes), one item, and two installments, the
// deposit (paid now, "Pix online") and the rest, due on the day of the visit
// and linked to the appointment so "Receber agora" shows it there.

export const DEPOSIT_SALE_NOTE = "Sinal online";
export const DEPOSIT_PAYMENT_NOTE = "Sinal pago por Pix (Asaas)";

const localDate = (instant: Date) =>
  DateTime.fromJSDate(instant, { zone: CLINIC_TIME_ZONE }).toFormat(
    "yyyy-MM-dd",
  );

export async function createDepositSale(
  tx: Tx,
  input: {
    clinicId: string;
    appointmentId: string;
    patientId: string;
    serviceId: string;
    serviceName: string;
    priceCents: number;
    depositCents: number;
    startsAt: Date;
    paidOn: string;
  },
): Promise<{ saleId: string; paymentId: string }> {
  const { clinicId } = input;
  // The price may have dropped under the deposit since the booking: the sale
  // is never worth less than what was paid.
  const totalCents = Math.max(input.priceCents, input.depositCents);
  const restCents = totalCents - input.depositCents;

  await tx.execute(
    sql`select pg_advisory_xact_lock(${QUOTE_NUMBER_LOCK}, hashtext(${clinicId}))`,
  );
  const [last] = await tx
    .select({ max: sql<number | null>`max(${quotes.number})` })
    .from(quotes)
    .where(eq(quotes.clinicId, clinicId));
  const now = new Date();
  const [quote] = await tx
    .insert(quotes)
    .values({
      clinicId,
      number: (last?.max ?? 0) + 1,
      patientId: input.patientId,
      status: "approved",
      validUntil: input.paidOn,
      notes: DEPOSIT_SALE_NOTE,
      decidedAt: now,
    })
    .returning({ id: quotes.id });
  await tx.insert(quoteItems).values({
    clinicId,
    quoteId: quote!.id,
    serviceId: input.serviceId,
    serviceName: input.serviceName,
    sessions: 1,
    unitPriceCents: totalCents,
  });

  const [sale] = await tx
    .insert(sales)
    .values({
      clinicId,
      quoteId: quote!.id,
      patientId: input.patientId,
      paymentPlan: "installments",
      totalCents,
    })
    .returning({ id: sales.id });
  const [item] = await tx
    .insert(saleItems)
    .values({
      clinicId,
      saleId: sale!.id,
      serviceId: input.serviceId,
      serviceName: input.serviceName,
      sessions: 1,
      totalCents,
    })
    .returning({ id: saleItems.id });

  const [deposit] = await tx
    .insert(installments)
    .values({
      clinicId,
      saleId: sale!.id,
      number: 1,
      amountCents: input.depositCents,
      dueDate: input.paidOn,
    })
    .returning({ id: installments.id });
  if (restCents > 0) {
    await tx.insert(installments).values({
      clinicId,
      saleId: sale!.id,
      saleItemId: item!.id,
      appointmentId: input.appointmentId,
      number: 2,
      amountCents: restCents,
      dueDate: localDate(input.startsAt),
    });
  }

  const methodId = await ensurePixOnlineMethod(tx, clinicId);
  const [payment] = await tx
    .insert(payments)
    .values({
      clinicId,
      installmentId: deposit!.id,
      paidOn: input.paidOn,
      amountCents: input.depositCents,
      paymentMethodId: methodId,
      notes: DEPOSIT_PAYMENT_NOTE,
    })
    .returning({ id: payments.id });
  return { saleId: sale!.id, paymentId: payment!.id };
}

// Unpaid (reversals aside), like cancelSaleInTx leaves a cancelled sale.
const unpaid = sql`coalesce((
    select sum(p.amount_cents) from payments p
    where p.installment_id = "installments"."id"
      and p.reversed_at is null), 0) = 0`;

// Keeps the deposit sale of an online booking in step with its appointment.
// Called inside the agenda's transaction, right after syncSessionInstallment
// (which handles package sales; this one only follows asaas_deposits.sale_id).
// - Requested, confirmed or completed: the rest installment is due on the
//   appointment's local day. Back from a no-show (a correction), the deposit
//   is "paid" again and the rest is owed again.
// - No-show: the clinic keeps the deposit (its payment stays) and the rest
//   installment is cancelled; the sale stays.
// - Cancelled: left to the cancellation flow.
export async function syncDepositSale(
  tx: Tx,
  clinicId: string,
  appointmentId: string,
  now: Date = new Date(),
): Promise<void> {
  const [row] = await tx
    .select({
      id: asaasDeposits.id,
      status: asaasDeposits.status,
      saleId: asaasDeposits.saleId,
      appointmentStatus: appointments.status,
      startsAt: appointments.startsAt,
      saleCancelledAt: sales.cancelledAt,
    })
    .from(asaasDeposits)
    .innerJoin(
      appointments,
      and(
        eq(appointments.clinicId, asaasDeposits.clinicId),
        eq(appointments.id, asaasDeposits.appointmentId),
      ),
    )
    .innerJoin(
      sales,
      and(
        eq(sales.clinicId, asaasDeposits.clinicId),
        eq(sales.id, asaasDeposits.saleId),
      ),
    )
    .where(
      and(
        eq(asaasDeposits.clinicId, clinicId),
        eq(asaasDeposits.appointmentId, appointmentId),
        inArray(asaasDeposits.status, ["paid", "kept"]),
        isNotNull(asaasDeposits.saleId),
      ),
    )
    .for("update", { of: asaasDeposits });
  if (!row || row.saleCancelledAt) return;
  const rest = and(
    eq(installments.clinicId, clinicId),
    eq(installments.saleId, row.saleId!),
    eq(installments.appointmentId, appointmentId),
  );

  if (row.appointmentStatus === "no_show") {
    if (row.status === "paid") {
      await tx
        .update(asaasDeposits)
        .set({ status: "kept", updatedAt: now })
        .where(eq(asaasDeposits.id, row.id));
    }
    await tx
      .update(installments)
      .set({ cancelledAt: now })
      .where(and(rest, isNull(installments.cancelledAt), unpaid));
    return;
  }
  if (row.appointmentStatus === "cancelled") return;

  if (row.status === "kept") {
    await tx
      .update(asaasDeposits)
      .set({ status: "paid", updatedAt: now })
      .where(eq(asaasDeposits.id, row.id));
    await tx
      .update(installments)
      .set({ cancelledAt: null })
      .where(and(rest, isNotNull(installments.cancelledAt)));
  }
  await tx
    .update(installments)
    .set({ dueDate: localDate(row.startsAt) })
    .where(rest);
}

// Closes the deposit still pending for an appointment the owner decided on
// (confirmed by hand, or cancelled). Returns the Asaas charge to cancel once
// the transaction commits, or null when there is none.
export async function closePendingDeposit(
  tx: Tx,
  clinicId: string,
  appointmentId: string,
  closeReason: Extract<CloseReason, "manual_confirm" | "clinic_cancelled">,
  now: Date = new Date(),
): Promise<string | null> {
  const [closed] = await tx
    .update(asaasDeposits)
    .set({ status: "closed", closeReason, updatedAt: now })
    .where(
      and(
        eq(asaasDeposits.clinicId, clinicId),
        eq(asaasDeposits.appointmentId, appointmentId),
        eq(asaasDeposits.status, "pending"),
      ),
    )
    .returning({ chargeId: asaasDeposits.chargeId });
  return closed?.chargeId ?? null;
}

// Cancels a charge at Asaas after the local change committed. Best effort:
// a failure is logged (ids and codes only) and a late payment is refunded by
// the webhook, since the deposit is already closed.
export async function cancelChargeQuietly(
  clinicId: string,
  chargeId: string,
  fetchImpl: Fetch = fetch,
): Promise<void> {
  try {
    const apiKey = await accountApiKey(clinicId);
    if (!apiKey) return;
    await deletePayment(apiKey, chargeId, fetchImpl);
  } catch (error) {
    logger.warn("asaas: cobrança não cancelada", {
      clinicId,
      chargeId,
      status: error instanceof AsaasError ? error.status : undefined,
      codes: error instanceof AsaasError ? error.codes : undefined,
    });
  }
}
