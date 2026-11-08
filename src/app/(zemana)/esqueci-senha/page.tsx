import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/app/[slug]/esqueci-senha/forgot-form";
import { PageTitle } from "@/app/[slug]/ui";

import { AuthShell } from "../auth-shell";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function ZemanaForgotPasswordPage() {
  return (
    <AuthShell>
      <PageTitle description="Enviamos um link para você criar uma nova senha.">
        Esqueci minha senha
      </PageTitle>
      <ForgotPasswordForm redirectTo="/nova-senha" />
    </AuthShell>
  );
}
