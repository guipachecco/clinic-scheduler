import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/modules/auth/session";
import { getClinicBranding } from "@/modules/branding/branding";

import { PhotoForm } from "./photo-form";

export const metadata: Metadata = { title: "Meu perfil" };

// Who is signed in, and the profile photo. The photo is the clinic's owner
// photo: the same one the panel greets with and the public page shows.
export default async function ProfilePage() {
  const session = await requireAdmin();
  const branding = await getClinicBranding(session.clinicId);

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title="Meu perfil" />

      <section className="grid gap-4 rounded-2xl border bg-card p-5">
        <div className="grid gap-1">
          <h2 className="font-heading text-lg font-bold">Foto de perfil</h2>
          <p className="text-sm text-muted-foreground">
            Aparece aqui no painel e na sua página, para quem vai agendar. A
            troca vale na hora.
          </p>
        </div>
        <PhotoForm
          photoId={branding?.ownerPhotoMediaId ?? null}
          name={session.user.name}
        />
      </section>

      <section className="grid gap-3 rounded-2xl border bg-card p-5">
        <h2 className="font-heading text-lg font-bold">Sua conta</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground">Nome</dt>
            <dd className="font-medium break-words">{session.user.name}</dd>
          </div>
          <div className="grid gap-0.5">
            <dt className="text-muted-foreground">E-mail de acesso</dt>
            <dd className="font-medium break-all">{session.user.email}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
