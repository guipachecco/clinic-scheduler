import "server-only";

import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { inClinic, type Tx } from "@/db/client";
import { isAppointmentOverlapError } from "@/db/errors";
import {
  appointments,
  auditLogs,
  installments,
  patients,
  paymentMethods,
  payments,
  quotes,
  saleItems,
  saleRevisions,
  sales,
  saleSessions,
  services,
} from "@/db/schema";
import {
  insertSessionAppointments,
  lockAgenda,
  type SessionSlotProblem,
} from "@/modules/appointments/appointments";
import { ANONYMIZED_NAME } from "@/modules/patients/patients";
import { localToUtc } from "@/modules/schedule/time";

import type {
  PaymentValues,
  ReviseValues,
  ScheduleSessionsValues,
} from "./fields";
import { installmentState, sessionAmounts, splitAmount } from "./money";
import { monthlyDueDates } from "./recurrence";
import {
  SESSION_COUNTING_STATUSES,
  syncSessionInstallment,
} from "./session-links";

// Sales of one clinic: what was sold, what is owed and what came in. Every
// function takes the clinicId from the session. Nothing is deleted: payments
// are reversed and sales are cancelled, both with a reason.

export type SaleResult =
  | { ok: true; id: string }
  | {
      ok: false;
      formError?: string;
      fieldErrors?: Record<string, string>;
      problems?: SessionSlotProblem[];
    };

export type InstallmentState = ReturnType<typeof installmentState>;

export type SaleDetail = {
  id: string;
  quoteId: string;
  quoteNumber: number;
  patientId: string;
  patientName: string;
  paymentPlan: "upfront" | "installments" | "per_session";
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  items: {
    id: string;
    serviceId: string;
    serviceName: string;
    sessions: number;
    totalCents: number;
    // Sessions that use up the package: requested, confirmed or completed.
    used: number;
    done: number;
    remaining: number;
    appointments: { id: string; startsAt: Date; status: string }[];
  }[];
  installments: {
    id: string;
    number: number;
    amountCents: number;
    paidCents: number;
    dueDate: string | null;
    state: InstallmentState;
    saleItemId: string | null;
    sessionStartsAt: Date | null;
  }[];
  payments: {
    id: string;
    installmentNumber: number;
    paidOn: string;
    amountCents: number;
    methodName: string;
    notes: string | null;
    createdAt: Date;
    reversedAt: Date | null;
    reversalReason: string | null;
  }[];
  revisions: {
    id: string;
    reason: string;
    createdAt: Date;
    before: Snapshot;
    after: Snapshot;
  }[];
};

export type SaleListItem = {
  id: string;
  quoteNumber: number;
  patientId: string;
  patientName: string;
  paymentPlan: SaleDetail["paymentPlan"];
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  cancelled: boolean;
  createdAt: Date;
};

