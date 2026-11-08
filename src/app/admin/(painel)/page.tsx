import type { Metadata, Route } from "next";
import Link from "next/link";

import { requireAdmin } from "@/modules/auth/session";
import { getClinicBranding } from "@/modules/branding/branding";
import { greeting } from "@/modules/dashboard/day";
import { getPanelHome } from "@/modules/dashboard/dashboard";
import { listPendingLinks } from "@/modules/patients/links";
import { formatCents } from "@/modules/services/fields";

import { PendingLinkNotice } from "./pacientes/pending-link-notice";
import { DayList } from "./home/day-list";
import { HomeHeader } from "./home/home-header";
import { NextCard } from "./home/next-card";

export const metadata: Metadata = { title: "Início" };

const agendarClass =
  "items-center gap-2 rounded-full bg-highlight px-5 text-sm font-extrabold text-highlight-foreground shadow-lg transition-colors hover:bg-highlight/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-5"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function Stat({
  id,
  value,
  label,
}: {
  id: string;
  value: string;
  label: string;
}) {
  return (
    <div
      data-testid={`stat-${id}`}
      className="grid rounded-2xl border bg-card px-3 py-2.5 shadow-xs"
    >
      <span className="font-heading text-xl font-extrabold">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export default async function PanelHomePage() {
  // Pages render in parallel with their layout, so each page checks again.
  const session = await requireAdmin();
  const now = new Date();
  const [home, branding, pendingLinks] = await Promise.all([
    getPanelHome(session.clinicId, now),
    getClinicBranding(session.clinicId),
    listPendingLinks(session.clinicId),
  ]);
  const { today, summary, next, nextDayFirst, alerts } = home;

  const firstName = session.user.name.trim().split(/\s+/)[0] ?? "";
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: today.zone,
    weekday: "long",
    day: "numeric",
    month: "long",
  })
    .format(now)
    .replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="grid max-w-3xl gap-5 pb-24 md:pb-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <HomeHeader
            greeting={greeting(now, today.zone)}
            firstName={firstName}
            dateLabel={dateLabel}
            photoId={branding?.ownerPhotoMediaId ?? null}
            alerts={alerts}
            alertsHref={
              pendingLinks.length > 0 ? ("#avisos" as Route) : "/admin/agenda"
            }
          />
        </div>
        {/* Computer: a normal button at the top. */}
        <Link
          href="/admin/agenda/novo"
          className={`hidden min-h-11 md:inline-flex ${agendarClass}`}
        >
          <PlusIcon />
          Agendar
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat id="hoje" value={String(summary.count)} label="hoje" />
        <Stat id="site" value={String(summary.online)} label="pelo site" />
        {summary.previsto ? (
          <Stat
            id="previsto"
            value={`${formatCents(summary.previsto.cents)}${summary.previsto.partial ? "+" : ""}`}
            label="previsto"
          />
        ) : null}
      </div>

      <NextCard
        next={next}
        nextDayFirst={nextDayFirst}
        now={now}
        zone={today.zone}
      />

      <section aria-labelledby="hoje-titulo" className="grid gap-2">
        <div className="flex items-center justify-between">
          <h2 id="hoje-titulo" className="font-heading text-base font-bold">
            Hoje
          </h2>
          <Link
            href="/admin/agenda"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-brand underline-offset-4 hover:underline dark:text-foreground"
          >
            Ver agenda
          </Link>
        </div>
        {today.items.length > 0 ? (
          <DayList
            items={today.items}
            now={now}
            highlightId={next?.id ?? null}
            zone={today.zone}
          />
        ) : (
          <p className="rounded-2xl border border-dashed bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            {today.closed ? "Fechado hoje." : "Nenhum atendimento hoje."}
          </p>
        )}
      </section>

      {pendingLinks.length > 0 ? (
        <section id="avisos" aria-label="Avisos" className="grid gap-3">
          {pendingLinks.map((link) => (
            <PendingLinkNotice key={link.provisionalId} link={link} />
          ))}
        </section>
      ) : null}

      {/* Phone: floats above the bottom bar (the page keeps room under the list). */}
      <Link
        href="/admin/agenda/novo"
        className={`fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 inline-flex min-h-12 md:hidden ${agendarClass}`}
      >
        <PlusIcon />
        Agendar
      </Link>
    </div>
  );
}
