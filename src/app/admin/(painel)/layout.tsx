import Link from "next/link";

import { BrandImage } from "@/components/brand-image";
import { ThemeToggle } from "@/components/theme-toggle";
import { getTheme } from "@/lib/theme-server";
import { countRequestedFrom } from "@/modules/appointments/appointments";
import { requireAdmin } from "@/modules/auth/session";

import { PanelNav } from "./panel-nav";
import { SignOutButton } from "./sign-out-button";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();
  const [theme, pendingRequests] = await Promise.all([
    getTheme(),
    countRequestedFrom(session.clinicId, new Date()),
  ]);
  const initial = session.user.name.trim().charAt(0).toUpperCase();

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 bg-brand px-4 py-3 text-brand-foreground md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:items-stretch md:gap-y-6 md:px-4 md:py-6">
        <div className="flex min-w-0 items-center gap-3">
          <BrandImage kind="symbol" alt="" size={48} className="size-12" />
          <div className="min-w-0 leading-tight">
            <p className="font-heading text-lg font-bold tracking-wide break-words">
              {session.clinic.name}
            </p>
            {session.isRoot ? (
              <Link
                href="/admin/clinicas"
                className="text-xs font-medium underline underline-offset-2"
              >
                Trocar de clínica
              </Link>
            ) : null}
          </div>
        </div>
        <div className="col-span-2 row-start-2 w-full min-w-0 md:col-span-1 md:row-start-auto md:min-h-0 md:w-auto md:overflow-y-auto">
          <PanelNav
            items={[
              { href: "/admin", label: "Início", icon: "home" },
              {
                href: "/admin/agenda",
                label: "Agenda",
                icon: "calendar",
                badge: pendingRequests,
                badgeLabel: "aguardando confirmação",
              },
              { href: "/admin/pacientes", label: "Pacientes", icon: "person" },
              { href: "/admin/servicos", label: "Serviços", icon: "services" },
              { href: "/admin/expediente", label: "Expediente", icon: "clock" },
              { href: "/admin/financeiro", label: "Financeiro", icon: "money" },
            ]}
          />
        </div>
        <div className="col-start-2 row-start-1 ml-auto flex min-w-0 items-center gap-3 md:mt-auto md:ml-0 md:flex-col md:items-stretch">
          <div className="hidden min-w-0 items-center gap-2.5 rounded-xl bg-brand-muted p-3 md:flex">
            <span
              aria-hidden="true"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-accent font-bold text-brand-accent-foreground"
            >
              {initial}
            </span>
            <span className="min-w-0 text-sm leading-tight font-semibold break-words">
              {session.user.name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle initialTheme={theme} />
            <SignOutButton />
          </div>
        </div>
      </aside>
      {/* A page marked data-layout="wide" (the agenda) gets more room. */}
      <main className="mx-auto w-full max-w-5xl min-w-0 flex-1 bg-background px-4 py-8 has-[[data-layout=wide]]:max-w-[96rem] md:px-8">
        {children}
      </main>
    </div>
  );
}