type Snapshot = {
  totalCents: number;
  items: { serviceName: string; sessions: number; totalCents: number }[];
  installments: {
    number: number;
    amountCents: number;
    dueDate: string | null;
    cancelled: boolean;
  }[];
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SALE_NOT_FOUND = "Venda não encontrada.";
const SALE_CANCELLED = "Esta venda foi cancelada.";

type Executor = Pick<Tx, "select">;

const fail = (formError: string): SaleResult => ({ ok: false, formError });

function unexpected(error: unknown): Error {
  return new Error("Não foi possível salvar no financeiro.", { cause: error });
}

// Sum of the payments of an installment that were not reversed. Raw SQL
// with explicit table names: Drizzle writes columns unqualified inside sql``,
// and an unqualified "id" in the subquery would mean payments.id. Only for
// queries whose outer table is "installments" (not aliased).
const paidOf = () =>
  sql<number>`coalesce((
    select sum(p.amount_cents) from payments p
    where p.installment_id = "installments"."id"
      and p.reversed_at is null), 0)::int`;

const counting = [...SESSION_COUNTING_STATUSES];

async function lockSale(tx: Tx, clinicId: string, saleId: string) {
  const [sale] = await tx
    .select()
    .from(sales)
    .where(and(eq(sales.id, saleId), eq(sales.clinicId, clinicId)))
    .for("update");
  return sale;
}

async function snapshot(executor: Executor, saleId: string): Promise<Snapshot> {
  const [sale] = await executor
    .select({ totalCents: sales.totalCents })
    .from(sales)
    .where(eq(sales.id, saleId));
  const items = await executor
    .select({
      serviceName: saleItems.serviceName,
      sessions: saleItems.sessions,
      totalCents: saleItems.totalCents,
    })
    .from(saleItems)
    .where(eq(saleItems.saleId, saleId))
    .orderBy(asc(saleItems.sortOrder));
  const parts = await executor
    .select({
      number: installments.number,
      amountCents: installments.amountCents,
      dueDate: installments.dueDate,
      cancelledAt: installments.cancelledAt,
    })
    .from(installments)
    .where(eq(installments.saleId, saleId))
    .orderBy(asc(installments.number));
  return {
    totalCents: sale?.totalCents ?? 0,
    items,
    installments: parts.map((part) => ({
      number: part.number,
      amountCents: part.amountCents,
      dueDate: part.dueDate,
      cancelled: part.cancelledAt !== null,
    })),
  };
}

// ---------------------------------------------------------------- reading

export async function getSale(
  clinicId: string,
  id: string,
  today: string,
): Promise<SaleDetail | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const [sale] = await inClinic(clinicId, (tx) =>
    tx
      .select({
        id: sales.id,
        quoteId: sales.quoteId,
        quoteNumber: quotes.number,
        patientId: sales.patientId,
        patientName: patients.name,
        anonymizedAt: patients.anonymizedAt,
        paymentPlan: sales.paymentPlan,
        totalCents: sales.totalCents,
        cancelledAt: sales.cancelledAt,
        cancellationReason: sales.cancellationReason,
        createdAt: sales.createdAt,
      })
      .from(sales)
      .innerJoin(quotes, eq(sales.quoteId, quotes.id))
      .innerJoin(patients, eq(sales.patientId, patients.id))
      .where(and(eq(sales.id, id), eq(sales.clinicId, clinicId)))
      .limit(1),
  );
  if (!sale) return null;

  // One transaction runs one query at a time: each is awaited in turn.
  const [items, sessions, parts, paid, revisions] = await inClinic(
    clinicId,
    async (tx) =>
      Promise.all([
        await tx
          .select()
          .from(saleItems)
          .where(eq(saleItems.saleId, id))
          .orderBy(asc(saleItems.sortOrder)),
        await tx
          .select({
            saleItemId: saleSessions.saleItemId,
            id: appointments.id,
            startsAt: appointments.startsAt,
            status: appointments.status,
          })
          .from(saleSessions)
          .innerJoin(saleItems, eq(saleSessions.saleItemId, saleItems.id))
          .innerJoin(
            appointments,
            eq(saleSessions.appointmentId, appointments.id),
          )
          .where(eq(saleItems.saleId, id))
          .orderBy(asc(appointments.startsAt)),
        await tx
          .select({
            id: installments.id,
            number: installments.number,
            amountCents: installments.amountCents,
            dueDate: installments.dueDate,
            cancelledAt: installments.cancelledAt,
            saleItemId: installments.saleItemId,
            paidCents: paidOf(),
            sessionStartsAt: appointments.startsAt,
          })
          .from(installments)
          .leftJoin(
            appointments,
            eq(installments.appointmentId, appointments.id),
          )
          .where(eq(installments.saleId, id))
          .orderBy(asc(installments.number)),
        await tx
          .select({
            id: payments.id,
            installmentNumber: installments.number,
            paidOn: payments.paidOn,
            amountCents: payments.amountCents,
            methodName: paymentMethods.name,
            notes: payments.notes,
            createdAt: payments.createdAt,
            reversedAt: payments.reversedAt,
            reversalReason: payments.reversalReason,
          })
          .from(payments)
          .innerJoin(installments, eq(payments.installmentId, installments.id))
          .innerJoin(
            paymentMethods,
            eq(payments.paymentMethodId, paymentMethods.id),
          )
          .where(eq(installments.saleId, id))
          .orderBy(desc(payments.paidOn), desc(payments.createdAt)),
        await tx
          .select()
          .from(saleRevisions)
          .where(eq(saleRevisions.saleId, id))
          .orderBy(asc(saleRevisions.createdAt)),
      ]),
  );

  const cancelled = sale.cancelledAt !== null;
  const installmentsOut = parts.map((part) => ({
    id: part.id,
    number: part.number,
    amountCents: part.amountCents,
    paidCents: part.paidCents,
    dueDate: part.dueDate,
    saleItemId: part.saleItemId,
    sessionStartsAt: part.sessionStartsAt,
    state: installmentState({
      amountCents: part.amountCents,
      paidCents: part.paidCents,
      cancelled: part.cancelledAt !== null,
      dueDate: part.dueDate,
      today,
    }),
  }));
  const paidCents = installmentsOut.reduce(
    (sum, part) => sum + part.paidCents,
    0,
  );
  const outstandingCents = cancelled
    ? 0
    : installmentsOut
        .filter((part) => part.state !== "cancelled")
        .reduce(
          (sum, part) => sum + Math.max(0, part.amountCents - part.paidCents),
          0,
        );

  return {
    id: sale.id,
    quoteId: sale.quoteId,
    quoteNumber: sale.quoteNumber,
    patientId: sale.patientId,
    patientName: sale.anonymizedAt ? ANONYMIZED_NAME : sale.patientName,
    paymentPlan: sale.paymentPlan,
    totalCents: sale.totalCents,
    paidCents,
    outstandingCents,
    cancelledAt: sale.cancelledAt,
    cancellationReason: sale.cancellationReason,
    createdAt: sale.createdAt,
    items: items.map((item) => {
      const mine = sessions.filter((s) => s.saleItemId === item.id);
      const used = mine.filter((s) =>
        (counting as string[]).includes(s.status),
      ).length;
      return {
        id: item.id,
        serviceId: item.serviceId!,
        serviceName: item.serviceName,
        sessions: item.sessions,
        totalCents: item.totalCents,
        used,
        done: mine.filter((s) => s.status === "completed").length,
        remaining: Math.max(0, item.sessions - used),
        appointments: mine.map((s) => ({
          id: s.id,
          startsAt: s.startsAt,
          status: s.status,
        })),
      };
    }),
    installments: installmentsOut,
    payments: paid,
    revisions: revisions.map((revision) => ({
      id: revision.id,
      reason: revision.reason,
      createdAt: revision.createdAt,
      before: revision.before as Snapshot,
      after: revision.after as Snapshot,
    })),
  };
}

