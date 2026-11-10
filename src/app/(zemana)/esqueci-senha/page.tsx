import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/app/[slug]/esqueci-senha/forgot-form";
import { PageTitle } from "@/app/[slug]/ui";

import { AuthArt } from "../auth-art";
import { AuthShell } from "../auth-shell";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function ZemanaForgotPasswordPage() {
  return (
    <AuthShell
      art={
        <AuthArt
          sticker="Acontece"
          lines={["Esqueceu?", "A gente", "resolve."]}
          note="Mandamos um link pro seu e-mail e você cria uma senha nova."
        />
      }
    >
      <PageTitle description="Enviamos um link para você criar uma nova senha.">
        Esqueci minha senha
      </PageTitle>
      <ForgotPasswordForm redirectTo="/nova-senha" />
    </AuthShell>
  );
}
