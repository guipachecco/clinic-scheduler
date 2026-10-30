import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/modules/auth/session";
import {
  ageOn,
  isMinor,
  todayInClinic,
  type PatientFormInput,
} from "@/modules/patients/fields";
import { getPatient } from "@/modules/patients/patients";

import { formatDate } from "../format";
import { PatientForm } from "../patient-form";

import { AnonymizeForm } from "./anonymize-form";

// No patient data in the title: it would reach the browser history.
export const metadata: Metadata = { title: "Paciente" };

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const patient = await getPatient(id);
  if (!patient) notFound();

  const today = todayInClinic();
  const defaults: PatientFormInput = {
    name: patient.name,
    nickname: patient.nickname ?? "",
    cpf: patient.cpf ?? "",
    rg: patient.rg ?? "",
    phone: patient.phone ?? "",
    landlinePhone: patient.landlinePhone ?? "",
    email: patient.email ?? "",
    birthDate: patient.birthDate ?? "",
    gender: patient.gender ?? "",
    referralSource: patient.referralSource ?? "",
    referredBy: patient.referredBy ?? "",
    notes: patient.notes ?? "",
  };

  return (
    <div className="grid max-w-3xl gap-8">
      <header className="grid gap-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {patient.name}
        </h1>
        {patient.nickname ? (
          <p className="text-muted-foreground">Apelido: {patient.nickname}</p>
        ) : null}
        {patient.birthDate ? (
          <p className="flex flex-wrap items-center gap-2">
            <span>
              {ageOn(patient.birthDate, today)} anos (
              {formatDate(patient.birthDate)})
            </span>
            {isMinor(patient.birthDate, today) ? (
              <span className="rounded-full bg-highlight px-3 py-1 text-sm font-semibold text-highlight-foreground">
                Menor de idade
              </span>
            ) : null}
          </p>
        ) : (
          <p
            role="status"
            className="w-fit rounded-lg bg-highlight px-3 py-2 text-sm font-semibold text-highlight-foreground"
          >
            Cadastro incompleto: falta a data de nascimento.
          </p>
        )}
      </header>

      <section aria-labelledby="dados" className="grid gap-4">
        <h2 id="dados" className="font-heading text-lg font-semibold">
          Dados do cadastro
        </h2>
        <PatientForm mode="edit" id={patient.id} defaults={defaults} />
      </section>

      <section
        aria-labelledby="anonimizar"
        className="grid gap-4 rounded-2xl border border-destructive/30 p-4 md:p-6"
      >
        <h2 id="anonimizar" className="font-heading text-lg font-semibold">
          Anonimizar paciente
        </h2>
        <AnonymizeForm id={patient.id} />
      </section>
    </div>
  );
}