export async function listSales(
  clinicId: string,
  input: { patientId?: string } = {},
): Promise<SaleListItem[]> {
  const paidSql = sql<number>`coalesce((
    select sum(p.amount_cents) from payments p
    inner join installments i on p.installment_id = i.id
    where i.sale_id = "sales"."id" and p.reversed_at is null), 0)::int`;
  const owedSql = sql<number>`coalesce((
    select sum(greatest(0, i.amount_cents - coalesce((
      select sum(p.amount_cents) from payments p
      where p.installment_id = i.id and p.reversed_at is null), 0)))
    from installments i
    where i.sale_id = "sales"."id" and i.cancelled_at is null), 0)::int`;
  const rows = await inClinic(clinicId, (tx) =>
    tx
      .select({
        id: sales.id,
        quoteNumber: quotes.number,
        patientId: sales.patientId,
        patientName: patients.name,
        anonymizedAt: patients.anonymizedAt,
        paymentPlan: sales.paymentPlan,
        totalCents: sales.totalCents,
        cancelledAt: sales.cancelledAt,
        createdAt: sales.createdAt,
        paidCents: paidSql,
        owedCents: owedSql,
      })
      .from(sales)
      .innerJoin(quotes, eq(sales.quoteId, quotes.id))
      .innerJoin(patients, eq(sales.patientId, patients.id))
      .where(
        and(
          eq(sales.clinicId, clinicId),
          input.patientId ? eq(sales.patientId, input.patientId) : undefined,
        ),
      )
      .orderBy(desc(sales.createdAt))
      .limit(200),
  );
  return rows.map((row) => ({
    id: row.id,
    quoteNumber: row.quoteNumber,
    patientId: row.patientId,
    patientName: row.anonymizedAt ? ANONYMIZED_NAME : row.patientName,
    paymentPlan: row.paymentPlan,
    totalCents: row.totalCents,
    paidCents: row.paidCents,
    outstandingCents: row.cancelledAt ? 0 : row.owedCents,
    cancelled: row.cancelledAt !== null,
    createdAt: row.createdAt,
  }));
}

