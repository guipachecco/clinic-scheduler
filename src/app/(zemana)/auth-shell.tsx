import Link from "next/link";

import { BrandImage } from "@/components/brand-image";
import { ThemeToggle } from "@/components/theme-toggle";
import { getTheme } from "@/lib/theme-server";
import { cn } from "@/lib/utils";

// The frame of the Zemana pages that are not a clinic: a small header with
// the brand and the theme switch, and one column made for a 360 px phone.
// With `art` (the sign-in pages), wide screens split in two: the decorated
// panel on the left and the same column, centred, on the right.
export async function AuthShell({
  children,
  art,
}: {
  children: React.ReactNode;
  art?: React.ReactNode;
}) {
  const theme = await getTheme();
  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="border-b bg-card">
        <div
          className={cn(
            "mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-3",
            art && "lg:max-w-none lg:px-10",
          )}
        >
          <Link href="/" aria-label="Zemana, página inicial">
            <BrandImage kind="horizontal" size={120} />
          </Link>
          <ThemeToggle
            initialTheme={theme}
            className="border-border text-foreground hover:bg-accent focus-visible:ring-ring focus-visible:ring-offset-background"
          />
        </div>
      </header>
      <div
        className={cn(
          "flex flex-1 flex-col",
          art && "lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]",
        )}
      >
        {art}
        <main
          className={cn(
            "mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-8",
            art && "lg:justify-center lg:py-16",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export const authLinkClass =
  "font-semibold text-primary underline underline-offset-4";
