import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  type ClinicAccountKind,
  listClinicAccounts,
} from "@/modules/auth/admin-accounts";
import { requireRoot } from "@/modules/auth/session";
import { listClinics } from "@/modules/clinics/clinics";

import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Mudar senha" };

const KINDS: { value: ClinicAccountKind; label: string }[] = [
  { value: "owner", label: "Dona (conta da clínica)" },
  { value: "patient", label: "Paciente" },
];

// Root only: filter a clinic and the kind of account, then set a new password
// for one of them (typed or generated).
export default async function PasswordsPage({
  searchParams,
}: {
  searchParams: Promise<{ clinica?: string; tipo?: string }>;
}) {
  await requireRoot();
  const params = await searchParams;
  const clinics = await listClinics();
  const clinic = clinics.find((c) => c.id === params.clinica);
  const kind = KINDS.find((k) => k.value === params.tipo)?.value;
  const accounts =
    clinic && kind ? await listClinicAccounts(clinic.id, kind) : [];

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader title="Mudar senha" eyebrow="Contas das clínicas" />

      <form
        method="get"
        className="grid grid-cols-1 items-end gap-3 rounded-2xl border bg-card p-4 shadow-xs sm:grid-cols-[2fr_1fr_auto]"
      >
        <div className="grid gap-1">
          <Label htmlFor="senha-clinica">Clínica</Label>
          <NativeSelect
            id="senha-clinica"
            name="clinica"
            defaultValue={clinic?.id ?? ""}
          >
            <option value="">Escolha a clínica</option>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="senha-tipo">Tipo de conta</Label>
          <NativeSelect
            id="senha-tipo"
            name="tipo"
            defaultValue={kind ?? "owner"}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit">Ver contas</Button>
      </form>

      {clinic && kind ? (
        <SectionCard
          id="senha-titulo"
          icon="key"
          title={`${kind === "owner" ? "Donas" : "Pacientes"} · ${clinic.name}`}
          description="A senha nova vale na hora e encerra as sessões abertas da conta."
        >
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {kind === "owner"
                ? "Essa clínica não tem conta de dona."
                : "Nenhum paciente dessa clínica tem conta para entrar."}
            </p>
          ) : (
            // key: a new filter starts the form over.
            <PasswordForm
              key={`${clinic.id}-${kind}`}
              clinicId={clinic.id}
              kind={kind}
              accounts={accounts}
            />
          )}
        </SectionCard>
      ) : (
        <p className="rounded-2xl border border-dashed bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          Escolha a clínica e o tipo de conta.
        </p>
      )}
    </div>
  );
}
