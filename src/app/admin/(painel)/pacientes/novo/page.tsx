import type { Metadata } from "next";

import { requireAdmin } from "@/modules/auth/session";

import { PatientForm } from "../patient-form";

export const metadata: Metadata = { title: "Novo paciente" };

export default async function NewPatientPage() {
  await requireAdmin();

  return (
    <div className="grid max-w-3xl gap-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        Novo paciente
      </h1>
      <PatientForm mode="create" />
    </div>
  );
}
