import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { moduleActive, requireModule } from "@/modules/auth/session";
import { getClinicTimezone } from "@/modules/clinic-page/panel";
import { getProduct, listProductCatalog } from "@/modules/products/products";
import { formatLocal } from "@/modules/schedule/time";
import { formatCents } from "@/modules/services/fields";
import { getProductStock } from "@/modules/stock/stock";

import { ProductForm } from "../product-form";

import { EntryForm, UndoButton } from "./stock-forms";

export const metadata: Metadata = { title: "Produto" };

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireModule("products");
  const { clinicId } = ctx;
  const { id } = await params;
  const product = await getProduct(clinicId, id);
  if (!product) notFound();

  const [catalog, stock, zone] = await Promise.all([
    listProductCatalog(clinicId),
    getProductStock(clinicId, product.id),
    getClinicTimezone(clinicId),
  ]);
  if (!stock) notFound();
  const financeOn = moduleActive(ctx, "finance");
  const inUse = catalog
    .flatMap((category) => category.products)
    .some((item) => item.id === product.id && item.inUse);
  // Active categories, plus the product's own even when it is inactive.
  const categories = catalog
    .filter(
      (category) => category.isActive || category.id === product.categoryId,
    )
    .map(({ id, name, isActive }) => ({ id, name, isActive }));

  return (
    <div className="grid max-w-3xl gap-6">
      <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">
        {product.name}
      </h1>
      <ProductForm
        mode="edit"
        id={product.id}
        inUse={inUse}
        categories={categories}
        defaults={{
          categoryId: product.categoryId,
          name: product.name,
          description: product.description ?? "",
          price:
            product.priceCents === null
              ? ""
              : formatCents(product.priceCents).replace("R$ ", ""),
          showOnPage: product.showOnPage,
          isActive: product.isActive,
        }}
      />

      <section aria-labelledby="estoque" className="grid gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="estoque" className="font-heading text-lg font-bold">
            Estoque
          </h2>
          <p className="font-heading text-xl font-semibold tabular-nums">
            {stock.quantity}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <h3 className="mb-3 font-medium">Lançar entrada</h3>
          <EntryForm productId={product.id} />
        </div>

        <h3 className="font-heading font-bold">Histórico</h3>
        {stock.history.length === 0 ? (
          <p className="text-muted-foreground">Nenhum movimento ainda.</p>
        ) : (
          <ol className="grid gap-2">
            {stock.history.map((entry) => {
              const origin = entry.origin;
              const reversal = entry.kind === "reversal";
              let label: React.ReactNode = "Entrada";
              if (reversal) {
                label = "Baixa desfeita";
              } else if (origin.type === "appointment") {
                const text = `Atendimento de ${origin.patientName} em ${formatLocal(origin.startsAt, "dd/MM", zone)}`;
                label = (
                  <Link
                    href={`/admin/agenda/${origin.appointmentId}` as Route}
                    className="underline underline-offset-2"
                  >
                    {text}
                  </Link>
                );
              } else if (origin.type === "sale") {
                const text = `Venda nº ${origin.saleNumber}`;
                label = financeOn ? (
                  <Link
                    href={`/admin/financeiro/vendas/${origin.saleId}` as Route}
                    className="underline underline-offset-2"
                  >
                    {text}
                  </Link>
                ) : (
                  text
                );
              }
              return (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-sm"
                >
                  <span className="grid gap-0.5">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground">
                      {formatLocal(entry.createdAt, "dd/MM HH:mm", zone)}
                      {entry.actorName ? ` · ${entry.actorName}` : ""}
                      {entry.note ? ` · ${entry.note}` : ""}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-3">
                    <span className="font-semibold tabular-nums">
                      {entry.quantity > 0
                        ? `+${entry.quantity}`
                        : entry.quantity}
                    </span>
                    {!reversal && !entry.reversed ? (
                      <UndoButton movementId={entry.id} />
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
