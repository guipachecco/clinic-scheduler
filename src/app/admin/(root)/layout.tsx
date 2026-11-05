import type { Metadata } from "next";

import { PaletteStyle } from "@/components/palette-style";
import { ThemeToggle } from "@/components/theme-toggle";
import { getTheme } from "@/lib/theme-server";
import { requireRoot } from "@/modules/auth/session";
import { NEUTRAL_PALETTE_ID, PALETTES } from "@/modules/branding/palettes";

import { SignOutButton } from "../(painel)/sign-out-button";

export const metadata: Metadata = { icons: { icon: "/painel-icone.svg" } };

// Pages outside any clinic, only for root (the clinic list).
export default async function RootAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRoot();
  const theme = await getTheme();

  return (
    <div className="flex flex-1 flex-col">
      <PaletteStyle palette={PALETTES[NEUTRAL_PALETTE_ID]} />
      <header className="flex items-center justify-between gap-3 bg-brand px-4 py-3 text-brand-foreground md:px-8">
        <p className="font-heading text-lg font-bold tracking-wide">
          Administração geral
        </p>
        <div className="flex items-center gap-2">
          <ThemeToggle initialTheme={theme} />
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 bg-background px-4 py-8 md:px-8">
        {children}
      </main>
    </div>
  );
}
