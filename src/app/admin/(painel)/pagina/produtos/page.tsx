import type { Metadata, Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/modules/auth/session";
import { listProducts } from "@/modules/clinic-page/panel";
import { formatCents } from "@/modules/services/fields";

import { ExampleProductsButton, ProductForm } from "./product-form";

export const metadata: Metadata = { title: "Produtos" };

// 5990 -> "59,90", the way the owner types a price.
function priceInput(cents: number | null) {
  return cents === null ? "" : (cents / 100).toFixed(2).replace(".", ",");
}

export default async function ProductsPage() {
  const { clinicId } = await requireAdmin();
  const products = await listProducts(clinicId);

  return (
    <div className="grid max-w-3xl gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Produtos
        </h1>
        <Button asChild variant="outline">
          <Link href={"/admin/pagina" as Route}>Voltar à página</Link>
        </Button>
      </header>
      <p className="text-sm text-muted-foreground">
        Os produtos ativos aparecem na página da clínica.
      </p>

      {products.length === 0 ? (
        <section className="grid gap-3 rounded-2xl border bg-card p-4">
          <p>Nenhum produto cadastrado ainda.</p>
          <ExampleProductsButton />
        </section>
      ) : (
        <ul className="grid gap-2">
          {products.map((product) => (
            <li key={product.id} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{product.name}</span>
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  {product.priceCents === null
                    ? "Sem preço"
                    : formatCents(product.priceCents)}
                  {product.isActive ? null : (
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                      Escondido
                    </span>
                  )}
                </span>
              </div>
              <details className="mt-2">
                <summary className="flex h-11 cursor-pointer items-center rounded-md text-sm font-medium text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                  Editar
                </summary>
                <div className="mt-2">
                  <ProductForm
                    mode="edit"
                    id={product.id}
                    defaults={{
                      name: product.name,
                      price: priceInput(product.priceCents),
                      description: product.description ?? "",
                      isActive: product.isActive,
                    }}
                  />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-2xl border p-4">
        <summary className="flex h-11 cursor-pointer items-center rounded-md text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          Novo produto
        </summary>
        <div className="mt-4">
          <ProductForm mode="create" />
        </div>
      </details>
    </div>
  );
}
