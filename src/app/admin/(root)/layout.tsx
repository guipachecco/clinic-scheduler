import { BrandImage } from "@/components/brand-image";
import { ThemeToggle } from "@/components/theme-toggle";
import { getTheme } from "@/lib/theme-server";
import { requireRoot } from "@/modules/auth/session";

import { SignOutButton } from "../(painel)/sign-out-button";
import { RootNav } from "./root-nav";

// Pages outside any clinic, only for root: the clinic list, what each clinic
// has (resources) and how the system is doing (monitoring).
export default async function RootAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRoot();
  const theme = await getTheme();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 bg-brand px-4 py-3 text-brand-foreground md:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <BrandImage kind="horizontal" size={140} onBrand />
          <p className="hidden font-heading text-lg font-bold tracking-wide sm:block">
            Administração geral
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle initialTheme={theme} />
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 content-start gap-6 bg-background px-4 py-6 md:px-8 md:py-8">
        <RootNav />
        {children}
      </main>
    </div>
  );
}
