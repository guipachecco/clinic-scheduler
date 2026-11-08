import Link from "next/link";

import { BrandImage } from "@/components/brand-image";

import { TornEdge } from "./ui";

const linkClass =
  "inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4";

// Step 7: a neutral footer (it follows the theme) with the client sign-in.
export function SiteFooter() {
  return (
    <footer className="relative bg-card text-card-foreground">
      <TornEdge className="text-card" />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-12 pb-10 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div className="grid gap-3">
          <BrandImage kind="horizontal" size={140} />
          <p className="text-sm text-muted-foreground">
            Agenda online para profissionais de beleza e saúde.
          </p>
        </div>
        <nav aria-label="Acesso" className="grid gap-1 sm:justify-items-end">
          <Link href="/entrar" className={linkClass}>
            Sou cliente, quero entrar
          </Link>
          <Link href="/admin/entrar" className={linkClass}>
            É profissional? Entre no painel
          </Link>
        </nav>
      </div>
    </footer>
  );
}
