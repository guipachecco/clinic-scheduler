import { DateTime } from "luxon";

import type { DayHours } from "@/modules/schedule/schedule";
import { localToUtc } from "@/modules/schedule/time";

// Pure per-day calculations for the owner's panel. Client-safe.

export type DayItem = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: "requested" | "confirmed" | "cancelled" | "completed" | "no_show";
  online: boolean;
  priceCents: number | null;
  patientId: string;
  patientName: string;
  patientPhone: string | null;
  serviceName: string;
  durationMinutes: number;
};

export type FreeInterval = { start: Date; end: Date };

const MINUTE = 60_000;

// Statuses that do not count towards the day's totals or "next" appointment.
const inactive = (status: DayItem["status"]) =>
  status === "cancelled" || status === "no_show";

// Gaps of at least `stepMinutes` inside business hours, in order. Every
// appointment except cancelled ones occupies time; blocks are subtracted; on
// today, time before `now` rounded up to the step is not free.
export function freeIntervals(input: {
  date: string;
  zone: string;
  hours: DayHours[];
  blocks: { startsAt: Date; endsAt: Date }[];
  items: Pick<DayItem, "startsAt" | "endsAt" | "status">[];
  stepMinutes: number;
  now: Date;
}): FreeInterval[] {
  const { date, zone, stepMinutes } = input;
  const day = DateTime.fromISO(date, { zone });
  if (!day.isValid || stepMinutes <= 0) return [];

  // Luxon: 1 = Monday ... 7 = Sunday; the database uses 0 = Sunday.
  const intervals =
    input.hours.find((entry) => entry.weekday === day.weekday % 7)?.intervals ??
    [];

  const busy = [
    ...input.blocks.map((b) => ({
      s: b.startsAt.getTime(),
      e: b.endsAt.getTime(),
    })),
    ...input.items
      .filter((i) => i.status !== "cancelled")
      .map((i) => ({ s: i.startsAt.getTime(), e: i.endsAt.getTime() })),
  ].sort((a, b) => a.s - b.s);

  // Earliest free instant: now rounded up to the step on the clinic wall
  // clock (minutes since local midnight); only matters on today.
  const local = DateTime.fromJSDate(input.now, { zone });
  let floor = -Infinity;
  if (local.toISODate() === date) {
    const minutes =
      local.hour * 60 +
      local.minute +
      (local.second || local.millisecond ? 1 : 0);
    const rounded = Math.ceil(minutes / stepMinutes) * stepMinutes;
    floor = localToUtc(date, "00:00", zone).getTime() + rounded * MINUTE;
  }

  const result: FreeInterval[] = [];
  for (const interval of intervals) {
    let cursor = Math.max(
      localToUtc(date, interval.start, zone).getTime(),
      floor,
    );
    const close = localToUtc(date, interval.end, zone).getTime();
    const flush = (until: number) => {
      if (until - cursor >= stepMinutes * MINUTE) {
        result.push({ start: new Date(cursor), end: new Date(until) });
      }
    };
    for (const b of busy) {
      if (b.e <= cursor) continue;
      if (b.s >= close) break;
      flush(Math.min(b.s, close));
      cursor = Math.max(cursor, b.e);
    }
    if (cursor < close) flush(close);
  }
  return result;
}

export function daySummary(items: DayItem[]): {
  count: number;
  online: number;
  previsto: { cents: number; partial: boolean } | null;
} {
  const counted = items.filter((i) => !inactive(i.status));
  const priced = counted.filter((i) => i.priceCents !== null);
  return {
    count: counted.length,
    online: counted.filter((i) => i.online).length,
    previsto:
      priced.length === 0
        ? null
        : {
            cents: priced.reduce((sum, i) => sum + (i.priceCents ?? 0), 0),
            partial: priced.length < counted.length,
          },
  };
}

export function nextItem(items: DayItem[], now: Date): DayItem | null {
  const upcoming = items
    .filter(
      (i) =>
        i.startsAt.getTime() > now.getTime() &&
        i.status !== "cancelled" &&
        i.status !== "no_show" &&
        i.status !== "completed",
    )
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return upcoming[0] ?? null;
}

export function greeting(
  now: Date,
  zone: string,
): "Bom dia" | "Boa tarde" | "Boa noite" {
  const { hour } = DateTime.fromJSDate(now, { zone });
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}

export function startsIn(start: Date, now: Date): string {
  const diff = start.getTime() - now.getTime();
  if (diff <= 0) return "agora";
  const minutes = Math.ceil(diff / MINUTE);
  if (minutes < 60) return `em ${minutes} min`;
  return `em ${Math.floor(minutes / 60)} h`;
}
