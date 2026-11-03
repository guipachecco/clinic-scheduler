import { describe, expect, it } from "vitest";

import { businessHoursSchema, timeBlockSchema } from "./fields";

const hours = (intervals: { start: string; end: string }[]) => ({
  days: [{ weekday: 1, intervals }],
});

describe("businessHoursSchema", () => {
  it("accepts valid intervals and sorts them", () => {
    const r = businessHoursSchema.parse(
      hours([
        { start: "14:00", end: "18:00" },
        { start: "08:00", end: "12:00" },
      ]),
    );
    expect(r.days[0]!.intervals.map((i) => i.start)).toEqual([
      "08:00",
      "14:00",
    ]);
  });

  it("allows touching intervals", () => {
    expect(
      businessHoursSchema.safeParse(
        hours([
          { start: "08:00", end: "12:00" },
          { start: "12:00", end: "18:00" },
        ]),
      ).success,
    ).toBe(true);
  });

  it("rejects overlap", () => {
    expect(
      businessHoursSchema.safeParse(
        hours([
          { start: "08:00", end: "12:00" },
          { start: "11:55", end: "18:00" },
        ]),
      ).success,
    ).toBe(false);
  });

  it("rejects start >= end", () => {
    expect(
      businessHoursSchema.safeParse(hours([{ start: "12:00", end: "12:00" }]))
        .success,
    ).toBe(false);
    expect(
      businessHoursSchema.safeParse(hours([{ start: "13:00", end: "12:00" }]))
        .success,
    ).toBe(false);
  });

  it("rejects non 5-minute times", () => {
    expect(
      businessHoursSchema.safeParse(hours([{ start: "08:03", end: "12:00" }]))
        .success,
    ).toBe(false);
  });
});

describe("timeBlockSchema", () => {
  const base = {
    type: "day_off",
    title: "",
    startDate: "2026-12-24",
    endDate: "2026-12-24",
  };

  it("builds all-day ranges", () => {
    const r = timeBlockSchema.parse({
      ...base,
      allDay: "on",
      endDate: "2026-12-25",
    });
    expect(r.allDay).toBe(true);
    expect(r.title).toBeNull();
    expect(r.startsAt.toISOString()).toBe("2026-12-24T03:00:00.000Z");
    expect(r.endsAt.toISOString()).toBe("2026-12-26T03:00:00.000Z");
  });

  it("builds timed ranges", () => {
    const r = timeBlockSchema.parse({
      ...base,
      title: " Médico ",
      startTime: "09:00",
      endTime: "11:30",
    });
    expect(r.allDay).toBe(false);
    expect(r.title).toBe("Médico");
    expect(r.startsAt.toISOString()).toBe("2026-12-24T12:00:00.000Z");
    expect(r.endsAt.toISOString()).toBe("2026-12-24T14:30:00.000Z");
  });

  it("rejects end date before start date", () => {
    expect(
      timeBlockSchema.safeParse({
        ...base,
        allDay: true,
        endDate: "2026-12-23",
      }).success,
    ).toBe(false);
  });

  it("rejects timed block missing endTime", () => {
    expect(
      timeBlockSchema.safeParse({ ...base, startTime: "09:00" }).success,
    ).toBe(false);
  });

  it("rejects end not after start", () => {
    expect(
      timeBlockSchema.safeParse({
        ...base,
        startTime: "09:00",
        endTime: "09:00",
      }).success,
    ).toBe(false);
  });

  it("rejects an invalid type and a long title", () => {
    expect(
      timeBlockSchema.safeParse({ ...base, type: "x", allDay: true }).success,
    ).toBe(false);
    expect(
      timeBlockSchema.safeParse({
        ...base,
        title: "a".repeat(81),
        allDay: true,
      }).success,
    ).toBe(false);
  });
});

describe("businessHoursSchema error paths", () => {
  it("points an overlap error to the typed row, not the sorted one", () => {
    const r = businessHoursSchema.safeParse(
      hours([
        { start: "11:55", end: "18:00" },
        { start: "08:00", end: "12:00" },
      ]),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path)).toEqual([
        ["days", 0, "intervals", 0, "start"],
      ]);
    }
  });
});
