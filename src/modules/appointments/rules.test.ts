import { describe, expect, it } from "vitest";

import type { DayHours } from "@/modules/schedule/schedule";
import { localToUtc } from "@/modules/schedule/time";

import { checkWarnings } from "./rules";

// 2026-11-10 is a Tuesday (weekday 2).
function week(
  days: Record<number, { start: string; end: string }[]>,
): DayHours[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    intervals: days[weekday] ?? [],
  }));
}

const WORKDAYS = week({
  1: [{ start: "08:00", end: "18:00" }],
  2: [
    { start: "08:00", end: "12:00" },
    { start: "13:00", end: "18:00" },
  ],
  3: [{ start: "08:00", end: "18:00" }],
});

const NOW = new Date("2026-11-01T12:00:00Z");
const MINUTE = 60_000;

function at(date: string, time: string, minutes: number) {
  const startsAt = localToUtc(date, time);
  return { startsAt, endsAt: new Date(startsAt.getTime() + minutes * MINUTE) };
}

const codes = (warnings: { code: string }[]) => warnings.map((w) => w.code);

describe("checkWarnings", () => {
  it("gives no warning inside an interval", () => {
    expect(
      checkWarnings({
        ...at("2026-11-10", "08:00", 240),
        hours: WORKDAYS,
        blocks: [],
        now: NOW,
      }),
    ).toEqual([]);
  });

  it("warns when the appointment straddles the end of an interval", () => {
    const warnings = checkWarnings({
      ...at("2026-11-10", "11:30", 60),
      hours: WORKDAYS,
      blocks: [],
      now: NOW,
    });
    expect(warnings).toEqual([
      { code: "outside_hours", message: "Fora do expediente." },
    ]);
  });

  it("warns on a closed day", () => {
    // 2026-11-08 is a Sunday.
    expect(
      codes(
        checkWarnings({
          ...at("2026-11-08", "10:00", 30),
          hours: WORKDAYS,
          blocks: [],
          now: NOW,
        }),
      ),
    ).toEqual(["outside_hours"]);
  });

  it("checks an appointment that crosses midnight against both days", () => {
    const allDay = [{ start: "00:00", end: "23:55" }];
    const evening = [{ start: "20:00", end: "23:55" }];
    // Tuesday 23:50 to Wednesday 00:10: Tuesday ends 23:55, so it is outside.
    expect(
      codes(
        checkWarnings({
          ...at("2026-11-10", "23:50", 20),
          hours: week({ 2: evening, 3: allDay }),
          blocks: [],
          now: NOW,
        }),
      ),
    ).toEqual(["outside_hours"]);
    // The Wednesday part alone is checked against Wednesday.
    expect(
      checkWarnings({
        ...at("2026-11-11", "00:00", 20),
        hours: week({ 2: evening, 3: allDay }),
        blocks: [],
        now: NOW,
      }),
    ).toEqual([]);
    // Wednesday closed: the part after midnight is outside.
    expect(
      codes(
        checkWarnings({
          ...at("2026-11-11", "00:00", 20),
          hours: week({ 2: allDay }),
          blocks: [],
          now: NOW,
        }),
      ),
    ).toEqual(["outside_hours"]);
  });

  it("warns on a block, naming its title or else its type", () => {
    const slot = at("2026-11-10", "09:00", 60);
    expect(
      checkWarnings({
        ...slot,
        hours: WORKDAYS,
        blocks: [
          {
            startsAt: new Date(slot.startsAt.getTime() + 30 * MINUTE),
            endsAt: new Date(slot.endsAt.getTime() + 60 * MINUTE),
            title: "Congresso",
            type: "other",
          },
        ],
        now: NOW,
      }),
    ).toEqual([{ code: "on_block", message: "Sobre um bloqueio: Congresso." }]);
    expect(
      checkWarnings({
        ...slot,
        hours: WORKDAYS,
        blocks: [
          {
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            title: null,
            type: "vacation",
          },
        ],
        now: NOW,
      }),
    ).toEqual([{ code: "on_block", message: "Sobre um bloqueio: Férias." }]);
  });

  it("does not warn on a block that only touches the appointment", () => {
    const slot = at("2026-11-10", "09:00", 60);
    expect(
      checkWarnings({
        ...slot,
        hours: WORKDAYS,
        blocks: [
          {
            startsAt: slot.endsAt,
            endsAt: new Date(slot.endsAt.getTime() + 60 * MINUTE),
          },
        ],
        now: NOW,
      }),
    ).toEqual([]);
  });

  it("warns about a start in the past", () => {
    const slot = at("2026-11-10", "09:00", 60);
    expect(
      checkWarnings({
        ...slot,
        hours: WORKDAYS,
        blocks: [],
        now: new Date(slot.startsAt.getTime() + MINUTE),
      }),
    ).toEqual([{ code: "in_past", message: "Horário no passado." }]);
    expect(
      checkWarnings({
        ...slot,
        hours: WORKDAYS,
        blocks: [],
        now: slot.startsAt,
      }),
    ).toEqual([]);
  });

  it("lists every warning that applies, in a fixed order", () => {
    const slot = at("2026-11-08", "09:00", 60);
    expect(
      codes(
        checkWarnings({
          ...slot,
          hours: WORKDAYS,
          blocks: [{ startsAt: slot.startsAt, endsAt: slot.endsAt }],
          now: new Date("2026-12-01T00:00:00Z"),
        }),
      ),
    ).toEqual(["outside_hours", "on_block", "in_past"]);
  });

  describe("on the 2018-11-04 DST start (00:00 jumps to 01:00)", () => {
    const old = new Date("2018-01-01T00:00:00Z");

    it("uses the wall clock of the 23-hour day", () => {
      // 2018-11-04 is a Sunday; 08:00 local is -02:00.
      const slot = at("2018-11-04", "08:00", 240);
      expect(slot.startsAt.toISOString()).toBe("2018-11-04T10:00:00.000Z");
      expect(
        checkWarnings({
          ...slot,
          hours: week({ 0: [{ start: "08:00", end: "12:00" }] }),
          blocks: [],
          now: old,
        }),
      ).toEqual([]);
      expect(
        codes(
          checkWarnings({
            ...at("2018-11-04", "11:30", 60),
            hours: week({ 0: [{ start: "08:00", end: "12:00" }] }),
            blocks: [],
            now: old,
          }),
        ),
      ).toEqual(["outside_hours"]);
    });

    it("splits 23:30 on the night before at the shortened midnight", () => {
      // Saturday 23:30 (-03:00) + 60 min = Sunday 01:30 (-02:00).
      const slot = at("2018-11-03", "23:30", 60);
      expect(slot.startsAt.toISOString()).toBe("2018-11-04T02:30:00.000Z");
      const sunday = [{ start: "01:00", end: "12:00" }];
      expect(
        codes(
          checkWarnings({
            ...slot,
            hours: week({ 6: [{ start: "20:00", end: "23:55" }], 0: sunday }),
            blocks: [],
            now: old,
          }),
        ),
      ).toEqual(["outside_hours"]);
      // The Sunday part (01:00 to 01:30) fits Sunday's hours.
      expect(
        checkWarnings({
          startsAt: new Date("2018-11-04T03:00:00Z"),
          endsAt: new Date("2018-11-04T03:30:00Z"),
          hours: week({ 0: sunday }),
          blocks: [],
          now: old,
        }),
      ).toEqual([]);
    });
  });

  it("honors an explicit zone", () => {
    // 2026-11-10T01:00Z is 10:00 on Tuesday in Tokyo, 22:00 Monday in São Paulo.
    const slot = {
      startsAt: new Date("2026-11-10T01:00:00Z"),
      endsAt: new Date("2026-11-10T02:00:00Z"),
    };
    expect(
      checkWarnings({
        ...slot,
        hours: WORKDAYS,
        blocks: [],
        now: NOW,
        zone: "Asia/Tokyo",
      }),
    ).toEqual([]);
    expect(
      codes(checkWarnings({ ...slot, hours: WORKDAYS, blocks: [], now: NOW })),
    ).toEqual(["outside_hours"]);
  });
});