export async function listPaymentMethods(clinicId: string) {
  return inClinic(clinicId, (tx) =>
    tx
      .select({ id: paymentMethods.id, name: paymentMethods.name })
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.clinicId, clinicId),
          eq(paymentMethods.isActive, true),
        ),
      )
      .orderBy(asc(paymentMethods.sortOrder), asc(paymentMethods.name)),
  );
}

// The open installment of a package session, for "Receber agora" on the
// appointment page. Null when there is none or it is already paid.
export async function findSessionInstallment(
  clinicId: string,
  appointmentId: string,
): Promise<{
  installmentId: string;
  saleId: string;
  outstandingCents: number;
} | null> {
  if (!UUID_PATTERN.test(appointmentId)) return null;
  const [row] = await inClinic(clinicId, (tx) =>
    tx
      .select({
        installmentId: installments.id,
        saleId: installments.saleId,
        amountCents: installments.amountCents,
        paidCents: paidOf(),
      })
      .from(installments)
      .innerJoin(sales, eq(installments.saleId, sales.id))
      .where(
        and(
          eq(installments.clinicId, clinicId),
          eq(installments.appointmentId, appointmentId),
          isNull(installments.cancelledAt),
          isNull(sales.cancelledAt),
        ),
      )
      .limit(1),
  );
  if (!row || row.paidCents >= row.amountCents) return null;
  return {
    installmentId: row.installmentId,
    saleId: row.saleId,
    outstandingCents: row.amountCents - row.paidCents,
  };
}

// --------------------------------------------------------------- payments

export async function receivePayment(
  clinicId: string,
  values: PaymentValues,
  actorUserId: string,
): Promise<SaleResult> {
  try {
    return await inClinic(clinicId, async (tx): Promise<SaleResult> => {
      const [part] = await tx
        .select({
          id: installments.id,
          saleId: installments.saleId,
          amountCents: installments.amountCents,
          cancelledAt: installments.cancelledAt,
        })
        .from(installments)
        .where(
          and(
            eq(installments.id, values.installmentId),
            eq(installments.clinicId, clinicId),
          ),
        )
        .for("update");
      if (!part) return fail("Parcela não encontrada.");
      const sale = await lockSale(tx, clinicId, part.saleId);
      if (!sale) return fail(SALE_NOT_FOUND);
      if (sale.cancelledAt) return fail(SALE_CANCELLED);
      if (part.cancelledAt) return fail("Esta parcela foi cancelada.");

      const [method] = await tx
        .select({ id: paymentMethods.id })
        .from(paymentMethods)
        .where(
          and(
            eq(paymentMethods.id, values.paymentMethodId),
            eq(paymentMethods.clinicId, clinicId),
            eq(paymentMethods.isActive, true),
          ),
        );
      if (!method) {
        return {
          ok: false,
          fieldErrors: { paymentMethodId: "Escolha a forma de pagamento." },
        };
      }

      const [paid] = await tx
        .select({ value: paidOf() })
        .from(installments)
        .where(eq(installments.id, part.id));
      const remaining = part.amountCents - (paid?.value ?? 0);
      if (remaining <= 0) return fail("Esta parcela já está paga.");
      if (values.amount > remaining) {
        return {
          ok: false,
          fieldErrors: {
            amount:
              "O valor passa do que falta nesta parcela. Para adiantar, receba as próximas parcelas.",
          },
        };
      }

      const [row] = await tx
        .insert(payments)
        .values({
          clinicId,
          installmentId: part.id,
          paidOn: values.paidOn,
          amountCents: values.amount,
          paymentMethodId: method.id,
          notes: values.notes,
          createdByUserId: actorUserId,
        })
        .returning({ id: payments.id });
      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: "payment.received",
        entityType: "payment",
        entityId: row!.id,
        changes: {
          saleId: part.saleId,
          installmentId: part.id,
          amountCents: values.amount,
          paidOn: values.paidOn,
        },
      });
      return { ok: true, id: row!.id };
    });
  } catch (error) {
    throw unexpected(error);
  }
}

