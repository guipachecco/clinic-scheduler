import type { Metadata } from "next";

import { requireAdmin } from "@/modules/auth/session";

import { PatientForm } from "../patient-form";

export const metadata: Metadata = { title: "Novo paciente" };

const INICIO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export default async function NewPatientPage({
  searchParams,
}: {
  searchParams: Promise<{
    voltar?: string | string[];
    inicio?: string | string[];
  }>;
}) {
  await requireAdmin();
  const { voltar, inicio } = await searchParams;
  // Allow-list: "agenda" is the only way back; anything else is ignored.
  const backToAgenda = voltar === "agenda";
  const slot =
    backToAgenda && typeof inicio === "string" && INICIO_PATTERN.test(inicio)
      ? inicio
      : undefined;

  return (
    <div className="grid max-w-3xl gap-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Novo paciente
      </h1>
      <PatientForm
        mode="create"
        voltar={backToAgenda ? "agenda" : undefined}
        inicio={slot}
      />
    </div>
  );
}
