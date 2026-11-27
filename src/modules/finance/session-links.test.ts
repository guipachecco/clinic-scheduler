import { describe, expect, it } from "vitest";

import { paidSessions } from "./session-links";

const base = { sessions: 10, paidInstallments: 0, saleTotalCents: 100_000 };

describe("paidSessions", () => {
  it("por sessão: one session per paid installment", () => {
    expect(
      paidSessions({
        ...base,
        plan: "per_session",
        paidInstallments: 3,
        salePaidCents: 30_000,
      }),
    ).toBe(3);
  });

  it("parcelado: the paid share of the sale, rounded down", () => {
    const plan = "installments" as const;
    expect(paidSessions({ ...base, plan, salePaidCents: 0 })).toBe(0);
    expect(paidSessions({ ...base, plan, salePaidCents: 10_000 })).toBe(1);
    expect(paidSessions({ ...base, plan, salePaidCents: 19_999 })).toBe(1);
  });

  it("à vista: all once paid, none before", () => {
    const plan = "upfront" as const;
    expect(paidSessions({ ...base, plan, salePaidCents: 0 })).toBe(0);
    expect(paidSessions({ ...base, plan, salePaidCents: 100_000 })).toBe(10);
  });

  it("a free sale covers every session", () => {
    expect(
      paidSessions({
        ...base,
        plan: "upfront",
        salePaidCents: 0,
        saleTotalCents: 0,
      }),
    ).toBe(10);
  });
});
