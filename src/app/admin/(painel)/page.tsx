import type { Metadata } from "next";

import { requireAdmin } from "@/modules/auth/session";

export const metadata: Metadata = { title: "Início" };

export default async function PanelHomePage() {
  // Pages render in parallel with their layout, so each page checks again.
  const session = await requireAdmin();

  return (
    <div className="grid max-w-2xl gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">
        Olá, {session.user.name}
      </h1>
      <p className="text-muted-foreground">
        O acesso ao painel está protegido por senha e verificação em duas
        etapas. Pacientes e serviços já podem ser cadastrados pelo menu; agenda
        e conteúdo do site chegam nas próximas etapas.
      </p>
    </div>
  );
}
