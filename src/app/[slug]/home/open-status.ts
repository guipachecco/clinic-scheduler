import { DateTime } from "luxon";

import type { DayHours } from "@/modules/schedule/schedule";

export const WEEKDAY_NAMES = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

// "Aberto agora" / "Fechado" line of the clinic page, from the weekly hours
// (weekday 0 = Sunday) read in the clinic's own time zone.
export function openStatus(
  hours: DayHours[],
  zone: string,
  now: Date,
): { open: boolean; label: string } {
  const local = DateTime.fromJSDate(now, { zone });
  const today = local.weekday % 7;
  const time = local.toFormat("HH:mm");
  const intervalsOf = (weekday: number) =>
    [...(hours.find((day) => day.weekday === weekday)?.intervals ?? [])].sort(
      (a, b) => a.start.localeCompare(b.start),
    );

  const todays = intervalsOf(today);
  const current = todays.find((i) => i.start <= time && time < i.end);
  if (current) {
    return { open: true, label: `Aberto agora · até ${current.end}` };
  }
  const later = todays.find((i) => i.start > time);
  if (later) {
    return { open: false, label: `Fechado · abre hoje às ${later.start}` };
  }
  for (let ahead = 1; ahead <= 7; ahead++) {
    const weekday = (today + ahead) % 7;
    const first = intervalsOf(weekday)[0];
    if (!first) continue;
    const when = ahead === 1 ? "amanhã" : WEEKDAY_NAMES[weekday];
    return { open: false, label: `Fechado · abre ${when} às ${first.start}` };
  }
  return { open: false, label: "Fechado hoje" };
}
