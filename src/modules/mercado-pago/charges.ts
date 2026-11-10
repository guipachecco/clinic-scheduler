import "server-only";

import { randomUUID } from "node:crypto";

import { and, desc, eq, gt, sql } from "drizzle-orm";

import { inClinic, panelDb } from "@/db/client";
import {
  auditLogs,
  installments,
  mercadoPagoCharges,
  payments,
  sales,
} from "@/db/schema";
import { reversePayment } from "@/modules/finance/sales";
import { todayLocal } from "@/modules/schedule/time";

import { accessTokenFor, ensureMercadoPagoMethod } from "./accounts";
import { createOrder, getOrder, refundOrder, type Fetch } from "./api";
import { orderOutcome, readOrder } from "./orders";

// Payment links for installments. The owner makes a link, sends it to the
// patient, and the payment is recorded by itself when Mercado Pago confirms
// it (handleOrderNotification, called by the webhook). The money goes to the
// clinic's own account.

const LINK_DAYS = 7;
const DAY_MS = 24 * 3600 * 1000;

export type ChargeLink = {
  id: string;
  installmentId: string;
  amountCents: number;
  checkoutUrl: string;
  expiresAt: Date;
  status: "pending" | "paid" | "conflict" | "refunded" | "closed";
};

export type ChargeResult =
  { ok: true; link: ChargeLink } | { ok: false; formError: string };

const fail = (formError: string): ChargeResult => ({ ok: false, formError });

const paidOf = (installmentId: string) =>
  sql<number>`coalesce((
    select sum(p.amount_cents) from payments p
    where p.installment_id = ${installmentId}::uuid
      and p.reversed_at is null), 0)::int`;

// A link for what is left of one installment. An open link for the same
// amount, valid for at least one more day, is reused instead of a new one.
export async function createCharge(
  clinicId: string,
  input: { installmentId: string; clinicName: string },
  actorUserId: string,
  fetchImpl: Fetch = fetch,
  now: Date = new Date(),
): Promise<ChargeResult> {
  type Check =
    | { error: string }
    | {
        number: number;
        remaining: number;
        open: typeof mercadoPagoCharges.$inferSelect | undefined;
      };
  const check = await inClinic(clinicId, async (tx): Promise<Check> => {
    const [part] = await tx
      .select({
        id: installments.id,
        number: installments.number,
        amountCents: installments.amountCents,
        cancelledAt: installments.cancelledAt,
        saleCancelledAt: sales.cancelledAt,
        paidCents: paidOf(input.installmentId),
      })
      .from(installments)
      .innerJoin(sales, eq(installments.saleId, sales.id))
      .where(
        and(
          eq(installments.id, input.installmentId),
          eq(installments.clinicId, clinicId),
        ),
      );
    if (!part) return { error: "Parcela não encontrada." };
    if (part.saleCancelledAt) return { error: "Esta venda foi cancelada." };
    if (part.cancelledAt) return { error: "Esta parcela foi cancelada." };
    const remaining = part.amountCents - part.paidCents;
    if (remaining <= 0) return { error: "Esta parcela já está paga." };

    const [open] = await tx
      .select()
      .from(mercadoPagoCharges)
      .where(
        and(
          eq(mercadoPagoCharges.installmentId, part.id),
          eq(mercadoPagoCharges.status, "pending"),
          eq(mercadoPagoCharges.amountCents, remaining),
          gt(mercadoPagoCharges.expiresAt, new Date(now.getTime() + DAY_MS)),
        ),
      )
      .orderBy(desc(mercadoPagoCharges.createdAt))
      .limit(1);
    return { number: part.number, remaining, open };
  });
  if ("error" in check) return fail(check.error);
  if (check.open) return { ok: true, link: toLink(check.open) };

  const accessToken = await accessTokenFor(clinicId, fetchImpl, now);
  const chargeId = randomUUID();
  const created = await createOrder(
    {
      accessToken,
      chargeId,
      title: `${input.clinicName} · parcela ${check.number}`.slice(0, 120),
      amountCents: check.remaining,
      expiresIn: `P${LINK_DAYS}D`,
    },
    fetchImpl,
  );
  const order = readOrder(created);
  const checkoutUrl = created.checkout_url;
  if (typeof checkoutUrl !== "string" || !checkoutUrl.startsWith("https://")) {
    throw new Error("O Mercado Pago não devolveu o link de pagamento.");
  }

  const [row] = await inClinic(clinicId, async (tx) => {
    const inserted = await tx
      .insert(mercadoPagoCharges)
      .values({
        id: chargeId,
        clinicId,
        installmentId: input.installmentId,
        amountCents: check.remaining,
        orderId: order.id,
        checkoutUrl,
        statusDetail: order.statusDetail,
        expiresAt: new Date(now.getTime() + LINK_DAYS * DAY_MS),
        createdByUserId: actorUserId,
      })
      .returning();
    await tx.insert(auditLogs).values({
      clinicId,
      actorType: "admin",
      actorUserId,
      action: "mercado_pago.charge_created",
      entityType: "installment",
      entityId: input.installmentId,
      changes: { chargeId, amountCents: check.remaining },
    });
    return inserted;
  });
  return { ok: true, link: toLink(row!) };
}

