import type { Metadata } from "next";
import { connection } from "next/server";

import "@fontsource-variable/archivo";
import "@fontsource-variable/figtree";
import "./globals.css";

import { getTheme } from "@/lib/theme-server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: {
    default: "Agendamentos",
    template: "%s | Agendamentos",
  },
  description: "Agendamento online de serviços da clínica.",
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
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
