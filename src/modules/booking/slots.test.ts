import { describe, expect, it } from "vitest";

import type { DayHours } from "@/modules/schedule/schedule";

import { freeSlots } from "./slots";

const ZONE = "America/Sao_Paulo";
// 2026-11-09 is a Monday (weekday 1); 2026-11-08 a Sunday.
const MONDAY = "2026-11-09";

const week = (intervals: DayHours["intervals"]): DayHours[] =>
  Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    intervals: weekday === 1 ? intervals : [],
  }));

const local = (time: string, date = MONDAY) =>
  new Date(`${date}T${time}:00-03:00`);

const base = {
  date: MONDAY,
  zone: ZONE,
  hours: week([{ start: "09:00", end: "12:00" }]),
  busy: [] as { startsAt: Date; endsAt: Date }[],
  durationMinutes: 60,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  stepMinutes: 30,
  now: new Date("2026-11-01T12:00:00Z"),
  minAdvanceMinutes: 0,
  maxAdvanceDays: 60,
};

const times = (slots: string[]) => slots.map((slot) => slot.slice(11, 16));

describe("freeSlots", () => {
  it("slots step through business hours", () => {
    expect(times(freeSlots(base))).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
    ]);
  });

  it("busy interval and buffers remove slots", () => {
    // A 30-minute service with a 15-minute buffer after it.
    const input = {
      ...base,
      durationMinutes: 30,
      bufferAfterMinutes: 15,
      busy: [{ startsAt: local("10:00"), endsAt: local("11:00") }],
    };
    const free = times(freeSlots(input));
    expect(free).toContain("09:00");
    expect(free).not.toContain("09:30");
    expect(free).not.toContain("10:00");
    expect(free).not.toContain("10:30");
    expect(free).toContain("11:00");

    const withBufferBefore = times(
      freeSlots({ ...input, bufferBeforeMinutes: 5 }),
    );
    expect(withBufferBefore).toContain("09:00");
    expect(withBufferBefore).not.toContain("11:00");
    expect(withBufferBefore).toContain("11:30");
  });

  it("min advance hides near slots", () => {
    const free = times(
      freeSlots({ ...base, now: local("08:30"), minAdvanceMinutes: 120 }),
    );
    expect(free).toEqual(["10:30", "11:00"]);
  });

  it("past slots are never offered", () => {
    expect(times(freeSlots({ ...base, now: local("10:10") }))).toEqual([
      "10:30",
      "11:00",
    ]);
    expect(freeSlots({ ...base, now: local("09:00", "2026-11-10") })).toEqual(
      [],
    );
  });

  it("beyond max advance days is empty", () => {
    const now = local("08:00", "2026-11-02");
    // Seven days after 2026-11-02 is the last day open.
    expect(freeSlots({ ...base, now, maxAdvanceDays: 7 })).toHaveLength(5);
    expect(freeSlots({ ...base, now, maxAdvanceDays: 6 })).toEqual([]);
  });

  it("closed weekday is empty", () => {
    expect(freeSlots({ ...base, date: "2026-11-08" })).toEqual([]);
  });

  it("a service longer than the interval has no slot", () => {
    expect(freeSlots({ ...base, durationMinutes: 240 })).toEqual([]);
  });

  it("each interval of the day starts its own steps", () => {
    const free = times(
      freeSlots({
        ...base,
        hours: week([
          { start: "09:00", end: "10:00" },
          { start: "14:15", end: "16:00" },
        ]),
      }),
    );
    expect(free).toEqual(["09:00", "14:15", "14:45"]);
  });

  it("an invalid date is empty", () => {
    expect(freeSlots({ ...base, date: "2026-13-40" })).toEqual([]);
    expect(freeSlots({ ...base, date: "amanhã" })).toEqual([]);
  });

  it("DST-free São Paulo times are rendered in -03:00", () => {
    // November used to be summer time (-02:00) until 2019.
    const [first] = freeSlots(base);
    expect(first).toBe("2026-11-09T09:00:00.000-03:00");
    expect(new Date(first!).toISOString()).toBe("2026-11-09T12:00:00.000Z");
  });
});
