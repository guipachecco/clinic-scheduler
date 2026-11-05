import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";

import { requireAdmin } from "@/modules/auth/session";
import { getQuote } from "@/modules/finance/quotes";
import { todayLocal } from "@/modules/schedule/time";
import { formatCents } from "@/modules/services/fields";

import { FinanceTabs, PageTitle } from "../../../ui";
import { QuoteForm } from "../../quote-form";
import { quoteServiceOptions } from "../../services";

export const metadata: Metadata = { title: "Editar orçamento" };

const text = (cents: number) =>
  cents === 0 ? "" : formatCents(cents).replace("R$ ", "");

// Only drafts can be edited; a sent quote stays as it was sent.
export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { clinicId } = await requireAdmin();
  const { id } = await params;
  const quote = await getQuote(clinicId, id, todayLocal());
  if (!quote) notFound();
  if (quote.status !== "draft")
    redirect(`/admin/financeiro/orcamentos/${id}` as Route);
  const services = await quoteServiceOptions(clinicId);

  return (
    <div className="grid max-w-4xl gap-6">
      <PageTitle title={`Editar orçamento nº ${quote.number}`} />
      <FinanceTabs current="/admin/financeiro/orcamentos" />
      <QuoteForm
        services={services}
        quoteId={quote.id}
        initialPatient={{ id: quote.patientId, name: quote.patientName }}
        defaults={{
          validUntil: quote.validUntil,
          discount: text(quote.discountCents),
          notes: quote.notes ?? "",
          items: quote.items.map((item) => ({
            serviceId: item.serviceId,
            sessions: String(item.sessions),
            unitPrice: formatCents(item.unitPriceCents).replace("R$ ", ""),
            discount: text(item.discountCents),
          })),
        }}
      />
    </div>
  );
}
