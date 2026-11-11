import type { Metadata } from "next";
import Link from "next/link";

import { BrandImage } from "@/components/brand-image";
import { ThemeToggle } from "@/components/theme-toggle";
import { getTheme } from "@/lib/theme-server";
import { getClinicLook } from "@/modules/clinic-page/public";
import {
  findClinic,
  getClientUser,
  requireClinic,
} from "@/modules/clients/session";

import "../page-fonts";

import { BottomNav } from "./bottom-nav";
import { PageTheme } from "./page-theme";
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

// The clinic link (/<slug>) that the owner shares: a compact header with the
// clinic's logo (the Zemana mark without one) and name, one column made for a
// 360 px phone and a bottom navigation. Unknown, deactivated and reserved
// names are not found (src/modules/clients/session.ts). The look the owner
// published (color, buttons, heading font) applies only inside the
// clinic-page container.
export default async function ClientLayout({
  children,
  params,
}: LayoutProps<"/[slug]">) {
  const clinic = await requireClinic((await params).slug);
  const theme = await getTheme();
  const user = await getClientUser();
  // Only the look and the logo: the full page is read by the home page alone.
  const look = (await getClinicLook(clinic.slug)) ?? {
    theme: {},
    hasLogo: false,
    logoVersion: null,
  };

  return (
    <div className="clinic-page flex flex-1 flex-col bg-background">
      <PageTheme theme={look.theme} scopeClass="clinic-page" />
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-3">
          <Link
            href={`/${clinic.slug}`}
            className="flex min-w-0 items-center gap-2.5"
          >
            {look.hasLogo ? (
              // eslint-disable-next-line @next/next/no-img-element -- served by the /logo route handler
              <img
                src={`/${clinic.slug}/logo${look.logoVersion ? `?v=${look.logoVersion}` : ""}`}
                alt=""
                height={28}
                className="h-7 w-auto max-w-28 shrink-0 object-contain"
              />
            ) : (
              <BrandImage kind="symbol" size={28} className="shrink-0" />
            )}
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
      {/* Bottom padding keeps the content clear of the fixed navigation. */}
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-6 pb-28">
        {children}
      </main>
      <BottomNav slug={clinic.slug} signedIn={user !== null} />
    </div>
  );
}
