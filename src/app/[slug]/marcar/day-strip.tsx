"use client";

import { DateTime } from "luxon";

import { cn } from "@/lib/utils";

import { Icon } from "../icons";

export const STRIP_SPAN = 7;

const local = (date: string) => DateTime.fromISO(date).setLocale("pt-BR");

export function dayLabel(date: string) {
  return local(date).toFormat("cccc, d 'de' LLLL");
}

// The dates (yyyy-mm-dd) the strip shows from `start`.
export function stripDays(start: string) {
  const first = local(start);
  return Array.from({ length: STRIP_SPAN }, (_, index) =>
    first.plus({ days: index }).toFormat("yyyy-MM-dd"),
  );
}

const arrow =
  "flex size-10 items-center justify-center rounded-full border bg-card outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-40";

// A week of days with arrows and the month. Days with no free time (or past
// the clinic's booking window) are dimmed and disabled.
export function DayStrip({
  start,
  today,
  lastDay,
  open,
  selected,
  disabled,
  onShift,
  onDay,
}: {
  start: string;
  today: string;
  lastDay: string;
  open: Set<string>;
  selected: string | null;
  disabled: boolean;
  onShift: (delta: number) => void;
  onDay: (date: string) => void;
}) {
  const days = stripDays(start);
  const first = local(days[0]!);
  const last = local(days[STRIP_SPAN - 1]!);
  const month =
    first.month === last.month
      ? first.toFormat("LLLL 'de' yyyy")
      : `${first.toFormat("LLLL")} / ${last.toFormat("LLLL 'de' yyyy")}`;

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Dias anteriores"
          disabled={start <= today || disabled}
          onClick={() => onShift(-STRIP_SPAN)}
          className={arrow}
        >
          <Icon name="chevronLeft" className="size-5" />
        </button>
        <p
          data-testid="strip-month"
          aria-live="polite"
          className="font-heading font-semibold capitalize"
        >
          {month}
        </p>
        <button
          type="button"
          aria-label="Próximos dias"
          disabled={days[STRIP_SPAN - 1]! >= lastDay || disabled}
          onClick={() => onShift(STRIP_SPAN)}
          className={arrow}
        >
          <Icon name="chevronRight" className="size-5" />
        </button>
      </div>
      <div
        role="group"
        aria-label="Dias"
        aria-busy={disabled}
        className="grid grid-cols-7 gap-1"
      >
        {days.map((date) => {
          const free = open.has(date) && date >= today && date <= lastDay;
          const chosen = date === selected;
          return (
            <button
              key={date}
              type="button"
              disabled={!free || disabled}
              aria-label={dayLabel(date)}
              aria-pressed={chosen}
              onClick={() => onDay(date)}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-xl border text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                chosen
                  ? "border-primary bg-primary text-primary-foreground"
                  : free
                    ? "bg-card hover:border-primary"
                    : "border-transparent bg-transparent text-muted-foreground/50",
              )}
            >
              <span aria-hidden="true" className="text-[11px] uppercase">
                {local(date).toFormat("ccc").replace(".", "")}
              </span>
              <span aria-hidden="true" className="text-base font-semibold">
                {Number(date.slice(8))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
