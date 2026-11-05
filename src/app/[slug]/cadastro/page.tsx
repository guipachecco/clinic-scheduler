import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getClientContext } from "@/modules/clients/context";
import {
  getClientUser,
  requireClinic,
  safeNext,
} from "@/modules/clients/session";

import { PageTitle, Unavailable } from "../ui";

import { CompleteForm, SignupForm } from "./signup-forms";

export const metadata: Metadata = { title: "Criar conta" };

export default async function SignupPage({
  params,
  searchParams,
}: PageProps<"/[slug]/cadastro">) {
  const clinic = await requireClinic((await params).slug);
  // No new accounts or records while the clinic has online booking off.
  if (!clinic.onlineBookingEnabled) return <Unavailable clinic={clinic} />;
  const query = await searchParams;
  const next = safeNext(clinic.slug, query.next) ?? `/${clinic.slug}/marcar`;
  const user = await getClientUser();

  if (user) {
    const context = await getClientContext(clinic.slug, user.id);
    if (context?.patientId) redirect(next);
    return (
      <>
        <PageTitle description="Confirme seu nome e celular para marcar horários nesta clínica.">
          Complete seu cadastro
        </PageTitle>
        <CompleteForm slug={clinic.slug} next={next} defaultName={user.name} />
      </>
    );
  }

  return (
    <>
      <PageTitle description="Você usa o e-mail e a senha para entrar e marcar seus horários.">
        Criar conta
      </PageTitle>
      <SignupForm slug={clinic.slug} />
      <p className="text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link
          href={`/${clinic.slug}/entrar`}
          className="font-semibold text-primary underline underline-offset-4"
        >
          Entrar
        </Link>
      </p>
    </>
  );
}
