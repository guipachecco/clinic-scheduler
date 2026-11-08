import Link from "next/link";

import { startsIn, type DayItem } from "@/modules/dashboard/day";
import { CLINIC_TIME_ZONE } from "@/modules/schedule/time";

const actionClass =
  "inline-flex min-h-11 items-center rounded-full bg-muted px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

// "Próxima": the next appointment of today with shortcuts, or the first one of
// the coming days when today has no more.
export function NextCard({
  next,
  nextDayFirst,
  now,
  zone = CLINIC_TIME_ZONE,
}: {
  next: DayItem | null;
  nextDayFirst: DayItem | null;
  now: Date;
  zone?: string;
}) {
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const day = new Intl.DateTimeFormat("pt-BR", {
    timeZone: zone,
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (!next) {
    return (
      <section
        aria-label="Próxima"
        className="grid gap-1 rounded-2xl border bg-card p-4 shadow-sm"
      >
        <p className="font-semibold">Sem mais atendimentos hoje</p>
        {nextDayFirst ? (
          <p className="text-sm text-muted-foreground">
            Próximo: {day.format(nextDayFirst.startsAt)} às{" "}
            {time.format(nextDayFirst.startsAt)}, {nextDayFirst.patientName} (
            {nextDayFirst.serviceName})
          </p>
        ) : null}
      </section>
    );
  }

  const digits = next.patientPhone?.replace(/\D/g, "") ?? "";
  return (
    <section
      aria-label="Próxima"
      className="grid gap-3 rounded-2xl border-2 border-brand bg-card p-4 shadow-md"
    >
      <p className="text-xs font-bold tracking-wide text-brand uppercase dark:text-foreground">
        Próxima · {startsIn(next.startsAt, now)}
      </p>
      <div className="flex items-center gap-3">
        <span className="font-heading text-3xl font-extrabold tabular-nums">
          {time.format(next.startsAt)}
        </span>
        <div className="grid min-w-0">
          <span className="truncate font-semibold">{next.patientName}</span>
          <span className="truncate text-sm text-muted-foreground">
            {next.serviceName} · {next.durationMinutes} min
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {digits ? (
          <a
            href={`https://wa.me/${digits}`}
            target="_blank"
            rel="noopener noreferrer"
            className={actionClass}
          >
            WhatsApp
          </a>
        ) : null}
        <Link
          href={`/admin/pacientes/${next.patientId}`}
          className={actionClass}
        >
          Ver ficha
        </Link>
      </div>
    </section>
  );
}
