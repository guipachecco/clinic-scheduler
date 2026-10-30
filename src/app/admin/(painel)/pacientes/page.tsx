import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/modules/auth/session";
import { searchPatients } from "@/modules/patients/patients";

import { PatientSearch } from "./patient-search";

export const metadata: Metadata = { title: "Pacientes" };

export default async function PatientsPage() {
  await requireAdmin();
  const { items, next } = await searchPatients({ term: "" });

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Pacientes
        </h1>
        <Button asChild>
          <Link href="/admin/pacientes/novo">Novo paciente</Link>
        </Button>
      </div>
      <PatientSearch initialItems={items} initialNext={next} />
    </div>
  );
}
