import Link from "next/link";

import { BrandImage } from "@/components/brand-image";
import { ThemeToggle } from "@/components/theme-toggle";
import { getTheme } from "@/lib/theme-server";

// The frame of the Zemana pages that are not a clinic: a small header with
// the brand and the theme switch, and one column made for a 360 px phone.
export async function AuthShell({ children }: { children: React.ReactNode }) {
  const theme = await getTheme();
  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-3">
          <Link href="/" aria-label="Zemana, página inicial">
            <BrandImage kind="horizontal" size={120} />
          </Link>
          <ThemeToggle
            initialTheme={theme}
            className="border-border text-foreground hover:bg-accent focus-visible:ring-ring focus-visible:ring-offset-background"
          />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8">
        {children}
      </main>
    </div>
  );
}

export const authLinkClass =
  "font-semibold text-primary underline underline-offset-4";
