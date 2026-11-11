import type { Metadata, Route } from "next";
import Link from "next/link";

import { requireAdmin } from "@/modules/auth/session";
import { listReceivables } from "@/modules/finance/reports";
import { listPaymentMethods } from "@/modules/finance/sales";
import { todayLocal } from "@/modules/schedule/time";

import { FinanceTabs, formatDay, money, PageTitle, StateBadge } from "../ui";
import { PaymentForm } from "../vendas/[id]/sale-forms";

export const metadata: Metadata = { title: "A receber" };

export default async function ReceivablesPage() {
  const { clinicId } = await requireAdmin();
  const today = todayLocal();
  const [receivables, methods] = await Promise.all([
    listReceivables(clinicId, today),
    listPaymentMethods(clinicId),
  ]);
  const dated = receivables.filter((r) => r.dueDate !== null);
  const undated = receivables.filter((r) => r.dueDate === null);

  const list = (items: typeof receivables) => (
    <ul className="grid gap-2">
      {items.map((r) => (
        <li
          key={r.installmentId}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3"
        >
          <Link
            href={`/admin/financeiro/vendas/${r.saleId}` as Route}
            className="min-w-0 break-words underline-offset-2 hover:underline"
          >
            <span className="font-medium">{r.patientName}</span>{" "}
            <span className="text-muted-foreground">
              · parcela {r.number}
              {r.dueDate ? ` · vence ${formatDay(r.dueDate)}` : ""}
            </span>
          </Link>
          <span className="flex items-center gap-2">
            <StateBadge state={r.state} />
            <span className="font-semibold tabular-nums">
              {money(r.outstandingCents)}
            </span>
          </span>
          <div className="flex w-full justify-end">
            <PaymentForm
              installmentId={r.installmentId}
              outstandingCents={r.outstandingCents}
              methods={methods}
              today={today}
            />
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="grid gap-6">
      <PageTitle title="A receber" />
      <FinanceTabs current="/admin/financeiro/receber" />
      <section aria-labelledby="com-vencimento" className="grid gap-3">
        <h2 id="com-vencimento" className="font-heading text-lg font-bold">
          Com vencimento
        </h2>
        {dated.length === 0 ? (
          <p className="text-muted-foreground">Nada em aberto.</p>
        ) : (
          list(dated)
        )}
      </section>
      {undated.length > 0 ? (
        <section aria-labelledby="sem-data" className="grid gap-3">
          <h2 id="sem-data" className="font-heading text-lg font-bold">
            Sessões ainda não agendadas
          </h2>
          <p className="text-sm text-muted-foreground">
            Parcelas por sessão. Ganham vencimento quando a sessão é agendada.
          </p>
          {list(undated)}
        </section>
      ) : null}
    </div>
  );
}
