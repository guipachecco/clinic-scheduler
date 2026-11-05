import type { Metadata, Route } from "next";
import Link from "next/link";

import { requireAdmin } from "@/modules/auth/session";
import {
  listExpenseCategories,
  listExpenses,
} from "@/modules/finance/expenses";
import { listPaymentMethods } from "@/modules/finance/sales";
import { todayLocal } from "@/modules/schedule/time";

import { FinanceTabs, formatDay, money, monthRange, PageTitle } from "../ui";

import { CancelExpenseButton, ExpenseForm } from "./expense-forms";

export const metadata: Metadata = { title: "Despesas" };

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { clinicId } = await requireAdmin();
  const { mes } = await searchParams;
  const today = todayLocal();
  const month = monthRange(mes, today);
  const [expenses, categories, methods] = await Promise.all([
    listExpenses(clinicId, month),
    listExpenseCategories(clinicId),
    listPaymentMethods(clinicId),
  ]);
  const total = expenses
    .filter((e) => e.cancelledAt === null)
    .reduce((sum, e) => sum + e.amountCents, 0);

  return (
    <div className="grid gap-6">
      <PageTitle title="Despesas" />
      <FinanceTabs current="/admin/financeiro/despesas" />

      <section
        aria-labelledby="nova-despesa"
        className="grid gap-3 rounded-2xl border bg-card p-4"
      >
        <h2 id="nova-despesa" className="font-heading text-lg font-semibold">
          Nova despesa
        </h2>
        <ExpenseForm categories={categories} methods={methods} today={today} />
      </section>

      <nav aria-label="Mês" className="flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/financeiro/despesas?mes=${month.prev}` as Route}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          ← Mês anterior
        </Link>
        <p className="font-medium capitalize">
          {month.label} · {money(total)}
        </p>
        <Link
          href={`/admin/financeiro/despesas?mes=${month.next}` as Route}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          Próximo mês →
        </Link>
      </nav>

      {expenses.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma despesa neste mês.</p>
      ) : (
        <ul className="grid gap-2">
          {expenses.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3"
            >
              <span
                className={
                  e.cancelledAt
                    ? "min-w-0 break-words text-muted-foreground line-through"
                    : "min-w-0 break-words"
                }
              >
                {formatDay(e.spentOn)} · {e.categoryName}
                {e.description ? ` · ${e.description}` : ""}{" "}
                <span className="text-muted-foreground">· {e.methodName}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold tabular-nums">
                  {money(e.amountCents)}
                </span>
                {e.cancelledAt ? (
                  <span className="text-sm text-muted-foreground">
                    Cancelada: {e.cancellationReason}
                  </span>
                ) : (
                  <CancelExpenseButton id={e.id} />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
