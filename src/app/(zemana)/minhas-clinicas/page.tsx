import { DateTime } from "luxon";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Icon } from "@/app/[slug]/icons";
import { SignOutButton } from "@/app/[slug]/sign-out-button";
import { whatsappUrl } from "@/app/[slug]/ui";
import { Button } from "@/components/ui/button";
import { getSession } from "@/modules/auth/session";
import { listMyClinics, type MyClinic } from "@/modules/clients/my-clinics";

import { AuthShell } from "../auth-shell";
import { ClinicCardHeader } from "../clinic-card";

export const metadata: Metadata = { title: "Suas clínicas" };

const score = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

// "Qui, 14/11 às 14h" (or "às 14h30"), in the clinic's time zone.
function appointmentLabel(startsAt: Date, timezone: string) {
  const start = DateTime.fromJSDate(startsAt, { zone: timezone }).setLocale(
    "pt-BR",
  );
  const weekday = start.toFormat("ccc").replace(".", "");
  const time =
    start.minute === 0 ? start.toFormat("H'h'") : start.toFormat("H'h'mm");
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${start.toFormat("dd/LL")} às ${time}`;
}

function NextAppointment({ clinic }: { clinic: MyClinic }) {
  const next = clinic.nextAppointment;
  if (!next) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2.5 text-sm text-muted-foreground">
        <Icon name="calendar" className="size-4 shrink-0" />
        Nenhum horário marcado
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 rounded-xl bg-brand-accent px-3 py-2.5 text-sm text-brand-accent-foreground">
      <Icon name="calendar" className="size-4 shrink-0" />
      <span className="min-w-0">
        <span className="font-semibold">
          {appointmentLabel(next.startsAt, clinic.timezone)}
        </span>{" "}
        · {next.service}
      </span>
    </p>
  );
}

function Loyalty({ loyalty }: { loyalty: NonNullable<MyClinic["loyalty"]> }) {
  if (loyalty.prize) {
    return (
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Icon name="gift" className="size-4 shrink-0 text-primary" />
        Você ganhou: {loyalty.reward}
      </p>
    );
  }
  return (
    <div className="grid gap-1.5">
      <p className="text-sm text-muted-foreground">
        Fidelidade: {loyalty.stamps} de {loyalty.visits} · {loyalty.reward}
      </p>
      <div className="flex flex-wrap gap-1.5" aria-hidden="true">
        {Array.from({ length: loyalty.visits }, (_, index) => (
          <span
            key={index}
            className={
              index < loyalty.stamps
                ? "size-3.5 rounded-full border border-highlight bg-highlight"
                : "size-3.5 rounded-full border border-primary/40"
            }
          />
        ))}
      </div>
    </div>
  );
}

function ClinicCard({ clinic }: { clinic: MyClinic }) {
  const linkClass =
    "inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary";
  return (
    <li className="grid gap-3 rounded-2xl border bg-card p-2 pb-3">
      <ClinicCardHeader
        clinic={clinic}
        badge={
          clinic.rating ? (
            <span className="inline-flex items-center gap-1">
              <Icon name="star" className="size-3.5" />
              {score.format(clinic.rating.average)}
              <span className="sr-only">
                {" "}
                de 5, em {clinic.rating.total} avaliações
              </span>
            </span>
          ) : null
        }
      />
      <div className="grid gap-3 px-2">
        <NextAppointment clinic={clinic} />
        {clinic.loyalty ? <Loyalty loyalty={clinic.loyalty} /> : null}
        <div className="grid grid-cols-2 gap-2">
          <Button asChild size="lg">
            <a href={`/${clinic.slug}/marcar` as Route}>Agendar</a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href={`/${clinic.slug}/meus-horarios` as Route}>Meus horários</a>
          </Button>
        </div>
        <div className="flex justify-around">
          <a href={`/${clinic.slug}` as Route} className={linkClass}>
            <Icon name="home" className="size-4" />
            Ver página
          </a>
          {clinic.whatsappPhone ? (
            <a
              href={whatsappUrl(clinic.whatsappPhone)}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              <Icon name="whatsapp" className="size-4" />
              WhatsApp
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export default async function MyClinicsPage() {
  const session = await getSession();
  if (!session) redirect("/entrar");
  if (session.user.role !== "client") redirect("/admin");
  // Only the id from the session reaches the database function.
  const clinics = await listMyClinics(session.user.id);
  const firstName = session.user.name.trim().split(/\s+/)[0] ?? "";

  return (
    <AuthShell>
      <header className="grid gap-0.5">
        {firstName ? (
          <p className="font-heading text-2xl font-semibold">
            Olá, {firstName}
          </p>
        ) : null}
        <h1 className="text-muted-foreground">Suas clínicas</h1>
      </header>
      {clinics.length === 0 ? (
        <div className="grid gap-3 rounded-2xl border bg-card p-5">
          <p className="text-muted-foreground">
            Você ainda não é cliente de nenhuma clínica. Escolha a sua para
            começar.
          </p>
          <Button asChild size="lg">
            <Link href="/clinicas">Escolher clínica</Link>
          </Button>
        </div>
      ) : (
        <>
          <ul className="grid gap-4">
            {clinics.map((clinic) => (
              <ClinicCard key={clinic.slug} clinic={clinic} />
            ))}
          </ul>
          <Link
            href="/clinicas"
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-dashed font-semibold text-primary hover:bg-accent"
          >
            <Icon name="plus" className="size-5" />
            Adicionar outra clínica
          </Link>
        </>
      )}
      <SignOutButton to="/entrar" />
    </AuthShell>
  );
}
