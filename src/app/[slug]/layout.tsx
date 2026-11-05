import type { Metadata } from "next";
import Link from "next/link";

import { BrandImage } from "@/components/brand-image";
import { ThemeToggle } from "@/components/theme-toggle";
import { getTheme } from "@/lib/theme-server";
import { findClinic, requireClinic } from "@/modules/clients/session";

import { clinicName } from "./ui";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const clinic = await findClinic((await params).slug);
  return clinic
    ? {
        title: {
          default: clinicName(clinic),
          template: `%s | ${clinicName(clinic)}`,
        },
      }
    : {};
}

// The clinic link (/<slug>) that the owner shares: the Zemana brand with the
// clinic's name, one column made for a 360 px phone. Unknown, deactivated
// and reserved names are not found (src/modules/clients/session.ts).
export default async function ClientLayout({
  children,
  params,
}: LayoutProps<"/[slug]">) {
  const clinic = await requireClinic((await params).slug);
  const theme = await getTheme();

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-4">
          <Link href={`/${clinic.slug}`} className="grid min-w-0 gap-1.5">
            <BrandImage kind="horizontal" size={128} />
            <span className="truncate font-heading text-lg font-semibold">
              {clinicName(clinic)}
            </span>
          </Link>
          <ThemeToggle
            initialTheme={theme}
            className="border-border text-foreground hover:bg-accent focus-visible:ring-ring focus-visible:ring-offset-background"
          />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
