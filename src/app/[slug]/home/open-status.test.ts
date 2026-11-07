import { describe, expect, it } from "vitest";

import type { DayHours } from "@/modules/schedule/schedule";

import { openStatus } from "./open-status";

const ZONE = "America/Sao_Paulo";

// Weekday 0 = Sunday. Monday to Friday 09:00-12:00 and 14:00-18:00, Saturday
// 09:00-13:00, Sunday closed.
function week(): DayHours[] {
  const weekdays = [1, 2, 3, 4, 5];
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    intervals: weekdays.includes(weekday)
      ? [
          { start: "09:00", end: "12:00" },
          { start: "14:00", end: "18:00" },
        ]
      : weekday === 6
        ? [{ start: "09:00", end: "13:00" }]
        : [],
  }));
}

// 2026-11-09 is a Monday. Sao Paulo is UTC-3 all year.
const at = (day: string, time: string) => new Date(`${day}T${time}:00-03:00`);

describe("openStatus", () => {
  it("is open inside an interval", () => {
    expect(openStatus(week(), ZONE, at("2026-11-09", "10:30"))).toEqual({
      open: true,
      label: "Aberto agora · até 12:00",
    });
  });

  it("opens again later the same day between two intervals", () => {
    expect(openStatus(week(), ZONE, at("2026-11-09", "12:30"))).toEqual({
      open: false,
      label: "Fechado · abre hoje às 14:00",
    });
  });

  it("opens today before the first interval", () => {
    expect(openStatus(week(), ZONE, at("2026-11-09", "07:00"))).toEqual({
      open: false,
      label: "Fechado · abre hoje às 09:00",
    });
  });

  it("opens tomorrow after closing", () => {
    expect(openStatus(week(), ZONE, at("2026-11-09", "19:00"))).toEqual({
      open: false,
      label: "Fechado · abre amanhã às 09:00",
    });
  });

  it("skips the closed Sunday after Saturday closing", () => {
    expect(openStatus(week(), ZONE, at("2026-11-14", "15:00"))).toEqual({
      open: false,
      label: "Fechado · abre segunda-feira às 09:00",
    });
  });

  it("treats the closing minute as closed", () => {
    expect(openStatus(week(), ZONE, at("2026-11-09", "12:00")).open).toBe(
      false,
    );
  });

  it("uses the clinic zone, not the server's", () => {
    // 2026-11-09 12:30 UTC is 09:30 in Sao Paulo.
    expect(
      openStatus(week(), ZONE, new Date("2026-11-09T12:30:00Z")).label,
    ).toBe("Aberto agora · até 12:00");
  });

  it("is closed today when the week has no hours", () => {
    const empty = week().map((day) => ({ ...day, intervals: [] }));
    expect(openStatus(empty, ZONE, at("2026-11-09", "10:00"))).toEqual({
      open: false,
      label: "Fechado hoje",
    });
  });
});
