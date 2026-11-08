import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/app/[slug]/sign-out-button";
import { PageTitle } from "@/app/[slug]/ui";
import { Button } from "@/components/ui/button";
import { getSession } from "@/modules/auth/session";
import { initialsFor } from "@/modules/branding/palettes";
import { listMyClinics } from "@/modules/clients/my-clinics";

import { AuthShell } from "../auth-shell";

export const metadata: Metadata = { title: "Suas clínicas" };

export default async function MyClinicsPage() {
  const session = await getSession();
  if (!session) redirect("/entrar");
  if (session.user.role !== "client") redirect("/admin");
  // Only the id from the session reaches the database function.
  const clinics = await listMyClinics(session.user.id);

  return (
    <AuthShell>
      <PageTitle>Suas clínicas</PageTitle>
      {clinics.length === 0 ? (
        <p className="rounded-2xl border bg-card p-5 text-muted-foreground">
          Você ainda não é cliente de nenhuma clínica. Peça o link para a sua
          profissional.
        </p>
      ) : (
        <ul className="grid gap-3">
          {clinics.map((clinic) => (
            <li
              key={clinic.slug}
              className="grid gap-4 rounded-2xl border bg-card p-4"
            >
              <div className="flex items-center gap-3">
                {clinic.hasPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element -- served by the /foto route handler
                  <img
                    src={`/${clinic.slug}/foto`}
                    alt=""
                    className="size-14 shrink-0 rounded-full border bg-card object-cover"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-lg font-semibold text-primary-foreground"
                  >
                    {initialsFor(clinic.name)}
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="truncate font-heading text-lg font-semibold">
                    {clinic.name}
                  </h2>
                  {clinic.areaLabel ? (
                    <p className="truncate text-sm text-muted-foreground">
                      {clinic.areaLabel}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button asChild size="lg">
                  <a href={`/${clinic.slug}/marcar` as Route}>Agendar</a>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href={`/${clinic.slug}/meus-horarios` as Route}>
                    Meus horários
                  </a>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <SignOutButton to="/entrar" />
    </AuthShell>
  );
}
