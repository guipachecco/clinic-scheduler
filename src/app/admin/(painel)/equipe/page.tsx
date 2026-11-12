import type { Metadata } from "next";

import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/modules/auth/session";
import { listProfessionals } from "@/modules/professionals/professionals";

import { ProfessionalForm } from "./professional-form";

export const metadata: Metadata = { title: "Equipe" };

function Badge({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "primary";
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-bold",
        tone === "primary"
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

// The clinic's team: each professional has her own agenda. With one
// professional only, the agenda looks exactly as before.
export default async function TeamPage() {
  const { clinicId } = await requireAdmin();
  const team = await listProfessionals(clinicId);
  const active = team.filter((professional) => professional.isActive).length;

  return (
    <div className="grid max-w-3xl gap-8">
      <PageHeader
        title="Equipe"
        eyebrow={
          active === 1
            ? "1 profissional ativa"
            : `${active} profissionais ativas`
        }
      />

      <p className="text-sm text-muted-foreground">
        Cada profissional tem a própria agenda: duas profissionais podem atender
        no mesmo horário. Com mais de uma ativa, a agenda pergunta com quem é
        cada atendimento.
      </p>

      <details className="rounded-2xl border bg-card">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-2xl px-4 text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <Icon name="plus" className="size-4" />
          Nova profissional
        </summary>
        <div className="border-t p-4">
          <ProfessionalForm mode="create" />
        </div>
      </details>

      <ul className="grid gap-3">
        {team.map((professional) => (
          <li
            key={professional.id}
            className={cn(
              "grid gap-2 rounded-2xl border bg-card p-4",
              professional.isActive ? null : "opacity-70",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-lg font-bold break-words">
                {professional.name}
              </h2>
              {professional.isDefault ? (
                <Badge tone="primary">Recebe os agendamentos online</Badge>
              ) : null}
              {professional.isActive ? null : <Badge>Inativa</Badge>}
            </div>
            {professional.registration ? (
              <p className="text-sm text-muted-foreground">
                {professional.registration}
              </p>
            ) : null}
            <details className="group">
              <summary className="flex min-h-9 w-fit cursor-pointer list-none items-center rounded-md text-sm font-semibold text-muted-foreground outline-none group-open:text-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                Editar
                <span className="sr-only">: {professional.name}</span>
              </summary>
              <div className="mt-2 border-t pt-4">
                <ProfessionalForm
                  mode="edit"
                  id={professional.id}
                  defaults={{
                    name: professional.name,
                    registration: professional.registration ?? "",
                    sortOrder: String(professional.sortOrder),
                    isActive: professional.isActive,
                  }}
                />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
