import Link from "next/link";

import { cn } from "@/lib/utils";
import type { DayItem } from "@/modules/dashboard/day";
import { CLINIC_TIME_ZONE } from "@/modules/schedule/time";

import { StatusBadge } from "../agenda/status-badge";

// The day wording for each status.
const LABELS: Record<DayItem["status"], string> = {
  requested: "Pedido",
  confirmed: "Confirmado",
  completed: "Concluído",
  no_show: "Faltou",
  cancelled: "Desmarcado",
};

// The ordered list of a day's appointments, shared by Início and the phone
// agenda. Each row opens the appointment; cancelled ones are dimmed.
export function DayList({
  items,
  highlightId = null,
  zone = CLINIC_TIME_ZONE,
  label = "Atendimentos de hoje",
}: {
  items: DayItem[];
  // Kept for callers that already pass it; times are shown in the clinic zone.
  now?: Date;
  highlightId?: string | null;
  // Clinic time zone for the times shown.
  zone?: string;
  label?: string;
}) {
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return (
    <ol aria-label={label} className="grid gap-2">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/admin/agenda/${item.id}`}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-xl border bg-card px-3 py-2.5 shadow-xs transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              item.id === highlightId && "border-2 border-brand",
              item.status === "cancelled" && "opacity-60",
            )}
          >
            <span className="w-12 shrink-0 text-sm font-extrabold text-brand tabular-nums dark:text-foreground">
              {time.format(item.startsAt)}
            </span>
            <span className="grid min-w-0 flex-1">
              <span
                className={cn(
                  "truncate text-sm font-semibold",
                  item.status === "cancelled" && "line-through",
                )}
              >
                {item.patientName}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {item.serviceName} · {item.durationMinutes} min
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <StatusBadge
                status={item.status}
                label={LABELS[item.status]}
                className="px-2.5 py-0.5 text-xs"
              />
              {item.online ? (
                <span className="rounded-full bg-highlight px-2 py-0.5 text-[11px] font-bold text-highlight-foreground">
                  Site
                </span>
              ) : null}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