function toLink(row: typeof mercadoPagoCharges.$inferSelect): ChargeLink {
  return {
    id: row.id,
    installmentId: row.installmentId,
    amountCents: row.amountCents,
    checkoutUrl: row.checkoutUrl,
    expiresAt: row.expiresAt,
    status: row.status,
  };
}

// The latest link of each installment of a sale, for the sale page.
// `usable`: still waiting for the patient and not expired.
export async function listSaleCharges(
  clinicId: string,
  saleId: string,
  now: Date = new Date(),
): Promise<(ChargeLink & { usable: boolean })[]> {
  const rows = await inClinic(clinicId, (tx) =>
    tx
      .select({ charge: mercadoPagoCharges })
      .from(mercadoPagoCharges)
      .innerJoin(
        installments,
        eq(mercadoPagoCharges.installmentId, installments.id),
      )
      .where(
        and(
          eq(installments.saleId, saleId),
          eq(mercadoPagoCharges.clinicId, clinicId),
        ),
      )
      .orderBy(desc(mercadoPagoCharges.createdAt)),
  );
  const latest = new Map<string, ChargeLink & { usable: boolean }>();
  for (const { charge } of rows) {
    if (!latest.has(charge.installmentId)) {
      latest.set(charge.installmentId, {
        ...toLink(charge),
        usable: charge.status === "pending" && charge.expiresAt > now,
      });
    }
  }
  return [...latest.values()];
}

// ---------------------------------------------------------- notifications

export type NotificationResult =
  "unknown" | "paid" | "conflict" | "refunded" | "closed" | "unchanged";

const REFUND_REASON = "Devolvido pelo Mercado Pago";

