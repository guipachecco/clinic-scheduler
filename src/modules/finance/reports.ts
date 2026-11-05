import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { ANONYMIZED_NAME } from "@/modules/patients/patients";
import { CLINIC_TIME_ZONE } from "@/modules/schedule/time";

import { installmentState } from "./money";

// Read-only reports of one clinic's money. The cash report never rewrites the
// past: a payment counts on the day the owner says it came in, and a
// reversal (or an expense cancellation) counts on the day it was made.

export type CashEntry = {
  // payment, reversal, expense, expense_cancellation
  kind: "payment" | "reversal" | "expense" | "expense_cancellation";
  id: string;
  date: string;
  // Positive for money in, negative for money out.
  amountCents: number;
  methodName: string;
  label: string;
  saleId: string | null;
  // Registered on a later day than `date` (a back-dated entry).
  backdated: boolean;
};

export type Receivable = {
  installmentId: string;
  saleId: string;
  patientId: string;
  patientName: string;
  number: number;
  dueDate: string | null;
  outstandingCents: number;
  state: "open" | "partial" | "overdue";
};

const tz = CLINIC_TIME_ZONE;

// Cash entries with a date in [from, to), ordered by date.
export async function listCash(
  clinicId: string,
  range: { from: string; to: string },
): Promise<CashEntry[]> {
  const result = await db.execute<{
    kind: CashEntry["kind"];
    id: string;
    date: string;
    amount_cents: number;
    method_name: string;
    label: string;
    sale_id: string | null;
    backdated: boolean;
  }>(sql`
    select * from (
      select 'payment' as kind, p.id, p.paid_on::text as date,
        p.amount_cents, m.name as method_name,
        'Parcela ' || i.number || ' · orçamento ' || q.number as label,
        i.sale_id, (p.created_at at time zone ${tz})::date > p.paid_on as backdated
      from payments p
      join installments i on i.id = p.installment_id
      join sales s on s.id = i.sale_id
      join quotes q on q.id = s.quote_id
      join payment_methods m on m.id = p.payment_method_id
      where p.clinic_id = ${clinicId}
        and p.paid_on >= ${range.from}::date and p.paid_on < ${range.to}::date
      union all
      select 'reversal', p.id, (p.reversed_at at time zone ${tz})::date::text,
        -p.amount_cents, m.name,
        'Estorno da parcela ' || i.number || ' · orçamento ' || q.number,
        i.sale_id, false
      from payments p
      join installments i on i.id = p.installment_id
      join sales s on s.id = i.sale_id
      join quotes q on q.id = s.quote_id
      join payment_methods m on m.id = p.payment_method_id
      where p.clinic_id = ${clinicId} and p.reversed_at is not null
        and (p.reversed_at at time zone ${tz})::date >= ${range.from}::date
        and (p.reversed_at at time zone ${tz})::date < ${range.to}::date
      union all
      select 'expense', e.id, e.spent_on::text, -e.amount_cents, m.name,
        c.name || coalesce(' · ' || e.description, ''), e.sale_id,
        (e.created_at at time zone ${tz})::date > e.spent_on
      from expenses e
      join expense_categories c on c.id = e.category_id
      join payment_methods m on m.id = e.payment_method_id
      where e.clinic_id = ${clinicId}
        and e.spent_on >= ${range.from}::date and e.spent_on < ${range.to}::date
      union all
      select 'expense_cancellation', e.id,
        (e.cancelled_at at time zone ${tz})::date::text, e.amount_cents, m.name,
        'Despesa cancelada · ' || c.name, e.sale_id, false
      from expenses e
      join expense_categories c on c.id = e.category_id
      join payment_methods m on m.id = e.payment_method_id
      where e.clinic_id = ${clinicId} and e.cancelled_at is not null
        and (e.cancelled_at at time zone ${tz})::date >= ${range.from}::date
        and (e.cancelled_at at time zone ${tz})::date < ${range.to}::date
    ) entries
    order by date, kind, id
  `);
  return result.rows.map((row) => ({
    kind: row.kind,
    id: row.id,
    date: row.date,
    amountCents: Number(row.amount_cents),
    methodName: row.method_name,
    label: row.label,
    saleId: row.sale_id,
    backdated: row.backdated,
  }));
}