// The payment stays, struck through, and stops counting. The cash report
// shows the reversal on the day it was made.
export async function reversePayment(
  clinicId: string,
  paymentId: string,
  reason: string,
  actorUserId: string,
  now: Date = new Date(),
): Promise<SaleResult> {
  if (!UUID_PATTERN.test(paymentId)) return fail("Pagamento não encontrado.");
  return inClinic(clinicId, async (tx): Promise<SaleResult> => {
    const [payment] = await tx
      .select({
        id: payments.id,
        reversedAt: payments.reversedAt,
        amountCents: payments.amountCents,
        installmentId: payments.installmentId,
      })
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.clinicId, clinicId)))
      .for("update");
    if (!payment) return fail("Pagamento não encontrado.");
    if (payment.reversedAt) return fail("Este pagamento já foi estornado.");
    await tx
      .update(payments)
      .set({
        reversedAt: now,
        reversedByUserId: actorUserId,
        reversalReason: reason,
      })
      .where(eq(payments.id, paymentId));
    await tx.insert(auditLogs).values({
      clinicId,
      actorType: "admin",
      actorUserId,
      action: "payment.reversed",
      entityType: "payment",
      entityId: paymentId,
      changes: {
        installmentId: payment.installmentId,
        amountCents: payment.amountCents,
      },
    });
    return { ok: true, id: paymentId };
  });
}

// ------------------------------------------------------------ cancelling

// Cancels the installments not paid at all. Paid and partly paid ones stay
// as history. Future sessions are cancelled too when asked.
export async function cancelSale(
  clinicId: string,
  saleId: string,
  input: { reason: string; cancelFutureSessions: boolean },
  actorUserId: string,
  now: Date = new Date(),
): Promise<SaleResult> {
  if (!UUID_PATTERN.test(saleId)) return fail(SALE_NOT_FOUND);
  try {
    return await inClinic(clinicId, async (tx): Promise<SaleResult> => {
      if (input.cancelFutureSessions) await lockAgenda(tx, clinicId);
      const sale = await lockSale(tx, clinicId, saleId);
      if (!sale) return fail(SALE_NOT_FOUND);
      if (sale.cancelledAt) return fail(SALE_CANCELLED);
      const before = await snapshot(tx, saleId);

      await tx
        .update(sales)
        .set({ cancelledAt: now, cancellationReason: input.reason })
        .where(eq(sales.id, saleId));
      await tx
        .update(installments)
        .set({ cancelledAt: now })
        .where(
          and(
            eq(installments.saleId, saleId),
            isNull(installments.cancelledAt),
            sql`${paidOf()} = 0`,
          ),
        );

      let cancelledSessions = 0;
      if (input.cancelFutureSessions) {
        const future = await tx
          .select({ id: appointments.id })
          .from(saleSessions)
          .innerJoin(saleItems, eq(saleSessions.saleItemId, saleItems.id))
          .innerJoin(
            appointments,
            eq(saleSessions.appointmentId, appointments.id),
          )
          .where(
            and(
              eq(saleItems.saleId, saleId),
              inArray(appointments.status, ["requested", "confirmed"]),
              gt(appointments.startsAt, now),
            ),
          );
        for (const { id } of future) {
          await tx
            .update(appointments)
            .set({
              status: "cancelled",
              cancelledAt: now,
              cancelledBy: "clinic",
              cancellationReason: "other",
            })
            .where(eq(appointments.id, id));
          await tx.insert(auditLogs).values({
            clinicId,
            actorType: "admin",
            actorUserId,
            action: "appointment.status_changed",
            entityType: "appointment",
            entityId: id,
            changes: {
              to: "cancelled",
              reason: "other",
              saleCancelled: saleId,
            },
          });
          await syncSessionInstallment(tx, clinicId, id);
        }
        cancelledSessions = future.length;
      }

      await tx.insert(saleRevisions).values({
        clinicId,
        saleId,
        actorUserId,
        reason: `Venda cancelada: ${input.reason}`,
        before,
        after: await snapshot(tx, saleId),
      });
      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: "sale.cancelled",
        entityType: "sale",
        entityId: saleId,
        changes: { cancelledSessions },
      });
      return { ok: true, id: saleId };
    });
  } catch (error) {
    throw unexpected(error);
  }
}

