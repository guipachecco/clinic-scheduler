import { describe, expect, it } from "vitest";

import {
  allocateDiscount,
  installmentState,
  quoteTotals,
  sessionAmounts,
  splitAmount,
} from "./money";
import { monthlyDueDates, recurringDates } from "./recurrence";

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("splitAmount", () => {
  it("puts the rounding remainder on the first parts", () => {
    expect(splitAmount(1000, 3)).toEqual([334, 333, 333]);
    expect(splitAmount(1001, 3)).toEqual([334, 334, 333]);
    expect(splitAmount(900, 3)).toEqual([300, 300, 300]);
    expect(splitAmount(5, 10)).toEqual([1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
  });

  it("always keeps the total", () => {
    for (const total of [0, 1, 99, 12345, 999_999]) {
      for (const parts of [1, 2, 3, 7, 12]) {
        expect(sum(splitAmount(total, parts))).toBe(total);
      }
    }
  });

  it("refuses invalid input", () => {
    expect(() => splitAmount(-1, 2)).toThrow();
    expect(() => splitAmount(10.5, 2)).toThrow();
    expect(() => splitAmount(10, 0)).toThrow();
  });
});

describe("allocateDiscount", () => {
  it("splits in proportion to each item's value", () => {
    expect(allocateDiscount([30000, 10000], 4000)).toEqual([3000, 1000]);
  });

  it("gives the remainder to the first items and keeps the total", () => {
    const shares = allocateDiscount([100, 100, 100], 100);
    expect(shares).toEqual([34, 33, 33]);
    expect(sum(shares)).toBe(100);
  });

  it("never takes an item below zero", () => {
    const values = [1, 1000, 1000];
    const shares = allocateDiscount(values, 2001);
    expect(sum(shares)).toBe(2001);
    shares.forEach((share, i) => expect(share).toBeLessThanOrEqual(values[i]!));
  });

  it("refuses a discount larger than the items", () => {
    expect(() => allocateDiscount([100], 101)).toThrow();
  });
});

describe("quoteTotals", () => {
  it("applies item discounts, then the quote discount", () => {
    const totals = quoteTotals(
      [
        { sessions: 3, unitPriceCents: 10000, discountCents: 1000 },
        { sessions: 1, unitPriceCents: 5000, discountCents: 0 },
      ],
      3400,
    );
    expect(totals.subtotalCents).toBe(34000);
    expect(totals.totalCents).toBe(30600);
    expect(totals.items).toEqual([
      { grossCents: 29000, netCents: 26100 },
      { grossCents: 5000, netCents: 4500 },
    ]);
    expect(sum(totals.items.map((i) => i.netCents))).toBe(totals.totalCents);
  });

  it("10% off 3 sessions that do not divide evenly", () => {
    const totals = quoteTotals(
      [{ sessions: 3, unitPriceCents: 3333, discountCents: 0 }],
      1000,
    );
    expect(totals.totalCents).toBe(8999);
    expect(sessionAmounts(totals.items[0]!.netCents, 3)).toEqual([
      3000, 3000, 2999,
    ]);
  });
});

describe("installmentState", () => {
  const base = {
    amountCents: 1000,
    paidCents: 0,
    cancelled: false,
    dueDate: "2026-11-10",
    today: "2026-11-05",
  };
  it("tells open, partial, overdue, paid and cancelled apart", () => {
    expect(installmentState(base)).toBe("open");
    expect(installmentState({ ...base, paidCents: 400 })).toBe("partial");
    expect(installmentState({ ...base, today: "2026-11-11" })).toBe("overdue");
    expect(installmentState({ ...base, paidCents: 1000 })).toBe("paid");
    expect(installmentState({ ...base, cancelled: true })).toBe("cancelled");
    expect(
      installmentState({ ...base, dueDate: null, today: "2030-01-01" }),
    ).toBe("open");
  });
});

describe("recurringDates", () => {
  it("weekly, every week and every two weeks", () => {
    expect(
      recurringDates("2026-11-03", { kind: "weekly", everyWeeks: 1 }, 3),
    ).toEqual(["2026-11-03", "2026-11-10", "2026-11-17"]);
    expect(
      recurringDates("2026-12-22", { kind: "weekly", everyWeeks: 2 }, 3),
    ).toEqual(["2026-12-22", "2027-01-05", "2027-01-19"]);
  });

  it("monthly keeps the day and falls back to the month's last day", () => {
    expect(recurringDates("2027-01-31", { kind: "monthly" }, 4)).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
    ]);
    expect(recurringDates("2028-01-29", { kind: "monthly" }, 2)).toEqual([
      "2028-01-29",
      "2028-02-29",
    ]);
  });

  it("crosses a DST start (2018-11-04 in São Paulo) without losing a day", () => {
    expect(
      recurringDates("2018-10-28", { kind: "weekly", everyWeeks: 1 }, 2),
    ).toEqual(["2018-10-28", "2018-11-04"]);
  });

  it("monthlyDueDates is the monthly rule", () => {
    expect(monthlyDueDates("2026-11-10", 3)).toEqual([
      "2026-11-10",
      "2026-12-10",
      "2027-01-10",
    ]);
  });
});
