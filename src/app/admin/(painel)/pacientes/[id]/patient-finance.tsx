import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/modules/auth/session";
import { QUOTE_STATUS_LABELS } from "@/modules/finance/fields";
import { listQuotes } from "@/modules/finance/quotes";
import { listSales } from "@/modules/finance/sales";
import { todayLocal } from "@/modules/schedule/time";

import { money } from "../../financeiro/ui";

// The patient's quotes and sales, with what is still owed.
export async function PatientFinance({
  patientId,
  canQuote,
}: {
  patientId: string;
  canQuote: boolean;
}) {
  const { clinicId } = await requireAdmin();
  const [quotes, sales] = await Promise.all([
    listQuotes(clinicId, { today: todayLocal(), patientId }),
    listSales(clinicId, { patientId }),
  ]);
  const owed = sales.reduce((sum, sale) => sum + sale.outstandingCents, 0);
  const openQuotes = quotes.filter(
    (q) => q.status === "draft" || q.status === "sent",
  );

  return (
    <section aria-labelledby="financeiro" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="financeiro" className="font-heading text-lg font-semibold">
          Financeiro
        </h2>
        {canQuote ? (
          <Button asChild variant="outline">
            <Link
              href={
                `/admin/financeiro/orcamentos/novo?paciente=${patientId}` as Route
              }
            >
              Novo orçamento
            </Link>
          </Button>
        ) : null}
      </div>
      <p>
        Falta pagar:{" "}
        <span className="font-semibold tabular-nums">{money(owed)}</span>
      </p>
      {sales.length > 0 ? (
        <ul className="grid gap-2">
          {sales.map((sale) => (
            <li key={sale.id}>
              <Link
                href={`/admin/financeiro/vendas/${sale.id}` as Route}
                className="flex flex-wrap justify-between gap-2 rounded-xl border bg-card p-3 hover:bg-muted/50"
              >
                <span>
                  Venda do orçamento {sale.quoteNumber}
                  {sale.cancelled ? " · cancelada" : ""}
                </span>
                <span className="tabular-nums">
                  {money(sale.totalCents)}
                  {sale.outstandingCents > 0
                    ? ` · falta ${money(sale.outstandingCents)}`
                    : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {openQuotes.length > 0 ? (
        <ul className="grid gap-2">
          {openQuotes.map((quote) => (
            <li key={quote.id}>
              <Link
                href={`/admin/financeiro/orcamentos/${quote.id}` as Route}
                className="flex flex-wrap justify-between gap-2 rounded-xl border bg-card p-3 hover:bg-muted/50"
              >
                <span>
                  Orçamento nº {quote.number} ·{" "}
                  {quote.expired
                    ? "Vencido"
                    : QUOTE_STATUS_LABELS[quote.status]}
                </span>
                <span className="tabular-nums">{money(quote.totalCents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {sales.length === 0 && openQuotes.length === 0 ? (
        <p className="text-muted-foreground">
          Nenhum orçamento em aberto nem venda.
        </p>
      ) : null}
    </section>
  );
}