// ------------------------------------------------------- package sessions

export async function scheduleSessions(
  clinicId: string,
  values: ScheduleSessionsValues,
  actorUserId: string,
  now: Date = new Date(),
): Promise<SaleResult> {
  try {
    return await inClinic(clinicId, async (tx): Promise<SaleResult> => {
      await lockAgenda(tx, clinicId);
      const [item] = await tx
        .select({
          id: saleItems.id,
          saleId: saleItems.saleId,
          serviceId: saleItems.serviceId,
          sessions: saleItems.sessions,
        })
        .from(saleItems)
        .where(
          and(
            eq(saleItems.id, values.saleItemId),
            eq(saleItems.clinicId, clinicId),
          ),
        )
        .limit(1);
      if (!item) return fail("Item da venda não encontrado.");
      const sale = await lockSale(tx, clinicId, item.saleId);
      if (!sale) return fail(SALE_NOT_FOUND);
      if (sale.cancelledAt) return fail(SALE_CANCELLED);

      const [used] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(saleSessions)
        .innerJoin(
          appointments,
          eq(saleSessions.appointmentId, appointments.id),
        )
        .where(
          and(
            eq(saleSessions.saleItemId, item.id),
            inArray(appointments.status, counting),
          ),
        );
      const remaining = item.sessions - (used?.count ?? 0);
      if (values.slots.length > remaining) {
        return fail(
          remaining === 0
            ? "Todas as sessões deste item já estão agendadas."
            : `Faltam só ${remaining} sessões para agendar neste item.`,
        );
      }

      const slots = values.slots.map((slot) => {
        const startsAt = localToUtc(slot.date, slot.startTime);
        return {
          startsAt,
          endsAt: new Date(
            startsAt.getTime() + values.durationMinutes * 60_000,
          ),
        };
      });
      const created = await insertSessionAppointments(
        tx,
        clinicId,
        {
          patientId: sale.patientId,
          serviceId: item.serviceId!,
          slots,
          acknowledgeWarnings: values.acknowledgeWarnings,
        },
        actorUserId,
        now,
      );
      if (!created.ok) {
        return {
          ok: false,
          formError: created.formError,
          problems: created.problems,
        };
      }

      await tx.insert(saleSessions).values(
        created.ids.map((appointmentId) => ({
          clinicId,
          saleItemId: item.id,
          appointmentId,
        })),
      );
      for (const appointmentId of created.ids) {
        await syncSessionInstallment(tx, clinicId, appointmentId);
      }
      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: "sale.sessions_scheduled",
        entityType: "sale",
        entityId: item.saleId,
        changes: { saleItemId: item.id, count: created.ids.length },
      });
      return { ok: true, id: item.saleId };
    });
  } catch (error) {
    if (isAppointmentOverlapError(error)) {
      return fail(
        "Um dos horários foi ocupado agora há pouco. Confira as datas e tente de novo.",
      );
    }
    throw unexpected(error);
  }
}

// --------------------------------------------------------------- changes

type PartRow = {
  id: string;
  number: number;
  amountCents: number;
  dueDate: string | null;
  saleItemId: string | null;
  appointmentId: string | null;
  paidCents: number;
};

async function readParts(tx: Tx, saleId: string): Promise<PartRow[]> {
  return tx
    .select({
      id: installments.id,
      number: installments.number,
      amountCents: installments.amountCents,
      dueDate: installments.dueDate,
      saleItemId: installments.saleItemId,
      appointmentId: installments.appointmentId,
      paidCents: paidOf(),
    })
    .from(installments)
    .where(
      and(eq(installments.saleId, saleId), isNull(installments.cancelledAt)),
    )
    .orderBy(asc(installments.number));
}

