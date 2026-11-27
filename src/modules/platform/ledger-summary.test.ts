import { describe, expect, it } from "vitest";

import { ledgerSummary, type LedgerEntry } from "./ledger-summary";

const e = (
  direction: "in" | "out",
  amountCents: number,
  dueOn: string,
  paidOn: string | null = null,
): LedgerEntry => ({ direction, amountCents, dueOn, paidOn });

describe("ledgerSummary", () => {
  it("adds what was paid in the month and what is still open", () => {
    const s = ledgerSummary(
      [
        e("in", 15_000, "2026-11-05", "2026-11-06"),
        e("in", 15_000, "2026-11-20"), // to receive
        e("out", 4_000, "2026-11-10", "2026-11-10"),
        e("out", 2_500, "2026-11-15"), // overdue on the 27th
        e("out", 9_000, "2026-11-30"), // due later this month
        e("out", 1_000, "2026-12-05"), // next month: ignored
        e("in", 99_000, "2026-10-01", "2026-10-01"), // paid last month
      ],
      "2026-11",
      "2026-11-27",
    );
    expect(s).toEqual({
      receivedCents: 15_000,
      paidCents: 4_000,
      balanceCents: 11_000,
      toPayCents: 11_500,
      toReceiveCents: 15_000,
      overdueBills: 1,
      overdueCents: 2_500,
    });
  });

  it("keeps an old unpaid bill in the month's to-pay", () => {
    const s = ledgerSummary(
      [e("out", 500, "2026-09-01")],
      "2026-11",
      "2026-11-01",
    );
    expect(s.toPayCents).toBe(500);
    expect(s.overdueBills).toBe(1);
  });
});
