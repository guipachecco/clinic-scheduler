import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ClientLoginForm } from "@/app/[slug]/entrar/login-form";
import { PageTitle } from "@/app/[slug]/ui";
import { getSession } from "@/modules/auth/session";

import { AuthArt } from "../auth-art";
import { AuthShell, authLinkClass } from "../auth-shell";

export const metadata: Metadata = { title: "Entrar" };

export default async function ZemanaLoginPage() {
  const session = await getSession();
  if (session) {
    redirect(session.user.role === "client" ? "/minhas-clinicas" : "/admin");
  }

  return (
    <AuthShell
      art={
        <AuthArt
          sticker="Que bom te ver"
          lines={["Seus", "horários,", "num lugar só."]}
          note="Veja e marque seus horários nas clínicas onde você é cliente."
        />
      }
    >
      <PageTitle description="Entre com o e-mail e a senha da sua conta.">
        Entrar
      </PageTitle>
      <ClientLoginForm
        next="/minhas-clinicas"
        panelMessage="Essa conta entra pelo painel."
      />
      <div className="grid gap-2 text-center text-sm">
        <Link href="/esqueci-senha" className={authLinkClass}>
          Esqueci minha senha
        </Link>
        <p className="text-muted-foreground">
          Ainda não tem conta?{" "}
          <Link href="/clinicas" className={authLinkClass}>
            Criar conta
          </Link>
        </p>
        <Link href="/admin/entrar" className={authLinkClass}>
          É profissional? Entre no painel
        </Link>
      </div>
    </AuthShell>
  );
}
