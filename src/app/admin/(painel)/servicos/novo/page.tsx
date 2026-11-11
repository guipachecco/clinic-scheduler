import type { Metadata } from "next";

import { requireAdmin } from "@/modules/auth/session";
import { listCatalog } from "@/modules/services/services";

import { ServiceForm } from "../service-form";

export const metadata: Metadata = { title: "Novo serviço" };

export default async function NewServicePage() {
  const { clinicId } = await requireAdmin();
  const catalog = await listCatalog(clinicId);
  const categories = catalog
    .filter((category) => category.isActive)
    .map(({ id, name, isActive }) => ({ id, name, isActive }));

  return (
    <div className="grid max-w-3xl gap-6">
      <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">
        Novo serviço
      </h1>
      <ServiceForm mode="create" categories={categories} />
    </div>
  );
}
