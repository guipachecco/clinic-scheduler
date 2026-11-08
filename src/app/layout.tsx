import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { connection } from "next/server";

import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/figtree";
import "./globals.css";

import { getTheme } from "@/lib/theme-server";
import { cn } from "@/lib/utils";

import { SITE_URL } from "./site-url";

export const metadata: Metadata = {
  // Makes the shared image (src/app/opengraph-image.tsx) an absolute URL.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Agendamentos",
    template: "%s | Agendamentos",
  },
  description: "Agendamento online de serviços da clínica.",
};

// Lets fixed bars use env(safe-area-inset-*) on notched phones.
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Pages render per request so that each one carries the CSP nonce created
  // in src/proxy.ts.
  await connection();
  const theme = await getTheme();

  return (
    <html
      lang="pt-BR"
      className={cn("h-full antialiased", theme === "dark" && "dark")}
    >
      <body className="flex min-h-full flex-col">
        {children}
        {/* Page views without cookies (Vercel Web Analytics). Only on Vercel
            (VERCEL=1): its script lives at /_vercel/insights, which a local
            build does not serve. It is added by a nonced script, so
            'strict-dynamic' lets it run. */}
        {process.env.VERCEL === "1" && <Analytics />}
      </body>
    </html>
  );
}
