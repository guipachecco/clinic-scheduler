import { DateTime } from "luxon";

// Pure birthday rules. Imported by client code too, so no database access.

// The MM-DD keys that count as "today". In a non-leap year, people born on
// Feb 29 are celebrated on Feb 28, so that day lists both keys.
export function birthdayKeys(today: string): string[] {
  const key = today.slice(5);
  if (key === "02-28" && !DateTime.fromISO(today).isInLeapYear) {
    return ["02-28", "02-29"];
  }
  return [key];
}

// The age the person turns today: this year minus the birth year.
export function ageTurning(birthDate: string, today: string): number {
  return Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4));
}
