import { DateTime } from "luxon";

import type {
  CalendarEvent,
  RequestedItem,
} from "@/modules/appointments/appointments";
import { CLINIC_TIME_ZONE } from "@/modules/schedule/time";

import { RequestedList, type RequestedListItem } from "./requested-list";

// The summary beside the calendar: requests waiting for confirmation and
// today's active appointments. Rendered from the page's server data.

function local(iso: string) {
  return DateTime.fromISO(iso, { zone: CLINIC_TIME_ZONE }).setLocale("pt-BR");
}

// "terça-feira" -> "terça"; "sábado" stays.
function weekdayName(date: DateTime) {
  return date.toFormat("cccc").replace("-feira", "");
}

// "hoje, 14:00", "amanhã, 09:30", "sexta, 10:00" within the next days, or
// "sexta, 13/11, 10:00" further on.
function whenLabel(iso: string, now: DateTime) {
  const start = local(iso);
  const time = start.toFormat("HH:mm");
  // Rounded: a DST day is 23 or 25 hours long.
  const days = Math.round(
    start.startOf("day").diff(now.startOf("day"), "days").days,
  );
  if (days < 1) return `hoje, ${time}`;
  if (days < 2) return `amanhã, ${time}`;
  if (days < 7) return `${weekdayName(start)}, ${time}`;
  return `${weekdayName(start)}, ${start.toFormat("dd/MM")}, ${time}`;
}

function minutesOf(event: CalendarEvent) {
  return Math.round((Date.parse(event.end) - Date.parse(event.start)) / 60_000);
}

// The requested rows with their "quando" detail, shared with the phone agenda.
export function toRequestedListItems(
  requested: RequestedItem[],
  now: Date,
): RequestedListItem[] {
  const localNow = DateTime.fromJSDate(now, {
    zone: CLINIC_TIME_ZONE,
  }).setLocale("pt-BR");
  return requested.map((event) => ({
    id: event.id,
    patientLabel: event.patientLabel,
    detail: `${event.serviceLabel} · ${whenLabel(event.start, localNow)}`,
    requiresApproval: event.requiresApproval,
  }));
}

const cardClass = "grid gap-3.5 rounded-2xl border bg-card p-5";

export function AgendaSidePanel({
  now,
  requested,
  today,
}: {
  now: Date;
  requested: RequestedItem[];
  today: CalendarEvent[];
}) {
  const localNow = DateTime.fromJSDate(now, {
    zone: CLINIC_TIME_ZONE,
  }).setLocale("pt-BR");

  return (
    <aside aria-label="Resumo da agenda" className="grid content-start gap-4">
      <section aria-labelledby="agenda-requested" className={cardClass}>
        <div className="flex items-center justify-between gap-2">
          <h2
            id="agenda-requested"
            className="text-[17px] leading-tight font-bold"
          >
            Aguardando confirmação
          </h2>
          {requested.length > 0 ? (
            <span className="inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-full bg-highlight px-2 text-[13px] font-bold text-highlight-foreground">
              {requested.length}
            </span>
          ) : null}
        </div>
        <RequestedList items={toRequestedListItems(requested, now)} />
      </section>

      <section aria-labelledby="agenda-today" className={cardClass}>
        <h2 id="agenda-today" className="text-[17px] leading-tight font-bold">
          Hoje, {weekdayName(localNow)}
        </h2>
        {today.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum atendimento hoje.
          </p>
        ) : (
          <ul className="grid gap-3">
            {today.map((event) => {
              const pending = event.status === "requested";
              return (
                <li key={event.id} className="flex items-baseline gap-3">
                  <span className="w-11 shrink-0 font-bold text-primary tabular-nums">
                    {local(event.start).toFormat("HH:mm")}
                  </span>
                  <span className="grid min-w-0">
                    <span className="truncate font-semibold">
                      {event.patientLabel}
                    </span>
                    <span
                      className={
                        pending
                          ? "text-sm text-status-requested-foreground"
                          : "text-sm text-muted-foreground"
                      }
                    >
                      {event.serviceLabel} ·{" "}
                      {pending ? "aguardando" : `${minutesOf(event)} min`}
                      {event.online ? " · Online" : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}