// Installments still owed on active sales: with a due date first (oldest
// first), then the "por sessão" ones not scheduled yet.
export async function listReceivables(
  clinicId: string,
  today: string,
): Promise<Receivable[]> {
  const result = await db.execute<{
    installment_id: string;
    sale_id: string;
    patient_id: string;
    patient_name: string;
    anonymized: boolean;
    number: number;
    due_date: string | null;
    amount_cents: number;
    paid_cents: number;
  }>(sql`
    select i.id as installment_id, i.sale_id, s.patient_id,
      pt.name as patient_name, pt.anonymized_at is not null as anonymized,
      i.number, i.due_date::text as due_date, i.amount_cents,
      coalesce((select sum(p.amount_cents) from payments p
        where p.installment_id = i.id and p.reversed_at is null), 0)::int as paid_cents
    from installments i
    join sales s on s.id = i.sale_id
    join patients pt on pt.id = s.patient_id
    where i.clinic_id = ${clinicId}
      and i.cancelled_at is null and s.cancelled_at is null
    order by i.due_date nulls last, pt.name, i.number
  `);
  return result.rows
    .filter((row) => row.paid_cents < row.amount_cents)
    .map((row) => ({
      installmentId: row.installment_id,
      saleId: row.sale_id,
      patientId: row.patient_id,
      patientName: row.anonymized ? ANONYMIZED_NAME : row.patient_name,
      number: row.number,
      dueDate: row.due_date,
      outstandingCents: row.amount_cents - row.paid_cents,
      state: installmentState({
        amountCents: row.amount_cents,
        paidCents: row.paid_cents,
        cancelled: false,
        dueDate: row.due_date,
        today,
      }) as Receivable["state"],
    }));
}

export type FinanceSummary = {
  receivedTodayCents: number;
  receivedMonthCents: number;
  receivedMonthByMethod: { methodName: string; amountCents: number }[];
  spentMonthCents: number;
  balanceMonthCents: number;
  overdueCount: number;
  overdueCents: number;
  receivableDatedCents: number;
  receivableUnscheduledCents: number;
};

// `month` is [first day, first day of the next month).
export async function financeSummary(
  clinicId: string,
  input: { today: string; month: { from: string; to: string } },
): Promise<FinanceSummary> {
  const [cash, receivables] = await Promise.all([
    listCash(clinicId, input.month),
    listReceivables(clinicId, input.today),
  ]);
  const incoming = cash.filter(
    (entry) => entry.kind === "payment" || entry.kind === "reversal",
  );
  const byMethod = new Map<string, number>();
  for (const entry of incoming) {
    byMethod.set(
      entry.methodName,
      (byMethod.get(entry.methodName) ?? 0) + entry.amountCents,
    );
  }
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const receivedMonthCents = sum(incoming.map((entry) => entry.amountCents));
  // Expenses are negative entries; a cancellation gives the amount back.
  const spentMonthCents = sum(
    cash
      .filter(
        (entry) =>
          entry.kind === "expense" || entry.kind === "expense_cancellation",
      )
      .map((entry) => 0 - entry.amountCents),
  );
  const overdue = receivables.filter((r) => r.state === "overdue");
  return {
    receivedTodayCents: sum(
      incoming
        .filter((entry) => entry.date === input.today)
        .map((entry) => entry.amountCents),
    ),
    receivedMonthCents,
    receivedMonthByMethod: [...byMethod.entries()].map(
      ([methodName, amountCents]) => ({ methodName, amountCents }),
    ),
    spentMonthCents,
    balanceMonthCents: receivedMonthCents - spentMonthCents,
    overdueCount: overdue.length,
    overdueCents: sum(overdue.map((r) => r.outstandingCents)),
    receivableDatedCents: sum(
      receivables
        .filter((r) => r.dueDate !== null)
        .map((r) => r.outstandingCents),
    ),
    receivableUnscheduledCents: sum(
      receivables
        .filter((r) => r.dueDate === null)
        .map((r) => r.outstandingCents),
    ),
  };
}
