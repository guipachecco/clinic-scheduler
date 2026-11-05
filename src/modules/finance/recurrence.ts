import { DateTime } from "luxon";

import { CLINIC_TIME_ZONE } from "@/modules/schedule/time";

// Pure date rules for scheduling a package at once. Client-safe. Dates are
// local to the clinic (YYYY-MM-DD) and times are wall-clock (HH:mm).

export type Recurrence =
  { kind: "weekly"; everyWeeks: number } | { kind: "monthly" };

// The first `count` dates, starting on `firstDate`.
// Weekly: every N weeks on the same weekday.
// Monthly: the same day of the month; a month without that day (31 in April)
// uses its last day, and the next month goes back to the original day.
export function recurringDates(
  firstDate: string,
  recurrence: Recurrence,
  count: number,
  zone: string = CLINIC_TIME_ZONE,
): string[] {
  const first = DateTime.fromISO(firstDate, { zone });
  if (!first.isValid) throw new RangeError("invalid first date");
  if (!Number.isInteger(count) || count < 0 || count > 200) {
    throw new RangeError("count must be between 0 and 200");
  }
  return Array.from({ length: count }, (_, i) => {
    const date =
      recurrence.kind === "weekly"
        ? first.plus({ weeks: i * recurrence.everyWeeks })
        : first.plus({ months: i });
    return date.toFormat("yyyy-MM-dd");
  });
}

// Next due dates for "parcelado": the first date, then one month apart
// (same rule as the monthly recurrence).
export const monthlyDueDates = (firstDate: string, count: number) =>
  recurringDates(firstDate, { kind: "monthly" }, count);
