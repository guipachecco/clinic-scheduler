import type { Metadata, Route } from "next";
import Link from "next/link";

import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requireModule } from "@/modules/auth/session";
import { listProductCatalog } from "@/modules/products/products";
import { formatCents } from "@/modules/services/fields";

import { ExampleProductsButton, ProductCategoryForm } from "./category-forms";

export const metadata: Metadata = { title: "Produtos" };

// Each card opens with a stripe in one of the Zemana tints, in turn.
const TOP_TONES = [
  "border-t-highlight",
  "border-t-brand-accent",
  "border-t-primary",
];

function plural(count: number, one: string, many: string) {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
      {children}
    </span>
  );
}

export default async function ProductsPage() {
  const { clinicId } = await requireModule("products");
  const catalog = await listProductCatalog(clinicId);
  const productCount = catalog.reduce(
    (total, category) => total + category.products.length,
    0,
  );

  return (
    <div className="grid max-w-5xl gap-8">
      <PageHeader
        title="Produtos"
        eyebrow={`${plural(productCount, "produto", "produtos")} em ${plural(catalog.length, "categoria", "categorias")}`}
      >
        <Button asChild>
          <Link href={"/admin/produtos/novo" as Route}>
            <Icon name="plus" />
            Novo produto
          </Link>
        </Button>
      </PageHeader>

      {productCount === 0 ? (
        <section className="grid gap-3 rounded-2xl border bg-card p-4">
          <p>Nenhum produto cadastrado ainda.</p>
          <ExampleProductsButton />
        </section>
      ) : null}

      <details className="rounded-2xl border bg-card">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-2xl px-4 text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <Icon name="plus" className="size-4" />
          Nova categoria
        </summary>
        <div className="border-t p-4">
          <ProductCategoryForm mode="create" />
        </div>
      </details>

      {catalog.map((category) => (
        <section
          key={category.id}
          aria-labelledby={`categoria-${category.id}`}
          className="grid gap-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            <h2
              id={`categoria-${category.id}`}
              className="font-heading text-lg font-bold"
            >
              {category.name}
            </h2>
            {category.isActive ? null : <Badge>Inativa</Badge>}
          </div>
          <details className="group">
            <summary className="flex min-h-9 w-fit cursor-pointer list-none items-center rounded-md text-sm font-semibold text-muted-foreground outline-none group-open:text-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              Editar categoria
              <span className="sr-only">: {category.name}</span>
            </summary>
            <div className="mt-2 rounded-2xl border bg-card p-4">
              <ProductCategoryForm
                mode="edit"
                id={category.id}
                defaults={{ name: category.name }}
              />
            </div>
          </details>
          {category.products.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum produto nesta categoria.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {category.products.map((product, index) => (
                <li
                  key={product.id}
                  className={cn(
                    "relative grid content-start gap-1 rounded-2xl border border-t-4 bg-card p-4 hover:bg-accent/40",
                    TOP_TONES[index % TOP_TONES.length],
                    product.isActive ? null : "opacity-70",
                  )}
                >
                  <Link
                    href={`/admin/produtos/${product.id}` as Route}
                    className="font-heading font-bold break-words outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
                  >
                    {product.name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    Estoque: {product.stockQuantity}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={cn(
                        "font-heading text-lg font-extrabold",
                        product.priceCents === null
                          ? "text-muted-foreground"
                          : null,
                      )}
                    >
                      {product.priceCents === null
                        ? "Sem preço"
                        : formatCents(product.priceCents)}
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      {product.isActive ? null : <Badge>Inativo</Badge>}
                      {product.showOnPage ? null : (
                        <Badge>Fora da página</Badge>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
