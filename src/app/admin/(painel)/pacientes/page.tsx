import type { Metadata } from "next";
import Link from "next/link";

import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/modules/auth/session";
import { vocabulary } from "@/modules/business-type/vocabulary";
import { searchPatients } from "@/modules/patients/patients";

import { PatientSearch } from "./patient-search";

export async function generateMetadata(): Promise<Metadata> {
  const { clinic } = await requireAdmin();
  return { title: vocabulary(clinic.businessType).People };
}

function countLabel(
  count: number,
  more: boolean,
  words: { person: string; people: string },
) {
  if (more) return `Mais de ${count} ${words.people}`;
  return count === 1 ? `1 ${words.person}` : `${count} ${words.people}`;
}

export default async function PatientsPage() {
  const { clinicId, clinic } = await requireAdmin();
  const words = vocabulary(clinic.businessType);
  const { items, next } = await searchPatients(clinicId, { term: "" });

  return (
    <div className="grid max-w-5xl gap-6">
      <PageHeader
        title={words.People}
        eyebrow={
          items.length > 0 ? countLabel(items.length, !!next, words) : null
        }
      >
        <Button asChild>
          <Link href="/admin/pacientes/novo">
            <Icon name="plus" />
            {words.newPerson}
          </Link>
        </Button>
      </PageHeader>
      <PatientSearch initialItems={items} initialNext={next} />
    </div>
  );
}
