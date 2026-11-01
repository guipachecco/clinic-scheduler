import type { Metadata, Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/modules/auth/session";
import { formatCents } from "@/modules/services/fields";
import { listCatalog, type ServiceListItem } from "@/modules/services/services";

import { CategoryForm } from "./category-forms";

export const metadata: Metadata = { title: "Serviços" };

function priceLabel(service: ServiceListItem) {
  const price =
    service.priceCents === null ? null : formatCents(service.priceCents);
  switch (service.priceDisplay) {
    case "fixed":
      return price;
    case "starting_at":
      return price ? `A partir de ${price}` : null;
    case "on_request":
      return "Sob consulta";
    default:
      return null;
  }
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

export default async function ServicesPage() {
  await requireAdmin();
  const catalog = await listCatalog();

  return (
    <div className="grid max-w-3xl gap-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Serviços
        </h1>
        <Button asChild>
          <Link href={"/admin/servicos/novo" as Route}>Novo serviço</Link>
        </Button>
      </header>

      <details className="rounded-2xl border p-4">
        <summary className="flex h-11 cursor-pointer items-center rounded-md text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          Nova categoria
        </summary>
        <div className="mt-4">
          <CategoryForm mode="create" />
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
              className="font-heading text-lg font-semibold"
            >
              {category.name}
            </h2>
            {category.isActive ? null : <Badge>Inativa</Badge>}
          </div>
          <details className="rounded-2xl border p-4">
            <summary className="flex h-11 cursor-pointer items-center rounded-md text-sm font-medium text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
              Editar categoria
              <span className="sr-only">: {category.name}</span>
            </summary>
            <div className="mt-4">
              <CategoryForm
                mode="edit"
                id={category.id}
                defaults={{
                  name: category.name,
                  sortOrder: String(category.sortOrder),
                  isActive: category.isActive,
                }}
              />
            </div>
          </details>
          {category.services.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum serviço nesta categoria.
            </p>
          ) : (
            <ul className="grid gap-2">
              {category.services.map((service) => {
                const price = priceLabel(service);
                return (
                  <li
                    key={service.id}
                    className="grid gap-1 rounded-2xl border bg-card p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/servicos/${service.id}` as Route}
                        className="font-medium text-primary underline underline-offset-4"
                      >
                        {service.name}
                      </Link>
                      {service.isActive ? null : <Badge>Inativo</Badge>}
                      {service.isFlexible ? (
                        <Badge>Encaixe flexível</Badge>
                      ) : null}
                    </div>
                    <p className="flex flex-wrap gap-x-3 text-sm text-muted-foreground">
                      <span>{service.durationMinutes} min</span>
                      {service.bufferBeforeMinutes > 0 ? (
                        <span>
                          +{service.bufferBeforeMinutes} min de preparo
                        </span>
                      ) : null}
                      {service.bufferAfterMinutes > 0 ? (
                        <span>
                          +{service.bufferAfterMinutes} min de intervalo
                        </span>
                      ) : null}
                      {price ? <span>{price}</span> : null}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
