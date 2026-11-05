import type { Metadata, Route } from "next";
import Link from "next/link";

import { requireAdmin } from "@/modules/auth/session";
import { listCash } from "@/modules/finance/reports";
import { todayLocal } from "@/modules/schedule/time";

import {
  FinanceTabs,
  formatDay,
  money,
  monthRange,
  PageTitle,
  signedMoney,
} from "../ui";

export const metadata: Metadata = { title: "Caixa" };

// Money in and out of a month. A payment counts on the day it came in; a
// reversal or a cancelled expense counts on the day it was made, so past
// months never change.
export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { clinicId } = await requireAdmin();
  const { mes } = await searchParams;
  const month = monthRange(mes, todayLocal());
  const entries = await listCash(clinicId, month);

  const total = entries.reduce((sum, e) => sum + e.amountCents, 0);
  const incoming = entries
    .filter((e) => e.amountCents > 0)
    .reduce((s, e) => s + e.amountCents, 0);
  const outgoing = entries
    .filter((e) => e.amountCents < 0)
    .reduce((s, e) => s - e.amountCents, 0);
  const byMethod = new Map<string, number>();
  for (const e of entries)
    byMethod.set(
      e.methodName,
      (byMethod.get(e.methodName) ?? 0) + e.amountCents,
    );

  return (
    <div className="grid gap-6">
      <PageTitle title="Caixa" />
      <FinanceTabs current="/admin/financeiro/caixa" />
      <nav aria-label="Mês" className="flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/financeiro/caixa?mes=${month.prev}` as Route}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          ← Mês anterior
        </Link>
        <p className="font-medium capitalize">{month.label}</p>
        <Link
          href={`/admin/financeiro/caixa?mes=${month.next}` as Route}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          Próximo mês →
        </Link>
      </nav>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Entradas</p>
          <p className="font-heading text-xl font-semibold tabular-nums">
            {money(incoming)}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Saídas</p>
          <p className="font-heading text-xl font-semibold tabular-nums">
            {money(outgoing)}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">Saldo</p>
          <p className="font-heading text-xl font-semibold tabular-nums">
            {signedMoney(total)}
          </p>
        </div>
      </div>
      {byMethod.size > 0 ? (
        <p className="text-sm text-muted-foreground">
          Por forma de pagamento:{" "}
          {[...byMethod.entries()]
            .map(([name, cents]) => `${name} ${signedMoney(cents)}`)
            .join(" · ")}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <p className="text-muted-foreground">Nenhum lançamento neste mês.</p>
      ) : (
        <ul className="grid gap-2">
          {entries.map((e) => (
            <li
              key={`${e.kind}-${e.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3"
            >
              <span className="min-w-0 break-words">
                <span className="tabular-nums">{formatDay(e.date)}</span> ·{" "}
                {e.saleId && (e.kind === "payment" || e.kind === "reversal") ? (
                  <Link
                    href={`/admin/financeiro/vendas/${e.saleId}` as Route}
                    className="underline underline-offset-2"
                  >
                    {e.label}
                  </Link>
                ) : (
                  e.label
                )}{" "}
                <span className="text-muted-foreground">· {e.methodName}</span>
                {e.backdated ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · lançado depois
                  </span>
                ) : null}
              </span>
              <span
                className={
                  e.amountCents < 0
                    ? "font-semibold text-destructive tabular-nums"
                    : "font-semibold tabular-nums"
                }
              >
                {signedMoney(e.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
