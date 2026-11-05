import type { Metadata } from "next";

import { requireClinic } from "@/modules/clients/session";

import { PageTitle } from "../ui";

import { ForgotPasswordForm } from "./forgot-form";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default async function ForgotPasswordPage({
  params,
}: PageProps<"/[slug]/esqueci-senha">) {
  const clinic = await requireClinic((await params).slug);
  return (
    <>
      <PageTitle description="Enviamos um link para você criar uma nova senha.">
        Esqueci minha senha
      </PageTitle>
      <ForgotPasswordForm slug={clinic.slug} />
    </>
  );
}
