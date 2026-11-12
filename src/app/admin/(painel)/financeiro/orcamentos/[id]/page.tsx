import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireModule } from "@/modules/auth/session";
import { QUOTE_STATUS_LABELS } from "@/modules/finance/fields";
import { getQuote, type QuoteDetail } from "@/modules/finance/quotes";
import { getPatient } from "@/modules/patients/patients";
import { todayLocal } from "@/modules/schedule/time";

import { FinanceTabs, formatDay, money, PageTitle } from "../../ui";

import { QuoteActions } from "./quote-actions";

// No patient data in the title: it would reach the browser history.
export const metadata: Metadata = { title: "Orçamento" };

// The message the owner sends; service names and values only.
function quoteMessage(clinicName: string, quote: QuoteDetail) {
  const lines = [
    `${clinicName}: orçamento nº ${quote.number}`,
    "",
    ...quote.items.map(
      (item) =>
        `• ${item.serviceName}: ${item.sessions} ${item.sessions === 1 ? "sessão" : "sessões"} — ${money(item.grossCents)}`,
    ),
  ];
  if (quote.discountCents > 0)
    lines.push(`Desconto: ${money(quote.discountCents)}`);
  lines.push(
    `Total: ${money(quote.totalCents)}`,
    `Válido até ${formatDay(quote.validUntil)}.`,
  );
  if (quote.notes) lines.push("", quote.notes);
  return lines.join("\n");
}

export default async function QuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { clinicId, clinic } = await requireModule("finance");
  const { id } = await params;
  const today = todayLocal();
  const quote = await getQuote(clinicId, id, today);
  if (!quote) notFound();
  const patient = await getPatient(clinicId, quote.patientId);
  const phone = patient?.phone?.replace(/\D/g, "");
  const whatsappUrl = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(quoteMessage(clinic.name, quote))}`
    : null;

  return (
    <div className="grid max-w-4xl gap-6">
      <PageTitle title={`Orçamento nº ${quote.number}`} />
      <FinanceTabs current="/admin/financeiro/orcamentos" />

      <div className="grid gap-1">
        <p>
          Paciente:{" "}
          <Link
            href={`/admin/pacientes/${quote.patientId}` as Route}
            className="font-medium underline underline-offset-2"
          >
            {quote.patientName}
          </Link>
        </p>
        <p>
          Status:{" "}
          <span className="font-medium">
            {quote.expired ? "Vencido" : QUOTE_STATUS_LABELS[quote.status]}
          </span>
        </p>
        <p>Válido até {formatDay(quote.validUntil)}</p>
        {quote.saleId ? (
          <p>
            <Link
              href={`/admin/financeiro/vendas/${quote.saleId}` as Route}
              className="font-medium underline underline-offset-2"
            >
              Ver a venda deste orçamento
            </Link>
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[32rem] text-sm">
          <caption className="sr-only">Serviços do orçamento</caption>
          <thead className="text-left text-muted-foreground">
            <tr>
              <th scope="col" className="p-3 font-medium">
                Serviço
              </th>
              <th scope="col" className="p-3 font-medium">
                Sessões
              </th>
              <th scope="col" className="p-3 font-medium">
                Por sessão
              </th>
              <th scope="col" className="p-3 font-medium">
                Desconto
              </th>
              <th scope="col" className="p-3 text-right font-medium">
                Subtotal
              </th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="p-3">{item.serviceName}</td>
                <td className="p-3 tabular-nums">{item.sessions}</td>
                <td className="p-3 tabular-nums">
                  {money(item.unitPriceCents)}
                </td>
                <td className="p-3 tabular-nums">
                  {item.discountCents > 0 ? money(item.discountCents) : "—"}
                </td>
                <td className="p-3 text-right tabular-nums">
                  {money(item.grossCents)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t">
            {quote.discountCents > 0 ? (
              <tr>
                <td colSpan={4} className="p-3 text-right">
                  Desconto no total
                </td>
                <td className="p-3 text-right tabular-nums">
                  − {money(quote.discountCents)}
                </td>
              </tr>
            ) : null}
            <tr>
              <td colSpan={4} className="p-3 text-right font-semibold">
                Total
              </td>
              <td className="p-3 text-right font-heading text-lg font-bold tabular-nums">
                {money(quote.totalCents)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {quote.notes ? (
        <p className="rounded-xl bg-muted/50 p-3 text-sm break-words whitespace-pre-line">
          {quote.notes}
        </p>
      ) : null}

      <QuoteActions
        quoteId={quote.id}
        status={quote.status}
        expired={quote.expired}
        whatsappUrl={whatsappUrl}
        today={today}
      />
    </div>
  );
}
