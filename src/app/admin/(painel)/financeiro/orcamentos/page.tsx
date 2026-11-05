import type { Metadata, Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/modules/auth/session";
import { QUOTE_STATUS_LABELS } from "@/modules/finance/fields";
import { listQuotes, type QuoteStatus } from "@/modules/finance/quotes";
import { todayLocal } from "@/modules/schedule/time";

import { FinanceTabs, formatDay, money, PageTitle } from "../ui";

export const metadata: Metadata = { title: "Orçamentos" };

const FILTERS: { value: QuoteStatus | undefined; label: string }[] = [
  { value: undefined, label: "Todos" },
  { value: "draft", label: "Rascunhos" },
  { value: "sent", label: "Enviados" },
  { value: "approved", label: "Aprovados" },
  { value: "rejected", label: "Recusados" },
];

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { clinicId } = await requireAdmin();
  const { status } = await searchParams;
  const filter = FILTERS.find((f) => f.value === status)?.value;
  const today = todayLocal();
  const quotes = await listQuotes(clinicId, { today, status: filter });

  return (
    <div className="grid gap-6">
      <PageTitle title="Orçamentos">
        <Button asChild>
          <Link href="/admin/financeiro/orcamentos/novo">Novo orçamento</Link>
        </Button>
      </PageTitle>
      <FinanceTabs current="/admin/financeiro/orcamentos" />

      <nav aria-label="Filtrar por status" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.label}
            href={
              (f.value
                ? `/admin/financeiro/orcamentos?status=${f.value}`
                : "/admin/financeiro/orcamentos") as Route
            }
            aria-current={f.value === filter ? "page" : undefined}
            className="rounded-full border px-3 py-1.5 text-sm aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {quotes.length === 0 ? (
        <p className="text-muted-foreground">Nenhum orçamento por aqui.</p>
      ) : (
        <ul className="grid gap-2">
          {quotes.map((quote) => (
            <li key={quote.id}>
              <Link
                href={`/admin/financeiro/orcamentos/${quote.id}` as Route}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 hover:bg-muted/50"
              >
                <span className="min-w-0 break-words">
                  <span className="font-medium">
                    Nº {quote.number} · {quote.patientName}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    ·{" "}
                    {quote.expired
                      ? "Vencido"
                      : QUOTE_STATUS_LABELS[quote.status]}
                    {quote.status === "draft" || quote.status === "sent"
                      ? ` · válido até ${formatDay(quote.validUntil)}`
                      : ""}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">
                  {money(quote.totalCents)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