// Called by the webhook once the signature checks out. It never trusts the
// notification itself: it reads the order from Mercado Pago with the
// clinic's token and acts on what the order says. Running it twice for the
// same news changes nothing.
export async function handleOrderNotification(
  orderId: string,
  fetchImpl: Fetch = fetch,
  now: Date = new Date(),
): Promise<NotificationResult> {
  const lookup = await panelDb.execute<{ clinic_id: string | null }>(
    sql`select mercado_pago_order_clinic(${orderId}) as clinic_id`,
  );
  const clinicId = lookup.rows[0]?.clinic_id;
  if (!clinicId) return "unknown";

  const accessToken = await accessTokenFor(clinicId, fetchImpl, now);
  const order = readOrder(await getOrder({ accessToken, orderId }, fetchImpl));
  if (order.id !== orderId) return "unknown";
  const outcome = orderOutcome(order);

  return inClinic(clinicId, async (tx): Promise<NotificationResult> => {
    const [charge] = await tx
      .select()
      .from(mercadoPagoCharges)
      .where(
        and(
          eq(mercadoPagoCharges.orderId, orderId),
          eq(mercadoPagoCharges.clinicId, clinicId),
        ),
      )
      .for("update");
    if (!charge || order.externalReference !== charge.id) return "unknown";

    const setStatus = (
      status: ChargeLink["status"],
      paymentId: string | null = charge.paymentId,
    ) =>
      tx
        .update(mercadoPagoCharges)
        .set({ status, statusDetail: order.statusDetail, paymentId })
        .where(eq(mercadoPagoCharges.id, charge.id));

    if (outcome === "paid" && charge.status === "pending") {
      const [part] = await tx
        .select({
          amountCents: installments.amountCents,
          cancelledAt: installments.cancelledAt,
          saleId: installments.saleId,
          saleCancelledAt: sales.cancelledAt,
          paidCents: paidOf(charge.installmentId),
        })
        .from(installments)
        .innerJoin(sales, eq(installments.saleId, sales.id))
        .where(eq(installments.id, charge.installmentId))
        .for("update", { of: installments });
      const remaining = part ? part.amountCents - part.paidCents : 0;
      if (
        !part ||
        part.cancelledAt ||
        part.saleCancelledAt ||
        remaining < charge.amountCents
      ) {
        await setStatus("conflict");
        await audit("mercado_pago.charge_conflict", charge.installmentId, {
          chargeId: charge.id,
        });
        return "conflict";
      }
      const methodId = await ensureMercadoPagoMethod(tx, clinicId);
      const [payment] = await tx
        .insert(payments)
        .values({
          clinicId,
          installmentId: charge.installmentId,
          paidOn: todayLocal(),
          amountCents: charge.amountCents,
          paymentMethodId: methodId,
          notes: "Pago pelo link do Mercado Pago",
        })
        .returning({ id: payments.id });
      await setStatus("paid", payment!.id);
      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "system",
        action: "payment.received",
        entityType: "payment",
        entityId: payment!.id,
        changes: {
          saleId: part.saleId,
          installmentId: charge.installmentId,
          amountCents: charge.amountCents,
          chargeId: charge.id,
        },
      });
      return "paid";
    }

    if (outcome === "refunded" && charge.status === "paid") {
      await tx
        .update(payments)
        .set({ reversedAt: now, reversalReason: REFUND_REASON })
        .where(
          and(
            eq(payments.id, charge.paymentId!),
            sql`${payments.reversedAt} is null`,
          ),
        );
      await setStatus("refunded");
      await audit("payment.reversed", charge.installmentId, {
        chargeId: charge.id,
        amountCents: charge.amountCents,
      });
      return "refunded";
    }

    if (
      (outcome === "closed" && charge.status === "pending") ||
      (outcome === "refunded" && charge.status === "conflict")
    ) {
      await setStatus("closed");
      return "closed";
    }

    if (order.statusDetail !== charge.statusDetail) {
      await setStatus(charge.status);
    }
    return "unchanged";

    async function audit(
      action: string,
      entityId: string,
      changes: Record<string, unknown>,
    ) {
      await tx.insert(auditLogs).values({
        clinicId: clinicId!,
        actorType: "system",
        action,
        entityType: "installment",
        entityId,
        changes,
      });
    }
  });
}

// ----------------------------------------------------------------- refunds

// "Estornar" on a payment that came from a link: the money goes back to the
// patient at Mercado Pago first, then the payment is reversed here. Payments
// recorded by hand are only reversed here.
export async function reverseWithRefund(
  clinicId: string,
  paymentId: string,
  reason: string,
  actorUserId: string,
  fetchImpl: Fetch = fetch,
): Promise<{ ok: true; id: string } | { ok: false; formError: string }> {
  const [charge] = await inClinic(clinicId, (tx) =>
    tx
      .select()
      .from(mercadoPagoCharges)
      .where(
        and(
          eq(mercadoPagoCharges.paymentId, paymentId),
          eq(mercadoPagoCharges.clinicId, clinicId),
        ),
      ),
  );
  if (!charge || charge.status !== "paid") {
    return reversePayment(clinicId, paymentId, reason, actorUserId).then(
      (result) =>
        result.ok
          ? { ok: true as const, id: result.id }
          : {
              ok: false as const,
              formError: result.formError ?? "Não foi possível estornar.",
            },
    );
  }

  try {
    const accessToken = await accessTokenFor(clinicId, fetchImpl);
    await refundOrder(
      {
        accessToken,
        orderId: charge.orderId,
        idempotencyKey: `refund-${charge.id}`,
      },
      fetchImpl,
    );
  } catch {
    return {
      ok: false,
      formError:
        "O Mercado Pago não aceitou a devolução agora. Tente de novo ou devolva pelo app do Mercado Pago.",
    };
  }

  const result = await reversePayment(clinicId, paymentId, reason, actorUserId);
  await inClinic(clinicId, (tx) =>
    tx
      .update(mercadoPagoCharges)
      .set({ status: "refunded" })
      .where(
        and(
          eq(mercadoPagoCharges.id, charge.id),
          eq(mercadoPagoCharges.status, "paid"),
        ),
      ),
  );
  // The webhook may have reversed it first: the refund went through anyway.
  return { ok: true, id: result.ok ? result.id : paymentId };
}
