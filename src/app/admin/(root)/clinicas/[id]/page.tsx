import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireRoot } from "@/modules/auth/session";
import { getClinicForEdit } from "@/modules/clinics/clinics";

import { ClinicEditForm } from "./clinic-edit-form";

export const metadata: Metadata = { title: "Editar clínica" };

// Root only: name, business type and modules of one clinic. The address
// (slug) is shown but never changes here.
export default async function EditClinicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRoot();
  const { id } = await params;
  const clinic = await getClinicForEdit(id);
  if (!clinic) notFound();

  return (
    <div className="grid max-w-2xl gap-6">
      <div className="grid gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">
          Editar
        </h1>
        <p className="text-muted-foreground">
          Endereço: /{clinic.slug}, não muda aqui
        </p>
      </div>
      <ClinicEditForm
        id={clinic.id}
        defaults={{
          name: clinic.name,
          businessType: clinic.businessType,
          modules: clinic.modules,
        }}
      />
    </div>
  );
}
