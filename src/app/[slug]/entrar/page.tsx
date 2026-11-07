import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getClientUser,
  requireClinic,
  safeNext,
} from "@/modules/clients/session";

import { PageTitle } from "../ui";

import { ClientLoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function ClientLoginPage({
  params,
  searchParams,
}: PageProps<"/[slug]/entrar">) {
  const clinic = await requireClinic((await params).slug);
  const next =
    safeNext(clinic.slug, (await searchParams).next) ??
    `/${clinic.slug}/marcar`;
  if (await getClientUser()) redirect(next);
  const linkClass = "font-semibold text-primary underline underline-offset-4";

  return (
    <>
      <PageTitle description="Entre com o e-mail e a senha da sua conta.">
        Entrar
      </PageTitle>
      <ClientLoginForm next={next} />
      <div className="grid gap-2 text-center text-sm">
        <Link href={`/${clinic.slug}/esqueci-senha`} className={linkClass}>
          Esqueci minha senha
        </Link>
        <p className="text-muted-foreground">
          Ainda não tem conta?{" "}
          <Link
            href={
              `/${clinic.slug}/cadastro?next=${encodeURIComponent(next)}` as Route
            }
            className={linkClass}
          >
            Criar conta
          </Link>
        </p>
      </div>
    </>
  );
}
