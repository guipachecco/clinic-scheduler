import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { DateTime } from "luxon";

import type { Tx } from "@/db/client";
import {
  appointments,
  installments,
  saleItems,
  sales,
  saleSessions,
} from "@/db/schema";
import { CLINIC_TIME_ZONE } from "@/modules/schedule/time";

// Keeps a package session and its "por sessão" installment in step with the
// appointment. Called inside the agenda's transaction after every change, and
// after the financial module schedules sessions. Imports only the schema, so
// the agenda module can call it without an import cycle.
//
// - Cancelled or no-show: the session goes back to the package, and its
//   installment loses the link and the due date (a paid one stays paid, as
//   the patient's credit for the next session).
// - Requested, confirmed or completed: the installment follows the date. A
//   session without an installment takes the next free one of the item:
//   first a paid one without a session, then the lowest open number.

// Statuses that use up a session of the package.
export const SESSION_COUNTING_STATUSES = [
  "requested",
  "confirmed",
  "completed",
] as const;

const localDate = (instant: Date) =>
  DateTime.fromJSDate(instant, { zone: CLINIC_TIME_ZONE }).toFormat(
    "yyyy-MM-dd",
  );

export async function syncSessionInstallment(
  tx: Tx,
  clinicId: string,
  appointmentId: string,
): Promise<void> {
  const [link] = await tx
    .select({
      saleItemId: saleSessions.saleItemId,
      status: appointments.status,
      startsAt: appointments.startsAt,
      plan: sales.paymentPlan,
      saleCancelled: sales.cancelledAt,
    })
    .from(saleSessions)
    .innerJoin(appointments, eq(saleSessions.appointmentId, appointments.id))
    .innerJoin(saleItems, eq(saleSessions.saleItemId, saleItems.id))
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .where(
      and(
        eq(saleSessions.clinicId, clinicId),
        eq(saleSessions.appointmentId, appointmentId),
      ),
    )
    .limit(1);
  if (!link || link.plan !== "per_session") return;

  const [current] = await tx
    .select({ id: installments.id })
    .from(installments)
    .where(
      and(
        eq(installments.clinicId, clinicId),
        eq(installments.appointmentId, appointmentId),
      ),
    )
    .for("update");

  const counts = (SESSION_COUNTING_STATUSES as readonly string[]).includes(
    link.status,
  );
  if (!counts) {
    if (current) {
      await tx
        .update(installments)
        .set({ appointmentId: null, dueDate: null })
        .where(eq(installments.id, current.id));
    }
    return;
  }

  const dueDate = localDate(link.startsAt);
  if (current) {
    await tx
      .update(installments)
      .set({ dueDate })
      .where(eq(installments.id, current.id));
    return;
  }
  if (link.saleCancelled) return;

  // Paid (and not reversed) without a session first, then by number.
  // Explicit names: Drizzle writes columns unqualified inside sql``.
  const paidSql = sql<number>`coalesce((
    select sum(p.amount_cents) from payments p
    where p.installment_id = "installments"."id"
      and p.reversed_at is null), 0)`;
  const [free] = await tx
    .select({ id: installments.id })
    .from(installments)
    .where(
      and(
        eq(installments.clinicId, clinicId),
        eq(installments.saleItemId, link.saleItemId),
        isNull(installments.appointmentId),
        isNull(installments.cancelledAt),
      ),
    )
    .orderBy(
      sql`(${paidSql} >= ${installments.amountCents}) desc`,
      asc(installments.number),
    )
    .limit(1)
    .for("update");
  if (!free) return;
  await tx
    .update(installments)
    .set({ appointmentId, dueDate })
    .where(eq(installments.id, free.id));
}

// How many sessions of an item the payments so far cover ("parcela da
// sessão paga"). Por sessão: one per paid installment of the item. À vista
// and parcelado: the paid share of the sale, so 10 installments for 10
// sessions free one session per installment. A free sale covers them all.
export function paidSessions(input: {
  plan: "upfront" | "installments" | "per_session";
  sessions: number;
  paidInstallments: number;
  salePaidCents: number;
  saleTotalCents: number;
}): number {
  if (input.plan === "per_session") {
    return Math.min(input.sessions, input.paidInstallments);
  }
  if (input.saleTotalCents <= 0) return input.sessions;
  return Math.min(
    input.sessions,
    Math.floor((input.sessions * input.salePaidCents) / input.saleTotalCents),
  );
}

// Sessions of the item that may still be scheduled: paid for and not yet
// used. Zero for a cancelled sale or a product.
export async function bookableSessions(
  tx: Tx,
  clinicId: string,
  saleItemId: string,
): Promise<number> {
  const [item] = await tx
    .select({
      saleId: saleItems.saleId,
      serviceId: saleItems.serviceId,
      sessions: saleItems.sessions,
      plan: sales.paymentPlan,
      saleTotalCents: sales.totalCents,
      cancelledAt: sales.cancelledAt,
    })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .where(and(eq(saleItems.id, saleItemId), eq(saleItems.clinicId, clinicId)))
    .limit(1);
  if (!item || item.cancelledAt || item.serviceId === null) return 0;

  const [used] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(saleSessions)
    .innerJoin(appointments, eq(saleSessions.appointmentId, appointments.id))
    .where(
      and(
        eq(saleSessions.saleItemId, saleItemId),
        inArray(appointments.status, [...SESSION_COUNTING_STATUSES]),
      ),
    );
  const paidSql = sql<number>`coalesce((
    select sum(p.amount_cents) from payments p
    where p.installment_id = "installments"."id"
      and p.reversed_at is null), 0)`;
  const [paid] = await tx
    .select({
      cents: sql<number>`coalesce(sum(${paidSql}), 0)::int`,
      itemPaid: sql<number>`count(*) filter (where ${installments.saleItemId} = ${saleItemId} and ${installments.cancelledAt} is null and ${paidSql} >= ${installments.amountCents})::int`,
    })
    .from(installments)
    .where(
      and(
        eq(installments.clinicId, clinicId),
        eq(installments.saleId, item.saleId),
      ),
    );
  const covered = paidSessions({
    plan: item.plan,
    sessions: item.sessions,
    paidInstallments: paid?.itemPaid ?? 0,
    salePaidCents: paid?.cents ?? 0,
    saleTotalCents: item.saleTotalCents,
  });
  return Math.max(0, covered - (used?.count ?? 0));
}

// The oldest package item of the patient for this service with a paid
// session left to schedule, or null.
export async function findPaidPackageItem(
  tx: Tx,
  clinicId: string,
  patientId: string,
  serviceId: string,
): Promise<string | null> {
  const items = await tx
    .select({ id: saleItems.id })
    .from(saleItems)
    .innerJoin(sales, eq(saleItems.saleId, sales.id))
    .where(
      and(
        eq(saleItems.clinicId, clinicId),
        eq(saleItems.serviceId, serviceId),
        eq(sales.patientId, patientId),
        isNull(sales.cancelledAt),
      ),
    )
    .orderBy(asc(sales.createdAt), asc(saleItems.sortOrder));
  for (const item of items) {
    if ((await bookableSessions(tx, clinicId, item.id)) > 0) return item.id;
  }
  return null;
}
