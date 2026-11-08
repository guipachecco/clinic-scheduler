import type { Route } from "next";
import Link from "next/link";
import { DateTime } from "luxon";

import { cn } from "@/lib/utils";

const arrowClass =
  "inline-flex size-11 items-center justify-center rounded-full text-brand transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:text-foreground";

function Arrow({ direction }: { direction: "prev" | "next" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-5"
    >
      <path d={direction === "prev" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

const href = (date: string) => `/admin/agenda?dia=${date}` as Route;

// Seven days from the Monday of the chosen day's week. The arrows move the
// chosen day by a week; days in `marks` get a yellow dot.
export function DayStrip({
  date,
  zone,
  marks,
}: {
  date: string;
  zone: string;
  marks: string[];
}) {
  const chosen = DateTime.fromISO(date, { zone }).setLocale("pt-BR");
  const monday = chosen.startOf("week");
  const days = Array.from({ length: 7 }, (_, i) => monday.plus({ days: i }));
  const month = chosen.toFormat("LLLL 'de' yyyy");

  return (
    <nav aria-label="Dias da semana" className="grid gap-1">
      <div className="flex items-center justify-between">
        <Link
          href={href(chosen.minus({ days: 7 }).toISODate()!)}
          aria-label="Semana anterior"
          className={arrowClass}
        >
          <Arrow direction="prev" />
        </Link>
        <p className="font-heading text-base font-bold capitalize">{month}</p>
        <Link
          href={href(chosen.plus({ days: 7 }).toISODate()!)}
          aria-label="Próxima semana"
          className={arrowClass}
        >
          <Arrow direction="next" />
        </Link>
      </div>
      <ul className="grid grid-cols-7 gap-0.5">
        {days.map((day) => {
          const iso = day.toISODate()!;
          const selected = iso === date;
          const marked = marks.includes(iso);
          return (
            <li key={iso}>
              <Link
                href={href(iso)}
                aria-current={selected ? "date" : undefined}
                aria-label={day.toFormat("cccc, d 'de' LLLL")}
                data-has-appointments={marked ? "true" : undefined}
                className={cn(
                  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  selected
                    ? "bg-brand text-brand-foreground"
                    : "bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                <span className="capitalize">{day.toFormat("ccc")}</span>
                <span
                  className={cn(
                    "text-base font-extrabold",
                    !selected && "text-foreground",
                  )}
                >
                  {day.day}
                </span>
                {marked ? (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-1 size-1.5 rounded-full bg-highlight"
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
