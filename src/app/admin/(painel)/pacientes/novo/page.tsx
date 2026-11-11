import type { Metadata } from "next";

import { requireAdmin } from "@/modules/auth/session";
import { vocabulary } from "@/modules/business-type/vocabulary";

import { PatientForm } from "../patient-form";

export async function generateMetadata(): Promise<Metadata> {
  const { clinic } = await requireAdmin();
  return { title: vocabulary(clinic.businessType).newPerson };
}

const INICIO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export default async function NewPatientPage({
  searchParams,
}: {
  searchParams: Promise<{
    voltar?: string | string[];
    inicio?: string | string[];
  }>;
}) {
  const { clinic } = await requireAdmin();
  const { voltar, inicio } = await searchParams;
  // Allow-list: "agenda" is the only way back; anything else is ignored.
  const backToAgenda = voltar === "agenda";
  const slot =
    backToAgenda && typeof inicio === "string" && INICIO_PATTERN.test(inicio)
      ? inicio
      : undefined;

  return (
    <div className="grid max-w-3xl gap-6">
      <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">
        {vocabulary(clinic.businessType).newPerson}
      </h1>
      <PatientForm
        mode="create"
        voltar={backToAgenda ? "agenda" : undefined}
        inicio={slot}
      />
    </div>
  );
}
