import type { Metadata, Route } from "next";
import Link from "next/link";

import { PageTitle } from "@/app/[slug]/ui";
import { getSession } from "@/modules/auth/session";
import { listMyClinics, listPublicClinics } from "@/modules/clients/my-clinics";
import { MY_CLINICS_PATH } from "@/modules/clients/safe-next";

import { AuthShell, authLinkClass } from "../auth-shell";
import { ClinicCardHeader } from "../clinic-card";

export const metadata: Metadata = {
  title: "Clínicas",
  description:
    "Escolha a sua clínica na Zemana para criar sua conta e marcar horários online.",
  alternates: { canonical: "/clinicas" },
};

// The clinic list: a new client picks hers and signs up there (the clinic's
// own signup, back to "Suas clínicas"). A signed-in client uses it to become
// a client of another clinic, so her clinics are left out.
export default async function ClinicsPage() {
  const session = await getSession();
  const client = session?.user.role === "client" ? session.user : null;
  const [all, mine] = await Promise.all([
    listPublicClinics(),
    client ? listMyClinics(client.id) : Promise.resolve([]),
  ]);
  const taken = new Set(mine.map((clinic) => clinic.slug));
  const clinics = all.filter((clinic) => !taken.has(clinic.slug));
  const next = encodeURIComponent(MY_CLINICS_PATH);

  return (
    <AuthShell>
      <PageTitle
        description={
          client
            ? "Toque na clínica para completar sua ficha nela. Você usa a mesma conta."
            : "Toque na clínica em que você é atendida para criar sua conta."
        }
      >
        {client ? "Adicionar outra clínica" : "Escolha sua clínica"}
      </PageTitle>
      {clinics.length === 0 ? (
        <p className="rounded-2xl border bg-card p-5 text-muted-foreground">
          {client
            ? "Você já é cliente de todas as clínicas da Zemana."
            : "Nenhuma clínica aceita cadastro online agora."}
        </p>
      ) : (
        <ul className="grid gap-3">
          {clinics.map((clinic) => (
            <li key={clinic.slug}>
              <Link
                href={`/${clinic.slug}/cadastro?next=${next}` as Route}
                className="block rounded-2xl border bg-card p-2 pb-3 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <ClinicCardHeader clinic={clinic} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-center text-sm text-muted-foreground">
        {client ? (
          <Link href={MY_CLINICS_PATH} className={authLinkClass}>
            Voltar para suas clínicas
          </Link>
        ) : (
          <>
            Já tem conta?{" "}
            <Link href="/entrar" className={authLinkClass}>
              Entrar
            </Link>
          </>
        )}
      </p>
    </AuthShell>
  );
}
