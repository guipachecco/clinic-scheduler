import { BrandImage } from "@/components/brand-image";
import { ThemeToggle } from "@/components/theme-toggle";
import { getTheme } from "@/lib/theme-server";
import { requireAdmin } from "@/modules/auth/session";

import { PanelNav } from "./panel-nav";
import { SignOutButton } from "./sign-out-button";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();
  const theme = await getTheme();

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 bg-brand px-4 py-3 text-brand-foreground md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:items-stretch md:gap-y-6 md:px-4 md:py-6">
        <div className="flex items-center gap-3">
          <BrandImage kind="symbol" alt="" size={48} className="size-12" />
          <div className="leading-tight">
            <p className="font-heading text-xl font-bold tracking-wide">
              GRAIS
            </p>
            <p className="text-[10px] font-medium tracking-[0.2em]">
              SAÚDE INTEGRATIVA
            </p>
          </div>
        </div>
        <div className="col-span-2 row-start-2 w-full min-w-0 md:col-span-1 md:row-start-auto md:min-h-0 md:w-auto md:overflow-y-auto">
          <PanelNav
            items={[
              { href: "/admin", label: "Início" },
              { href: "/admin/pacientes", label: "Pacientes" },
            ]}
          />
        </div>
        <div className="col-start-2 row-start-1 ml-auto flex min-w-0 items-center gap-3 md:mt-auto md:ml-0 md:flex-col md:items-stretch">
          <span className="hidden truncate text-sm text-white/80 md:block">
            {session.user.name}
          </span>
          <div className="flex items-center gap-2">
            <ThemeToggle initialTheme={theme} />
            <SignOutButton />
          </div>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-5xl min-w-0 flex-1 bg-background px-4 py-8 md:px-8">
        {children}
      </main>
    </div>
  );
}
