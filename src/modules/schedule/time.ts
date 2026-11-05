import { DateTime } from "luxon";

// Pure time helpers for the clinic's wall-clock schedule. Client-safe.
// The zone is a constant for now; clinic_settings.timezone defaults to the
// same value and is not read yet.

export const CLINIC_TIME_ZONE = "America/Sao_Paulo";

// "2026-11-03" + "08:00" in the clinic zone -> the matching UTC instant.
// A wall-clock time that does not exist (DST gap, e.g. 2018-11-04 00:30) moves
// forward by the gap, to 01:30 local (-02:00).
export function localToUtc(
  date: string,
  time: string,
  zone: string = CLINIC_TIME_ZONE,
): Date {
  return DateTime.fromISO(`${date}T${time}`, { zone }).toJSDate();
}

// From the first day's local midnight to the local midnight after the last
// day. DST days are 23 or 25 hours long, which is why this does not add
// fixed 24-hour steps.
export function localDayRange(
  firstDate: string,
  lastDate: string,
  zone: string = CLINIC_TIME_ZONE,
): { startsAt: Date; endsAt: Date } {
  const first = DateTime.fromISO(firstDate, { zone }).startOf("day");
  const last = DateTime.fromISO(lastDate, { zone })
    .plus({ days: 1 })
    .startOf("day");
  return { startsAt: first.toJSDate(), endsAt: last.toJSDate() };
}

export function formatLocal(
  date: Date,
  pattern: "dd/MM HH:mm" | "dd/MM/yyyy" | "HH:mm",
  zone: string = CLINIC_TIME_ZONE,
): string {
  return DateTime.fromJSDate(date, { zone }).toFormat(pattern);
}

// Today's date in the clinic zone, as YYYY-MM-DD.
export function todayLocal(zone: string = CLINIC_TIME_ZONE): string {
  return DateTime.now().setZone(zone).toFormat("yyyy-MM-dd");
}
