import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/modules/auth/session";
import { searchPatients } from "@/modules/patients/patients";

import { PatientSearch } from "./patient-search";

export const metadata: Metadata = { title: "Pacientes" };

function countLabel(count: number, more: boolean) {
  if (more) return `Mais de ${count} pacientes`;
  return count === 1 ? "1 paciente" : `${count} pacientes`;
}

export default async function PatientsPage() {
  const { clinicId } = await requireAdmin();
  const { items, next } = await searchPatients(clinicId, { term: "" });

  return (
    <div className="grid max-w-5xl gap-6">
      <PageHeader
        title="Pacientes"
        eyebrow={items.length > 0 ? countLabel(items.length, !!next) : null}
      >
        <Button asChild>
          <Link href="/admin/pacientes/novo">
            <Icon name="plus" />
            Novo paciente
          </Link>
        </Button>
      </PageHeader>
      <PatientSearch initialItems={items} initialNext={next} />
    </div>
  );
}
