import type { Metadata } from "next";
import { connection } from "next/server";

import "@fontsource-variable/archivo";
import "@fontsource-variable/figtree";
import "./globals.css";

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

  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
