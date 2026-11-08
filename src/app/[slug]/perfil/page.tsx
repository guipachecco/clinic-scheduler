import type { Metadata } from "next";

import { requireClient } from "@/modules/clients/session";

import { SignOutButton } from "../sign-out-button";
import { PageTitle } from "../ui";

export const metadata: Metadata = { title: "Perfil" };

// Her account: name, e-mail and sign out.
export default async function ProfilePage({
  params,
}: PageProps<"/[slug]/perfil">) {
  const slug = (await params).slug;
  const { user } = await requireClient(slug, `/${slug}/perfil`);

  return (
    <>
      <PageTitle>Perfil</PageTitle>
      <section className="grid gap-3 rounded-2xl border bg-card p-5">
        <div className="grid gap-0.5">
          <span className="text-sm text-muted-foreground">Nome</span>
          <span className="font-semibold">{user.name}</span>
        </div>
        <div className="grid gap-0.5">
          <span className="text-sm text-muted-foreground">E-mail</span>
          <span className="font-semibold break-all">{user.email}</span>
        </div>
      </section>
      <SignOutButton to={`/${slug}`} />
    </>
  );
}