async function nextNumber(tx: Tx, saleId: string) {
  const [row] = await tx
    .select({ max: sql<number | null>`max(${installments.number})` })
    .from(installments)
    .where(eq(installments.saleId, saleId));
  return (row?.max ?? 0) + 1;
}

// Changes an approved sale. What was already paid never changes: paid and
// partly paid installments stay, and the total can never go below them.
export async function reviseSale(
  clinicId: string,
  saleId: string,
  values: ReviseValues,
  actorUserId: string,
  today: string,
  now: Date = new Date(),
): Promise<SaleResult> {
  if (!UUID_PATTERN.test(saleId)) return fail(SALE_NOT_FOUND);
  try {
    return await inClinic(clinicId, async (tx): Promise<SaleResult> => {
      const sale = await lockSale(tx, clinicId, saleId);
      if (!sale) return fail(SALE_NOT_FOUND);
      if (sale.cancelledAt) return fail(SALE_CANCELLED);
      const perSession = sale.paymentPlan === "per_session";
      if (perSession && values.action === "replan") {
        return fail("Na venda por sessão, cada sessão tem a sua parcela.");
      }
      const before = await snapshot(tx, saleId);
      let total = sale.totalCents;

      const itemOf = async (itemId: string | null) => {
        if (!itemId) return undefined;
        const [item] = await tx
          .select()
          .from(saleItems)
          .where(and(eq(saleItems.id, itemId), eq(saleItems.saleId, saleId)))
          .for("update");
        return item;
      };

      // New per-session installments for `count` sessions of an item.
      const addSessionParts = async (
        itemId: string,
        count: number,
        price: number,
      ) => {
        if (price === 0) return;
        let number = await nextNumber(tx, saleId);
        await tx.insert(installments).values(
          Array.from({ length: count }, () => ({
            clinicId,
            saleId,
            saleItemId: itemId,
            number: number++,
            amountCents: price,
            dueDate: null,
          })),
        );
      };

      if (values.action === "add_sessions") {
        const item = await itemOf(values.saleItemId);
        if (!item) return fail("Item da venda não encontrado.");
        const added = values.sessions * values.sessionPriceCents;
        await tx
          .update(saleItems)
          .set({
            sessions: item.sessions + values.sessions,
            totalCents: item.totalCents + added,
          })
          .where(eq(saleItems.id, item.id));
        total += added;
        if (perSession)
          await addSessionParts(
            item.id,
            values.sessions,
            values.sessionPriceCents,
          );
      }

      if (values.action === "add_item") {
        const [service] = await tx
          .select({
            id: services.id,
            name: services.name,
            isFlexible: services.isFlexible,
          })
          .from(services)
          .where(
            and(
              eq(services.id, values.serviceId!),
              eq(services.clinicId, clinicId),
            ),
          );
        if (!service || service.isFlexible) {
          return {
            ok: false,
            fieldErrors: { serviceId: "Escolha um serviço do catálogo." },
          };
        }
        const [last] = await tx
          .select({ max: sql<number | null>`max(${saleItems.sortOrder})` })
          .from(saleItems)
          .where(eq(saleItems.saleId, saleId));
        const added = values.sessions * values.sessionPriceCents;
        const [item] = await tx
          .insert(saleItems)
          .values({
            clinicId,
            saleId,
            serviceId: service.id,
            serviceName: service.name,
            sessions: values.sessions,
            totalCents: added,
            sortOrder: (last?.max ?? -1) + 1,
          })
          .returning({ id: saleItems.id });
        total += added;
        if (perSession)
          await addSessionParts(
            item!.id,
            values.sessions,
            values.sessionPriceCents,
          );
      }

      if (values.action === "remove_sessions") {
        const item = await itemOf(values.saleItemId);
        if (!item) return fail("Item da venda não encontrado.");
        const [used] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(saleSessions)
          .innerJoin(
            appointments,
            eq(saleSessions.appointmentId, appointments.id),
          )
          .where(
            and(
              eq(saleSessions.saleItemId, item.id),
              inArray(appointments.status, counting),
            ),
          );
        const free = item.sessions - (used?.count ?? 0);
        if (values.sessions > free) {
          return {
            ok: false,
            fieldErrors: {
              sessions:
                free === 0
                  ? "Todas as sessões deste item estão agendadas ou feitas. Cancele um agendamento antes."
                  : `Só ${free} sessões deste item estão livres para retirar.`,
            },
          };
        }
        let removed: number;
        if (perSession) {
          const parts = (await readParts(tx, saleId)).filter(
            (part) =>
              part.saleItemId === item.id &&
              part.appointmentId === null &&
              part.paidCents === 0,
          );
          const zeroPriced = item.totalCents === 0;
          if (!zeroPriced && parts.length < values.sessions) {
            return {
              ok: false,
              fieldErrors: {
                sessions:
                  "Algumas dessas sessões já foram pagas. Retire menos sessões ou devolva o valor como despesa.",
              },
            };
          }
          const toCancel = parts.slice(-values.sessions);
          removed = toCancel.reduce((sum, part) => sum + part.amountCents, 0);
          if (toCancel.length > 0) {
            await tx
              .update(installments)
              .set({ cancelledAt: now })
              .where(
                inArray(
                  installments.id,
                  toCancel.map((part) => part.id),
                ),
              );
          }
        } else {
          removed = sessionAmounts(item.totalCents, item.sessions)
            .slice(-values.sessions)
            .reduce((sum, value) => sum + value, 0);
        }
        await tx
          .update(saleItems)
          .set({
            sessions: item.sessions - values.sessions,
            totalCents: item.totalCents - removed,
          })
          .where(eq(saleItems.id, item.id));
        total -= removed;
      }

      if (!perSession) {
        const replanned = await replanOpenInstallments(tx, clinicId, saleId, {
          total,
          count: values.installmentsCount,
          firstDueDate: values.firstDueDate,
          today,
          now,
        });
        if (replanned) return replanned;
      }

      await tx
        .update(sales)
        .set({ totalCents: total })
        .where(eq(sales.id, saleId));
      await tx.insert(saleRevisions).values({
        clinicId,
        saleId,
        actorUserId,
        reason: values.reason,
        before,
        after: await snapshot(tx, saleId),
      });
      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: "sale.revised",
        entityType: "sale",
        entityId: saleId,
        changes: {
          action: values.action,
          fromTotalCents: sale.totalCents,
          toTotalCents: total,
        },
      });
      return { ok: true, id: saleId };
    });
  } catch (error) {
    throw unexpected(error);
  }
}

