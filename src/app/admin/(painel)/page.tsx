import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { requireAdmin } from "@/modules/auth/session";

export const metadata: Metadata = { title: "Início" };

export default async function PanelHomePage() {
  // Pages render in parallel with their layout, so each page checks again.
  const session = await requireAdmin();

  return (
    <div className="grid max-w-2xl gap-6">
      <div className="grid gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Olá, {session.user.name}
        </h1>
        <p className="text-muted-foreground">
          Pacientes já podem ser cadastrados pelo menu. Agenda, serviços e
          conteúdo do site chegam nas próximas etapas.
        </p>
      </div>
      {!session.user.twoFactorEnabled && (
        <section
          aria-labelledby="two-factor-recommendation"
          className="grid gap-3 rounded-2xl border bg-card p-5"
        >
          <h2 id="two-factor-recommendation" className="text-lg font-semibold">
            Proteja sua conta
          </h2>
          <p className="text-muted-foreground">
            O painel guarda dados de pacientes. Com a verificação em duas
            etapas, cada acesso também pede um código do seu celular, e uma
            senha vazada sozinha não abre o painel.
          </p>
          <div>
            <Link
              href="/admin/configurar-2fa"
              className={buttonVariants({ variant: "default" })}
            >
              Ativar verificação em duas etapas
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
