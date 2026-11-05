import { DateTime } from "luxon";

import type { DayHours } from "@/modules/schedule/schedule";
import { localToUtc } from "@/modules/schedule/time";

// Pure free-slot calculation for online booking. Client-safe.
//
// A slot is a start time on the clinic's wall clock, every `stepMinutes` from
// the start of each business-hours interval of the day. It is free when:
// - the appointment itself, [start, start + duration), fits inside that
//   interval (buffers may run past it, as in the admin agenda's check);
// - the appointment widened by the service's buffers does not touch any busy
//   interval ('[)' ranges, like appointments_no_overlap). Busy intervals are
//   other appointments already widened by their own buffers, and time blocks
//   (holidays included);
// - it starts at least `minAdvanceMinutes` after `now`;
// - its date is no later than `maxAdvanceDays` days after today (both dates
//   in the clinic zone).

export type BusyInterval = { startsAt: Date; endsAt: Date };

export type FreeSlotsInput = {
  date: string; // yyyy-mm-dd, in the clinic zone
  zone: string;
  hours: DayHours[];
  busy: BusyInterval[];
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  stepMinutes: number;
  now: Date;
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
};

const MINUTE = 60_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const toMinutes = (hhmm: string) =>
  Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

// The clinic-zone date as a Luxon day, or null when it is not a real date.
export function parseLocalDate(date: string, zone: string): DateTime | null {
  if (!DATE_PATTERN.test(date)) return null;
  const day = DateTime.fromISO(date, { zone });
  return day.isValid ? day.startOf("day") : null;
}

// Slot starts as ISO strings with the clinic zone's offset
// (e.g. "2026-11-09T09:00:00.000-03:00"), in order.
export function freeSlots(input: FreeSlotsInput): string[] {
  const day = parseLocalDate(input.date, input.zone);
  if (!day || input.stepMinutes <= 0 || input.durationMinutes <= 0) return [];

  const today = DateTime.fromJSDate(input.now, { zone: input.zone }).startOf(
    "day",
  );
  const lastDay = today.plus({ days: input.maxAdvanceDays });
  if (day < today || day > lastDay) return [];

  // Luxon: 1 = Monday ... 7 = Sunday; the database uses 0 = Sunday.
  const weekday = day.weekday % 7;
  const intervals =
    input.hours.find((entry) => entry.weekday === weekday)?.intervals ?? [];
  const earliest = input.now.getTime() + input.minAdvanceMinutes * MINUTE;

  const slots: string[] = [];
  for (const interval of intervals) {
    const close = toMinutes(interval.end);
    for (
      let start = toMinutes(interval.start);
      start + input.durationMinutes <= close;
      start += input.stepMinutes
    ) {
      const startsAt = localToUtc(input.date, hhmm(start), input.zone);
      if (startsAt.getTime() < earliest) continue;
      const from = startsAt.getTime() - input.bufferBeforeMinutes * MINUTE;
      const until =
        startsAt.getTime() +
        (input.durationMinutes + input.bufferAfterMinutes) * MINUTE;
      const taken = input.busy.some(
        (busy) =>
          from < busy.endsAt.getTime() && until > busy.startsAt.getTime(),
      );
      if (taken) continue;
      const iso = DateTime.fromJSDate(startsAt, { zone: input.zone }).toISO();
      if (iso) slots.push(iso);
    }
  }
  return slots.sort((a, b) => Date.parse(a) - Date.parse(b));
}
