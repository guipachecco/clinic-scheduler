import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/modules/auth/session";
import {
  ageOn,
  formatStoredCpf,
  formatStoredPhone,
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

  if (patient.anonymizedAt) {
    const anonymizedOn = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(patient.anonymizedAt);
    return (
      <div className="grid max-w-3xl gap-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          {patient.name}
        </h1>
        <p
          role="status"
          className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"
        >
          Dados pessoais apagados em {anonymizedOn} a pedido do titular (LGPD).
          O histórico de agendamentos é mantido.
        </p>
        <Button asChild variant="outline" className="w-fit">
          <Link href="/admin/pacientes">Voltar à lista</Link>
        </Button>
      </div>
    );
  }

  const today = todayInClinic();
  const defaults: PatientFormInput = {
    name: patient.name,
    nickname: patient.nickname ?? "",
    cpf: formatStoredCpf(patient.cpf),
    rg: patient.rg ?? "",
    phone: formatStoredPhone(patient.phone),
    landlinePhone: formatStoredPhone(patient.landlinePhone),
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

      <details className="rounded-2xl border p-4 md:p-6">
        <summary className="flex h-11 cursor-pointer items-center rounded-md text-sm font-medium text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          Anonimizar paciente (LGPD)
        </summary>
        <div className="mt-4 grid gap-4">
          <p className="text-sm text-muted-foreground">
            Use somente quando o próprio paciente pedir a exclusão dos seus
            dados (pedido do titular, LGPD).
          </p>
          <AnonymizeForm id={patient.id} />
        </div>
      </details>
    </div>
  );
}
