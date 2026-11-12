import Link from "next/link";

import { AuthShell, authLinkClass } from "./auth-shell";

// Shared frame of the privacy policy and the terms of use: same shell as the
// sign-in pages, readable on a 360 px phone.

export const LEGAL_UPDATED_AT = "12 de novembro de 2026";

// The channel for privacy requests and questions about the terms.
export const LEGAL_CONTACT_URL = "https://wa.me/5547991037244";
export const LEGAL_CONTACT_LABEL = "WhatsApp (47) 99103-7244";

export function LegalPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <AuthShell>
      <article className="grid gap-6 text-sm leading-relaxed text-foreground [&_li]:ml-5 [&_li]:list-disc [&_ul]:grid [&_ul]:gap-1">
        <header className="grid gap-1">
          <h1 className="font-heading text-3xl font-bold">{title}</h1>
          <p className="text-muted-foreground">
            Atualizada em {LEGAL_UPDATED_AT}.
          </p>
        </header>
        {children}
        <footer className="flex flex-wrap gap-x-4 gap-y-2 border-t pt-4">
          <Link href="/" className={authLinkClass}>
            Página inicial
          </Link>
          <Link href="/privacidade" className={authLinkClass}>
            Privacidade
          </Link>
          <Link href="/termos" className={authLinkClass}>
            Termos de uso
          </Link>
        </footer>
      </article>
    </AuthShell>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-2">
      <h2 className="font-heading text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function ContactLink() {
  return (
    <a
      href={LEGAL_CONTACT_URL}
      className={authLinkClass}
      target="_blank"
      rel="noopener noreferrer"
    >
      {LEGAL_CONTACT_LABEL}
    </a>
  );
}
