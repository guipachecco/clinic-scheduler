import { describe, expect, it } from "vitest";

import type { DayHours } from "@/modules/schedule/schedule";
import { localToUtc } from "@/modules/schedule/time";

import {
  type DayItem,
  daySummary,
  freeIntervals,
  greeting,
  nextItem,
  startsIn,
} from "./day";

const zone = "America/Sao_Paulo";
const date = "2026-11-09"; // Monday, weekday 1
const at = (day: string, time: string) => localToUtc(day, time, zone);
const t = (time: string) => at(date, time);

const hours: DayHours[] = [
  {
    weekday: 1,
    intervals: [
      { start: "09:00", end: "12:00" },
      { start: "13:00", end: "18:00" },
    ],
  },
];

const span = (start: string, end: string) => ({
  start: t(start),
  end: t(end),
});
const item = (
  start: string,
  end: string,
  status: DayItem["status"] = "confirmed",
) => ({ startsAt: t(start), endsAt: t(end), status });

const base = {
  date,
  zone,
  hours,
  stepMinutes: 30,
  now: at("2026-11-08", "10:00"),
};

describe("freeIntervals", () => {
  const items = [
    item("10:00", "11:00"),
    item("13:00", "13:30", "completed"),
    item("15:00", "16:00", "cancelled"),
  ];
  const blocks = [{ startsAt: t("17:00"), endsAt: t("18:00") }];

  it("splits each interval, ignores cancelled, subtracts blocks", () => {
    expect(freeIntervals({ ...base, items, blocks })).toEqual([
      span("09:00", "10:00"),
      span("11:00", "12:00"),
      span("13:30", "17:00"),
    ]);
  });

  it("drops time before now rounded up to the step on today", () => {
    expect(freeIntervals({ ...base, items, blocks, now: t("11:10") })).toEqual([
      span("11:30", "12:00"),
      span("13:30", "17:00"),
    ]);
  });

  it("omits gaps shorter than the step", () => {
    expect(
      freeIntervals({
        ...base,
        items: [item("09:00", "09:20"), item("09:40", "12:00")],
        blocks: [],
        hours: [{ weekday: 1, intervals: [{ start: "09:00", end: "12:00" }] }],
      }),
    ).toEqual([]);
  });

  it("returns nothing without hours for that weekday", () => {
    expect(
      freeIntervals({
        ...base,
        hours: [{ weekday: 2, intervals: [{ start: "09:00", end: "12:00" }] }],
        items: [],
        blocks: [],
      }),
    ).toEqual([]);
  });
});

const full = (over: Partial<DayItem>): DayItem => ({
  id: "x",
  startsAt: t("09:00"),
  endsAt: t("10:00"),
  status: "confirmed",
  online: false,
  priceCents: null,
  patientId: "p",
  patientName: "Ana",
  patientPhone: null,
  serviceName: "Consulta",
  durationMinutes: 60,
  ...over,
});

describe("daySummary", () => {
  it("counts non-cancelled, non-no-show and marks partial totals", () => {
    expect(
      daySummary([
        full({ priceCents: 12000, online: true }),
        full({ priceCents: 8000 }),
        full({ priceCents: null, online: true }),
        full({ priceCents: 5000, status: "no_show" }),
        full({ priceCents: 5000, status: "cancelled" }),
      ]),
    ).toEqual({
      count: 3,
      online: 2,
      previsto: { cents: 20000, partial: true },
    });
  });

  it("hides previsto when nothing has a price", () => {
    expect(daySummary([full({}), full({})]).previsto).toBeNull();
  });

  it("is complete when every counted item has a price", () => {
    expect(daySummary([full({ priceCents: 100 })]).previsto).toEqual({
      cents: 100,
      partial: false,
    });
  });
});

describe("nextItem", () => {
  it("skips started and inactive items", () => {
    const started = full({ id: "a", startsAt: t("09:00") });
    const cancelled = full({
      id: "b",
      startsAt: t("11:00"),
      status: "cancelled",
    });
    const next = full({ id: "c", startsAt: t("14:00") });
    expect(nextItem([started, cancelled, next], t("10:00"))?.id).toBe("c");
  });

  it("returns null when none", () => {
    expect(nextItem([full({})], t("10:00"))).toBeNull();
  });
});

describe("greeting", () => {
  it.each([
    ["04:59", "Boa noite"],
    ["05:00", "Bom dia"],
    ["12:00", "Boa tarde"],
    ["18:00", "Boa noite"],
  ])("%s -> %s", (time, expected) => {
    expect(greeting(t(time), zone)).toBe(expected);
  });
});

describe("startsIn", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  const after = (min: number) => new Date(now.getTime() + min * 60_000);
  it.each([
    [25, "em 25 min"],
    [59, "em 59 min"],
    [60, "em 1 h"],
    [150, "em 2 h"],
    [-5, "agora"],
    [0, "agora"],
  ])("%i min -> %s", (min, expected) => {
    expect(startsIn(after(min), now)).toBe(expected);
  });
});