// Replaces the installments not paid at all with `count` new ones that add up
// to what is still owed. Returns a failure, or null when done.
async function replanOpenInstallments(
  tx: Tx,
  clinicId: string,
  saleId: string,
  input: {
    total: number;
    count: number;
    firstDueDate: string | null;
    today: string;
    now: Date;
  },
): Promise<SaleResult | null> {
  const parts = await readParts(tx, saleId);
  const kept = parts.filter((part) => part.paidCents > 0);
  const open = parts.filter((part) => part.paidCents === 0);
  const keptSum = kept.reduce((sum, part) => sum + part.amountCents, 0);
  const rest = input.total - keptSum;
  if (rest < 0) {
    return fail(
      "O total não pode ficar menor que o já pago. Devolva a diferença como despesa antes.",
    );
  }
  if (open.length > 0) {
    await tx
      .update(installments)
      .set({ cancelledAt: input.now })
      .where(
        inArray(
          installments.id,
          open.map((part) => part.id),
        ),
      );
  }
  if (rest === 0) return null;

  const firstDue =
    input.firstDueDate ??
    open
      .map((part) => part.dueDate)
      .filter((d): d is string => d !== null)
      .sort()[0] ??
    input.today;
  const count = Math.min(input.count, rest);
  const amounts = splitAmount(rest, count);
  const dates = monthlyDueDates(firstDue, count);
  let number = await nextNumber(tx, saleId);
  await tx.insert(installments).values(
    amounts.map((amountCents, i) => ({
      clinicId,
      saleId,
      saleItemId: null,
      number: number++,
      amountCents,
      dueDate: dates[i]!,
    })),
  );
  return null;
}
