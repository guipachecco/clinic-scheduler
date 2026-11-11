import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getAnamnesis } from "@/modules/anamnesis/anamnesis";
import { requireAdmin } from "@/modules/auth/session";
import { todayInClinic } from "@/modules/patients/fields";
import { getPatient } from "@/modules/patients/patients";

import { AnamnesisForm } from "./anamnesis-form";

// No patient data in the title: it would reach the browser history.
export const metadata: Metadata = { title: "Anamnese" };

export default async function AnamnesisPage({
  params,
}: {
  params: Promise<{ id: string; anamneseId: string }>;
}) {
  const { clinicId } = await requireAdmin();
  const { id: patientId, anamneseId } = await params;
  const anamnesis = await getAnamnesis(clinicId, patientId, anamneseId);
  if (!anamnesis) notFound();
  const patient = await getPatient(clinicId, patientId);
  if (!patient) notFound();

  return (
    <div className="grid max-w-3xl min-w-0 gap-6">
      <header className="grid gap-2">
        <Link
          href={`/admin/pacientes/${patientId}` as Route}
          className="w-fit text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Voltar à ficha
        </Link>
        <p className="break-words text-muted-foreground">{patient.name}</p>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {anamnesis.template.title}
        </h1>
      </header>
      <AnamnesisForm
        patientId={patientId}
        id={anamnesis.id}
        template={anamnesis.template}
        initialAnswers={anamnesis.answers}
        initialTakenOn={anamnesis.takenOn}
        initialStatus={anamnesis.status}
        initialUpdatedAt={anamnesis.updatedAt.toISOString()}
        today={todayInClinic()}
      />
    </div>
  );
}
