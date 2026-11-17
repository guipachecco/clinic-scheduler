import "server-only";

import { eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";

import type { Tx } from "@/db/client";
import {
  installments,
  payments,
  quoteItems,
  quotes,
  saleItems,
  sales,
} from "@/db/schema";
import { QUOTE_NUMBER_LOCK } from "@/modules/finance/quotes";
import { CLINIC_TIME_ZONE } from "@/modules/schedule/time";

import { ensurePixOnlineMethod } from "./accounts";

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
