import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { requireRoot } from "@/modules/auth/session";
import { listClinics } from "@/modules/clinics/clinics";

import { openClinicAction, toggleClinicAction } from "./actions";
import { ClinicForm } from "./clinic-form";

export const metadata: Metadata = { title: "Clínicas" };

// Root only: every clinic, the one to open in the panel, and a new clinic.
export default async function ClinicsPage() {
  await requireRoot();
  const clinics = await listClinics();

  return (
    <div className="grid gap-8">
      <div className="grid gap-1">
        <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">
          Clínicas
        </h1>
        <p className="text-muted-foreground">
          Escolha a clínica que o painel vai mostrar. Cada clínica só enxerga os
          próprios dados.
        </p>
      </div>

      <ul className="grid gap-3">
        {clinics.map((clinic) => (
          <li
            key={clinic.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4"
          >
            <div className="min-w-0">
              <p className="font-semibold break-words">{clinic.name}</p>
              <p className="text-sm text-muted-foreground">
                /{clinic.slug}
                {clinic.isActive ? "" : " · desativada"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <form action={openClinicAction}>
                <input type="hidden" name="clinicId" value={clinic.id} />
                <Button type="submit">Abrir painel</Button>
              </form>
              <form action={toggleClinicAction}>
                <input type="hidden" name="clinicId" value={clinic.id} />
                <input
                  type="hidden"
                  name="active"
                  value={clinic.isActive ? "false" : "true"}
                />
                <Button type="submit" variant="outline">
                  {clinic.isActive ? "Desativar" : "Reativar"}
                </Button>
              </form>
            </div>
          </li>
        ))}
      </ul>

      <section aria-labelledby="nova-clinica" className="grid gap-4">
        <h2 id="nova-clinica" className="font-heading text-lg font-semibold">
          Nova clínica
        </h2>
        <ClinicForm />
      </section>
    </div>
  );
}
