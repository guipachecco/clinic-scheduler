import type { Metadata } from "next";

import { getClientUser, requireClinic } from "@/modules/clients/session";

import { ConfirmEmail } from "./confirm-email";

export const metadata: Metadata = { title: "Confirmar e-mail" };

// Opened from the confirmation e-mail (/<slug>/confirmar-email?token=...).
export default async function ConfirmEmailPage({
  params,
  searchParams,
}: PageProps<"/[slug]/confirmar-email">) {
  const clinic = await requireClinic((await params).slug);
  const { token } = await searchParams;
  const user = await getClientUser();

  return (
    <ConfirmEmail
      slug={clinic.slug}
      token={typeof token === "string" ? token : ""}
      email={user && !user.emailVerified ? user.email : null}
    />
  );
}
