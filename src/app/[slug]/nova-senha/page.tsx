import type { Metadata } from "next";
import Link from "next/link";

import { MIN_PASSWORD_LENGTH } from "@/modules/auth/password-policy";
import { requireClinic } from "@/modules/clients/session";

import { PageTitle } from "../ui";

import { NewPasswordForm } from "./new-password-form";

export const metadata: Metadata = { title: "Nova senha" };

export default async function NewPasswordPage({
  params,
  searchParams,
}: PageProps<"/[slug]/nova-senha">) {
  const clinic = await requireClinic((await params).slug);
  const { token } = await searchParams;

  if (typeof token !== "string" || token.length === 0) {
    return (
      <>
        <PageTitle description="O link está incompleto ou já foi usado.">
          Link inválido
        </PageTitle>
        <Link
          href={`/${clinic.slug}/esqueci-senha`}
          className="font-semibold text-primary-text underline underline-offset-4"
        >
          Pedir um novo link
        </Link>
      </>
    );
  }

  return (
    <>
      <PageTitle
        description={`Escolha uma senha com pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`}
      >
        Nova senha
      </PageTitle>
      <NewPasswordForm signInHref={`/${clinic.slug}/entrar`} token={token} />
    </>
  );
}
