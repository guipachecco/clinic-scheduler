import type { Metadata } from "next";

import { PaletteStyle } from "@/components/palette-style";
import { ThemeToggle } from "@/components/theme-toggle";
import { getTheme } from "@/lib/theme-server";
import { NEUTRAL_PALETTE_ID, PALETTES } from "@/modules/branding/palettes";

export const metadata: Metadata = { icons: { icon: "/painel-icone.svg" } };

// Sign-in is shown before any clinic is known, so it wears the neutral identity.
export default async function AccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = await getTheme();

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center bg-brand px-4 py-10">
      <PaletteStyle palette={PALETTES[NEUTRAL_PALETTE_ID]} />
      <ThemeToggle initialTheme={theme} className="absolute top-4 right-4" />
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <p className="font-heading text-4xl font-bold tracking-wide text-brand-foreground">
          Painel
        </p>
        <div className="w-full">{children}</div>
      </div>
    </main>
  );
}
