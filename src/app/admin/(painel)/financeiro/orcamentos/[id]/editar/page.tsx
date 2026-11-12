import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";

import { moduleActive, requireModule } from "@/modules/auth/session";
import { getQuote } from "@/modules/finance/quotes";
import { todayLocal } from "@/modules/schedule/time";
import { formatCents } from "@/modules/services/fields";

import { FinanceTabs, PageTitle } from "../../../ui";
import { QuoteForm } from "../../quote-form";
import { quoteProductOptions, quoteServiceOptions } from "../../services";

export const metadata: Metadata = { title: "Editar orçamento" };

const text = (cents: number) =>
  cents === 0 ? "" : formatCents(cents).replace("R$ ", "");

// Only drafts can be edited; a sent quote stays as it was sent.
export default async function EditQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireModule("finance");
  const { clinicId } = ctx;
  const { id } = await params;
  const quote = await getQuote(clinicId, id, todayLocal());
  if (!quote) notFound();
  if (quote.status !== "draft")
    redirect(`/admin/financeiro/orcamentos/${id}` as Route);
  const productsOn = moduleActive(ctx, "products");
  const [services, active] = await Promise.all([
    quoteServiceOptions(clinicId),
    quoteProductOptions(clinicId, productsOn),
  ]);
  // A product deactivated since the draft was saved still shows by name;
  // saving the quote again with it is refused.
  const products = [
    ...active,
    ...quote.items.flatMap((item) =>
      item.productId && !active.some((p) => p.id === item.productId)
        ? [
            {
              id: item.productId,
              name: `${item.serviceName} ${
                productsOn ? "(inativo)" : "(módulo Produtos desligado)"
              }`,
              priceCents: null,
            },
          ]
        : [],
    ),
  ].filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i);

  return (
    <div className="grid max-w-4xl gap-6">
      <PageTitle title={`Editar orçamento nº ${quote.number}`} />
      <FinanceTabs current="/admin/financeiro/orcamentos" />
      <QuoteForm
        services={services}
        products={products}
        quoteId={quote.id}
        initialPatient={{ id: quote.patientId, name: quote.patientName }}
        defaults={{
          validUntil: quote.validUntil,
          discount: text(quote.discountCents),
          notes: quote.notes ?? "",
          items: quote.items.map((item) => {
            const priced = {
              sessions: String(item.sessions),
              unitPrice: formatCents(item.unitPriceCents).replace("R$ ", ""),
              discount: text(item.discountCents),
            };
            return item.productId
              ? {
                  kind: "product" as const,
                  productId: item.productId,
                  ...priced,
                }
              : {
                  kind: "service" as const,
                  serviceId: item.serviceId ?? "",
                  ...priced,
                };
          }),
        }}
      />
    </div>
  );
}
