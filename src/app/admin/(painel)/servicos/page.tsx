import type { Metadata, Route } from "next";
import Link from "next/link";

import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/modules/auth/session";
import { formatCents } from "@/modules/services/fields";
import { listCatalog, type ServiceListItem } from "@/modules/services/services";

import { CategoryForm } from "./category-forms";

export const metadata: Metadata = { title: "Serviços" };

// Each card opens with a stripe in one of the Zemana tints, in turn.
const TOP_TONES = [
  "border-t-highlight",
  "border-t-brand-accent",
  "border-t-primary",
];

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

export default async function ServicesPage() {
  const { clinicId } = await requireAdmin();
  const catalog = await listCatalog(clinicId);
  const serviceCount = catalog.reduce(
    (total, category) => total + category.services.length,
    0,
  );

  return (
    <div className="grid max-w-5xl gap-8">
      <PageHeader
        title="Serviços"
        eyebrow={`${plural(serviceCount, "serviço", "serviços")} em ${plural(catalog.length, "categoria", "categorias")}`}
      >
        <Button asChild>
          <Link href={"/admin/servicos/novo" as Route}>
            <Icon name="plus" />
            Novo serviço
          </Link>
        </Button>
      </PageHeader>

      <details className="rounded-2xl border bg-card">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-2xl px-4 text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <Icon name="plus" className="size-4" />
          Nova categoria
        </summary>
        <div className="border-t p-4">
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
            <ul className="grid gap-3 sm:grid-cols-2">
              {category.services.map((service, index) => {
                const price = priceLabel(service);
                return (
                  <li
                    key={service.id}
                    className={cn(
                      "relative grid content-start gap-1 rounded-2xl border border-t-4 bg-card p-4 hover:bg-accent/40",
                      TOP_TONES[index % TOP_TONES.length],
                      service.isActive ? null : "opacity-70",
                    )}
                  >
                    <Link
                      href={`/admin/servicos/${service.id}` as Route}
                      className="font-heading font-bold break-words outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
                    >
                      {service.name}
                    </Link>
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
                    </p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={cn(
                          "font-heading text-lg font-extrabold",
                          price ? null : "text-muted-foreground",
                        )}
                      >
                        {price ?? "Sem preço"}
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        {service.isActive ? null : <Badge>Inativo</Badge>}
                        {service.isFlexible ? (
                          <Badge>Encaixe flexível</Badge>
                        ) : null}
                      </span>
                    </div>
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
