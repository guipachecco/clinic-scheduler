import type { Metadata } from "next";
import Link from "next/link";

import { NewPasswordForm } from "@/app/[slug]/nova-senha/new-password-form";
import { PageTitle } from "@/app/[slug]/ui";
import { MIN_PASSWORD_LENGTH } from "@/modules/auth/password-policy";

import { AuthArt } from "../auth-art";
import { AuthShell, authLinkClass } from "../auth-shell";

export const metadata: Metadata = { title: "Nova senha" };

const art = (
  <AuthArt
    sticker="Quase lá"
    lines={["Senha", "nova,", "tudo certo."]}
    note="Depois é só entrar e voltar pra sua agenda."
  />
);

export default async function ZemanaNewPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;

  if (typeof token !== "string" || token.length === 0) {
    return (
      <AuthShell art={art}>
        <PageTitle description="O link está incompleto ou já foi usado.">
          Link inválido
        </PageTitle>
        <Link href="/esqueci-senha" className={authLinkClass}>
          Pedir um novo link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell art={art}>
      <PageTitle
        description={`Escolha uma senha com pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`}
      >
        Nova senha
      </PageTitle>
      <NewPasswordForm signInHref="/entrar" token={token} />
    </AuthShell>
  );
}
