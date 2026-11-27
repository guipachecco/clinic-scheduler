// Pure math of root's "Financeiro" screen (Zemana's own money), apart from the
// database so the unit test reaches it. Dates are "YYYY-MM-DD" strings, which
// compare in calendar order.

export type LedgerEntry = {
  direction: "in" | "out";
  amountCents: number;
  dueOn: string;
  paidOn: string | null;
};

export type LedgerSummary = {
  // Paid in the month.
  receivedCents: number;
  paidCents: number;
  // Received minus paid in the month.
  balanceCents: number;
  // Not paid yet and due in the month (or earlier, if overdue).
  toPayCents: number;
  toReceiveCents: number;
  overdueBills: number;
  overdueCents: number;
};

// month is "YYYY-MM"; today is "YYYY-MM-DD".
export function ledgerSummary(
  entries: readonly LedgerEntry[],
  month: string,
  today: string,
): LedgerSummary {
  const monthEnd = `${month}-31`;
  const s: LedgerSummary = {
    receivedCents: 0,
    paidCents: 0,
    balanceCents: 0,
    toPayCents: 0,
    toReceiveCents: 0,
    overdueBills: 0,
    overdueCents: 0,
  };
  for (const e of entries) {
    if (e.paidOn) {
      if (!e.paidOn.startsWith(month)) continue;
      if (e.direction === "in") s.receivedCents += e.amountCents;
      else s.paidCents += e.amountCents;
      continue;
    }
    if (e.dueOn > monthEnd) continue;
    if (e.direction === "in") s.toReceiveCents += e.amountCents;
    else {
      s.toPayCents += e.amountCents;
      if (e.dueOn < today) {
        s.overdueBills += 1;
        s.overdueCents += e.amountCents;
      }
    }
  }
  s.balanceCents = s.receivedCents - s.paidCents;
  return s;
}
