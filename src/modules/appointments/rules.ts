import { DateTime } from "luxon";

import type { DayHours } from "@/modules/schedule/schedule";
import { TIME_BLOCK_TYPES } from "@/modules/schedule/fields";
import { CLINIC_TIME_ZONE } from "@/modules/schedule/time";

// Pure warning checks for an appointment time. Warnings can be overridden by
// the admin ("Agendar mesmo assim"); refusals live in appointments.ts.

export type WarningCode = "outside_hours" | "on_block" | "in_past";
export type Warning = { code: WarningCode; message: string };

type BlockType = (typeof TIME_BLOCK_TYPES)[number]["value"];

export type WarningBlock = {
  startsAt: Date;
  endsAt: Date;
  title?: string | null;
  type?: BlockType;
};

const MINUTES_PER_DAY = 24 * 60;

const toMinutes = (hhmm: string) =>
  Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// Wall-clock minutes since local midnight, with fractions for seconds.
const wallMinutes = (dt: DateTime) =>
  dt.hour * 60 + dt.minute + dt.second / 60 + dt.millisecond / 60_000;

// True when every part of [startsAt, endsAt) sits inside one interval of its
// local day. The range is split at each local midnight, found by calendar
// arithmetic, so 23- and 25-hour DST days are handled. Intervals end at 23:55
// at most, so a part that runs to midnight is never inside.
function insideHours(
  startsAt: Date,
  endsAt: Date,
  hours: DayHours[],
  zone: string,
): boolean {
  const end = DateTime.fromJSDate(endsAt, { zone });
  let cursor = DateTime.fromJSDate(startsAt, { zone });
  while (cursor < end) {
    const nextMidnight = cursor.startOf("day").plus({ days: 1 });
    const partEnd = nextMidnight < end ? nextMidnight : end;
    const from = wallMinutes(cursor);
    const until =
      partEnd.toMillis() === nextMidnight.toMillis()
        ? MINUTES_PER_DAY
        : wallMinutes(partEnd);
    // Luxon: 1 = Monday ... 7 = Sunday; the database uses 0 = Sunday.
    const weekday = cursor.weekday % 7;
    const intervals =
      hours.find((day) => day.weekday === weekday)?.intervals ?? [];
    const fits = intervals.some(
      (i) => toMinutes(i.start) <= from && until <= toMinutes(i.end),
    );
    if (!fits) return false;
    cursor = partEnd;
  }
  return true;
}

function blockName(block: WarningBlock): string | undefined {
  if (block.title) return block.title;
  return TIME_BLOCK_TYPES.find((t) => t.value === block.type)?.label;
}

export function checkWarnings(input: {
  startsAt: Date;
  endsAt: Date;
  hours: DayHours[];
  blocks: WarningBlock[];
  now: Date;
  zone?: string;
}): Warning[] {
  const zone = input.zone ?? CLINIC_TIME_ZONE;
  const warnings: Warning[] = [];

  if (!insideHours(input.startsAt, input.endsAt, input.hours, zone)) {
    warnings.push({ code: "outside_hours", message: "Fora do expediente." });
  }

  const block = input.blocks.find(
    (b) => b.startsAt < input.endsAt && b.endsAt > input.startsAt,
  );
  if (block) {
    const name = blockName(block);
    warnings.push({
      code: "on_block",
      message: name ? `Sobre um bloqueio: ${name}.` : "Sobre um bloqueio.",
    });
  }

  if (input.startsAt < input.now) {
    warnings.push({ code: "in_past", message: "Horário no passado." });
  }

  return warnings;
}
