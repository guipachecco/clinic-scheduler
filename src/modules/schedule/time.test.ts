import { describe, expect, it } from "vitest";

import { formatLocal, localDayRange, localToUtc, todayLocal } from "./time";

describe("localToUtc", () => {
  it("converts clinic wall-clock time to UTC", () => {
    expect(localToUtc("2026-11-03", "08:00").toISOString()).toBe(
      "2026-11-03T11:00:00.000Z",
    );
  });
});

describe("localDayRange", () => {
  it("runs from the first midnight to the midnight after the last day", () => {
    const { startsAt, endsAt } = localDayRange("2026-12-24", "2026-12-25");
    expect(startsAt.toISOString()).toBe("2026-12-24T03:00:00.000Z");
    expect(endsAt.toISOString()).toBe("2026-12-26T03:00:00.000Z");
  });

  it("handles the 2018 DST start as a 23-hour day", () => {
    const { startsAt, endsAt } = localDayRange("2018-11-04", "2018-11-04");
    expect((endsAt.getTime() - startsAt.getTime()) / 3_600_000).toBe(23);
  });
});

describe("formatLocal", () => {
  const date = new Date("2026-11-03T11:05:00Z");
  it("formats in the clinic zone", () => {
    expect(formatLocal(date, "dd/MM HH:mm")).toBe("03/11 08:05");
    expect(formatLocal(date, "dd/MM/yyyy")).toBe("03/11/2026");
    expect(formatLocal(date, "HH:mm")).toBe("08:05");
  });
});

describe("todayLocal", () => {
  it("returns a YYYY-MM-DD date", () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("explicit zones (no dependence on the machine zone)", () => {
  it("localToUtc and formatLocal honor a non-default zone", () => {
    expect(localToUtc("2026-11-03", "08:00", "Asia/Tokyo").toISOString()).toBe(
      "2026-11-02T23:00:00.000Z",
    );
    expect(
      formatLocal(
        new Date("2026-11-02T23:00:00Z"),
        "dd/MM HH:mm",
        "Asia/Tokyo",
      ),
    ).toBe("03/11 08:00");
  });

  it("moves a nonexistent local time in the DST gap forward", () => {
    // 2018-11-04 00:00 -> 01:00 in Sao Paulo, so 00:30 does not exist; it
    // resolves to 01:30 local (-02:00), that is 03:30Z.
    expect(localToUtc("2018-11-04", "00:30").toISOString()).toBe(
      "2018-11-04T03:30:00.000Z",
    );
  });
});
