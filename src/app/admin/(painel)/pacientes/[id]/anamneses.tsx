import type { Route } from "next";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { listAnamneses } from "@/modules/anamnesis/anamnesis";
import { requireAdmin } from "@/modules/auth/session";

import { formatDate } from "../format";

import { NewAnamnesisButton } from "./anamneses/new-anamnesis-button";
import { RefreshWhenChanged } from "./anamneses/refresh-when-changed";

const STATUS_LABELS = {
  in_progress: "Em andamento",
  completed: "Concluída",
} as const;

const updatedOn = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// The patient's anamneses, newest first. Renders nothing when the clinic has
// no anamnesis.
export async function Anamneses({ patientId }: { patientId: string }) {
  const { clinicId } = await requireAdmin();
  const items = await listAnamneses(clinicId, patientId);
  if (!items) return null;

  return (
    <section aria-labelledby="anamneses" className="grid gap-4">
      <RefreshWhenChanged patientId={patientId} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="anamneses" className="font-heading text-lg font-semibold">
          Anamneses
        </h2>
        <NewAnamnesisButton patientId={patientId} />
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma anamnese ainda.</p>
      ) : (
        <ul aria-labelledby="anamneses" className="grid gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={
                  `/admin/pacientes/${patientId}/anamneses/${item.id}` as Route
                }
                className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border bg-card px-4 py-3 hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="font-heading text-base font-bold">
                  {formatDate(item.takenOn)}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-bold",
                    item.status === "completed"
                      ? "bg-primary text-primary-foreground"
                      : "bg-brand-accent text-brand-accent-foreground",
                  )}
                >
                  {STATUS_LABELS[item.status]}
                </span>
                <span className="text-sm text-muted-foreground">
                  atualizada em {updatedOn.format(item.updatedAt)}
                </span>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="ml-auto size-5 shrink-0 text-muted-foreground"
                >
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
