import type { Metadata } from "next";

import { requireAdmin } from "@/modules/auth/session";
import { listPendingLinks } from "@/modules/patients/links";

import { PendingLinkNotice } from "./pacientes/pending-link-notice";

export const metadata: Metadata = { title: "Início" };

export default async function PanelHomePage() {
  // Pages render in parallel with their layout, so each page checks again.
  const session = await requireAdmin();
  const pendingLinks = await listPendingLinks(session.clinicId);

  return (
    <div className="grid max-w-2xl gap-6">
      <div className="grid gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Olá, {session.user.name}
        </h1>
        <p className="text-muted-foreground">
          O acesso ao painel está protegido por senha e verificação em duas
          etapas. Pela agenda você vê e remarca os atendimentos; pacientes,
          serviços e expediente ficam no menu. O conteúdo do site chega na
          próxima etapa.
        </p>
      </div>
      {pendingLinks.length > 0 ? (
        <div className="grid gap-3">
          {pendingLinks.map((link) => (
            <PendingLinkNotice key={link.provisionalId} link={link} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
