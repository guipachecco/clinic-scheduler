// Brazilian national holidays. Pure and client-safe.

const pad = (n: number) => String(n).padStart(2, "0");

function iso(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

function goodFriday(year: number): string {
  const [y, m, d] = easterSunday(year).split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(y, m - 1, d - 2));
  return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function nationalHolidays(
  year: number,
): { date: string; name: string }[] {
  return [
    { date: iso(year, 1, 1), name: "Confraternização Universal" },
    { date: goodFriday(year), name: "Sexta-feira Santa" },
    { date: iso(year, 4, 21), name: "Tiradentes" },
    { date: iso(year, 5, 1), name: "Dia do Trabalho" },
    { date: iso(year, 9, 7), name: "Independência" },
    { date: iso(year, 10, 12), name: "Nossa Senhora Aparecida" },
    { date: iso(year, 11, 2), name: "Finados" },
    { date: iso(year, 11, 15), name: "Proclamação da República" },
    {
      date: iso(year, 11, 20),
      name: "Dia Nacional de Zumbi e da Consciência Negra",
    },
    { date: iso(year, 12, 25), name: "Natal" },
  ].sort((x, y) => x.date.localeCompare(y.date));
}
