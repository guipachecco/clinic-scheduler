import Link from "next/link";

import { BrandImage } from "@/components/brand-image";
import { ThemeToggle } from "@/components/theme-toggle";
import { getTheme } from "@/lib/theme-server";
import { countRequestedFrom } from "@/modules/appointments/appointments";
import { moduleActive, requireAdmin } from "@/modules/auth/session";
import { getClinicBranding } from "@/modules/branding/branding";
import { vocabulary } from "@/modules/business-type/vocabulary";

import { MobileNav } from "./mobile-nav";
import { PanelNav, type NavItem } from "./panel-nav";
import { SignOutButton } from "./sign-out-button";

// The profile photo, or the initial of whoever is signed in.
function ProfilePhoto({
  photoId,
  initial,
}: {
  photoId: string | null;
  initial: string;
}) {
  return photoId ? (
    // eslint-disable-next-line @next/next/no-img-element -- served by the panel photo route handler
    <img
      src={`/admin/foto/${photoId}`}
      alt=""
      className="size-9 shrink-0 rounded-full bg-brand-muted object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-accent font-bold text-brand-accent-foreground"
    >
      {initial}
    </span>
  );
}

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();
  const [theme, pendingRequests, branding] = await Promise.all([
    getTheme(),
    countRequestedFrom(session.clinicId, new Date()),
    getClinicBranding(session.clinicId),
  ]);
  const photoId = branding?.ownerPhotoMediaId ?? null;
  const initial = session.user.name.trim().charAt(0).toUpperCase();
  const navItems: NavItem[] = [
    { href: "/admin", label: "Início", icon: "home" },
    {
      href: "/admin/agenda",
      label: "Agenda",
      icon: "calendar",
      badge: pendingRequests,
      badgeLabel: "aguardando confirmação",
    },
    {
      href: "/admin/pacientes",
      label: vocabulary(session.clinic.businessType).People,
      icon: "person",
    },
    { href: "/admin/servicos", label: "Serviços", icon: "services" },
    ...(moduleActive(session, "products")
      ? [
          {
            href: "/admin/produtos",
            label: "Produtos",
            icon: "box",
          } as const,
        ]
      : []),
    { href: "/admin/expediente", label: "Expediente", icon: "clock" },
    { href: "/admin/equipe", label: "Equipe", icon: "team" },
    // Optional module: off, it leaves the menu (the routes answer 404).
    ...(moduleActive(session, "finance")
      ? [
          {
            href: "/admin/financeiro",
            label: "Financeiro",
            icon: "money",
          } as const,
        ]
      : []),
    { href: "/admin/pagina", label: "Minha página", icon: "page" },
  ];
  const switchClinic = session.isRoot ? (
    <Link
      href="/admin/clinicas"
      className="text-xs font-medium underline underline-offset-2 max-md:-my-2 max-md:inline-flex max-md:min-h-11 max-md:items-center"
    >
      Trocar de clínica
    </Link>
  ) : null;

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      {/* Phone: compact top bar; the sections live in the bottom bar. */}
      <header className="flex items-center justify-between gap-3 bg-brand px-4 py-2.5 text-brand-foreground md:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <BrandImage kind="symbol" size={32} onBrand />
          <p className="min-w-0 text-sm font-semibold break-words">
            {session.clinic.name}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {switchClinic}
          <Link
            href="/admin/perfil"
            aria-label="Meu perfil"
            className="-m-1 inline-flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ProfilePhoto photoId={photoId} initial={initial} />
          </Link>
        </div>
      </header>
      <aside className="hidden bg-brand px-4 py-6 text-brand-foreground md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:items-stretch md:gap-y-6">
        <div className="grid min-w-0 gap-2">
          <BrandImage kind="horizontal" size={160} onBrand />
          <p className="text-sm font-semibold break-words">
            {session.clinic.name}
          </p>
          {switchClinic}
        </div>
        <div className="w-full min-w-0 md:min-h-0 md:w-auto md:overflow-y-auto">
          <PanelNav items={navItems} />
        </div>
        <div className="flex min-w-0 items-center gap-3 md:mt-auto md:flex-col md:items-stretch">
          <Link
            href="/admin/perfil"
            className="group flex min-w-0 items-center gap-2.5 rounded-xl bg-brand-muted p-3 transition-colors outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
          >
            <ProfilePhoto photoId={photoId} initial={initial} />
            <span className="grid min-w-0 leading-tight">
              <span className="text-sm font-semibold break-words">
                {session.user.name}
              </span>
              <span className="text-xs text-brand-foreground/70 group-hover:text-brand-foreground">
                Meu perfil
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle initialTheme={theme} />
            <SignOutButton />
          </div>
        </div>
      </aside>
      {/* A page marked data-layout="wide" (the agenda) gets more room. */}
      <main className="mx-auto w-full max-w-5xl min-w-0 flex-1 bg-background px-4 pt-6 pb-32 has-[[data-layout=wide]]:max-w-[96rem] md:px-8 md:py-8">
        {children}
      </main>
      <MobileNav
        items={navItems.slice(0, 3)}
        moreItems={navItems.slice(3)}
        agendaBadge={pendingRequests}
        theme={theme}
      />
    </div>
  );
}
