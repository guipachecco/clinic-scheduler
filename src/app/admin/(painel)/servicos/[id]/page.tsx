import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/modules/auth/session";
import { formatCents, type ServiceFormInput } from "@/modules/services/fields";
import { getService, listCatalog } from "@/modules/services/services";

import { ServiceForm } from "../service-form";

export const metadata: Metadata = { title: "Serviço" };

export default async function ServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const service = await getService(id);
  if (!service) notFound();

  const catalog = await listCatalog();
  // Active categories, plus the service's own even when it is inactive.
  const categories = catalog
    .filter(
      (category) => category.isActive || category.id === service.categoryId,
    )
    .map(({ id, name, isActive }) => ({ id, name, isActive }));

  const defaults: ServiceFormInput = {
    categoryId: service.categoryId,
    name: service.name,
    description: service.description ?? "",
    durationMinutes: String(service.durationMinutes),
    bufferBeforeMinutes: String(service.bufferBeforeMinutes),
    bufferAfterMinutes: String(service.bufferAfterMinutes),
    price:
      service.priceCents === null
        ? ""
        : formatCents(service.priceCents).replace("R$ ", ""),
    priceDisplay: service.priceDisplay,
    preparationInstructions: service.preparationInstructions ?? "",
    sortOrder: String(service.sortOrder),
    isActive: service.isActive,
    requiresApproval: service.requiresApproval,
    onlineBookingEnabled: service.onlineBookingEnabled,
  };

  return (
    <div className="grid max-w-3xl gap-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        {service.name}
      </h1>
      {service.isFlexible ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          Serviço flexível: no agendamento, a duração e um rótulo curto são
          definidos na hora.
        </p>
      ) : null}
      <ServiceForm
        mode="edit"
        id={service.id}
        defaults={defaults}
        categories={categories}
      />
    </div>
  );
}
