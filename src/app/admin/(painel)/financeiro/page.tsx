import type { Metadata, Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/modules/auth/session";
import { financeSummary, listReceivables } from "@/modules/finance/reports";
import { todayLocal } from "@/modules/schedule/time";

import {
  FinanceTabs,
  formatDay,
  HighlightStat,
  money,
  monthRange,
  PageTitle,
  Stat,
  StateBadge,
} from "./ui";

export const metadata: Metadata = { title: "Financeiro" };

export default async function FinancePage() {
  const { clinicId } = await requireAdmin();
  const today = todayLocal();
  const month = monthRange(undefined, today);
  const [summary, receivables] = await Promise.all([
    financeSummary(clinicId, { today, month }),
    listReceivables(clinicId, today),
  ]);
  const next = receivables.filter((r) => r.dueDate !== null).slice(0, 8);

  return (
    <div className="grid max-w-5xl gap-6">
      <PageTitle title="Financeiro">
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/admin/financeiro/entradas/nova">Nova entrada</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/financeiro/orcamentos/novo">Novo orçamento</Link>
          </Button>
        </div>
      </PageTitle>
      <FinanceTabs current="/admin/financeiro" />

      <section aria-label="Resumo" className="grid gap-3">
        <HighlightStat
          label="Saldo do mês"
          value={money(summary.balanceMonthCents)}
          details={[
            {
              label: `Entrou em ${month.label}`,
              value: money(summary.receivedMonthCents),
            },
            {
              label: `Saiu em ${month.label}`,
              value: money(summary.spentMonthCents),
            },
          ]}
        />
        {summary.receivedMonthByMethod.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {summary.receivedMonthByMethod
              .map((m) => `${m.methodName}: ${money(m.amountCents)}`)
              .join(" · ")}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            icon="arrowIn"
            iconTone="blue"
            label="Entrou hoje"
            value={money(summary.receivedTodayCents)}
          />
          <Stat
            icon="clock"
            iconTone="pink"
            label="A receber"
            value={money(summary.receivableDatedCents)}
            hint={`Mais ${money(summary.receivableUnscheduledCents)} de sessões ainda não agendadas`}
          />
          <Stat
            icon="alert"
            label="Parcelas atrasadas"
            value={money(summary.overdueCents)}
            hint={`${summary.overdueCount} parcela(s)`}
            tone={summary.overdueCount > 0 ? "alert" : "default"}
          />
        </div>
      </section>

      <section aria-labelledby="proximas" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="proximas" className="font-heading text-lg font-bold">
            Próximas parcelas
          </h2>
          <Link
            href="/admin/financeiro/receber"
            className="text-sm font-medium underline underline-offset-2"
          >
            Ver todas
          </Link>
        </div>
        {next.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma parcela em aberto.</p>
        ) : (
          <ul className="grid gap-2">
            {next.map((r) => (
              <li key={r.installmentId}>
                <Link
                  href={`/admin/financeiro/vendas/${r.saleId}` as Route}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card px-4 py-3 hover:bg-muted/50"
                >
                  <span className="min-w-0 break-words">
                    <span className="font-medium">{r.patientName}</span>{" "}
                    <span className="text-muted-foreground">
                      · parcela {r.number} · vence {formatDay(r.dueDate)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StateBadge state={r.state} />
                    <span className="font-semibold tabular-nums">
                      {money(r.outstandingCents)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
