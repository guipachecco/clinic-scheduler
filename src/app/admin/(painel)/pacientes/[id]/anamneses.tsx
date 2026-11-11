import type { Route } from "next";
import Link from "next/link";

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
                className="block rounded-xl border bg-card p-3 hover:bg-muted/50"
              >
                {formatDate(item.takenOn)} · {STATUS_LABELS[item.status]} ·
                atualizada em {updatedOn.format(item.updatedAt)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
