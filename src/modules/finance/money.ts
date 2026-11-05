// Pure money rules of the financial module, in integer cents. Client-safe.
// Every split keeps the exact total: the rounding remainder goes to the
// first parts, so the sum of the parts always equals what was split.

// 1000 in 3 parts -> [334, 333, 333].
export function splitAmount(total: number, parts: number): number[] {
  if (!Number.isInteger(total) || total < 0) {
    throw new RangeError("total must be a non-negative integer");
  }
  if (!Number.isInteger(parts) || parts < 1) {
    throw new RangeError("parts must be a positive integer");
  }
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) =>
    i < remainder ? base + 1 : base,
  );
}

export type PricedItem = {
  sessions: number;
  unitPriceCents: number;
  // Discount on this item only.
  discountCents: number;
};

export const itemGross = (item: PricedItem) =>
  item.sessions * item.unitPriceCents - item.discountCents;

// Spreads a discount on the whole quote over the items, in proportion to each
// item's value after its own discount. Shares are rounded down and the
// remainder goes to the first items that still have room, so no item goes
// below zero and the shares add up to the discount.
export function allocateDiscount(values: number[], discount: number): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  if (discount < 0 || discount > sum) {
    throw new RangeError("discount must be between 0 and the items' total");
  }
  if (discount === 0 || sum === 0) return values.map(() => 0);
  const shares = values.map((value) => Math.floor((discount * value) / sum));
  let remainder = discount - shares.reduce((a, b) => a + b, 0);
  for (let i = 0; remainder > 0 && i < values.length; i++) {
    const room = values[i]! - shares[i]!;
    const take = Math.min(room, remainder);
    shares[i]! += take;
    remainder -= take;
  }
  return shares;
}

export type QuoteTotals = {
  // Per item: value after its own discount, then after its share of the
  // quote discount (what the item costs in the sale).
  items: { grossCents: number; netCents: number }[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
};

export function quoteTotals(
  items: PricedItem[],
  quoteDiscountCents: number,
): QuoteTotals {
  const gross = items.map(itemGross);
  const subtotalCents = gross.reduce((a, b) => a + b, 0);
  const shares = allocateDiscount(gross, quoteDiscountCents);
  const net = gross.map((value, i) => value - shares[i]!);
  return {
    items: gross.map((grossCents, i) => ({ grossCents, netCents: net[i]! })),
    subtotalCents,
    discountCents: quoteDiscountCents,
    totalCents: subtotalCents - quoteDiscountCents,
  };
}

// The price of each session of an item: its total split over the sessions.
export const sessionAmounts = (itemTotalCents: number, sessions: number) =>
  splitAmount(itemTotalCents, sessions);

// An installment is paid when its payments not reversed reach its amount.
export function installmentState(input: {
  amountCents: number;
  paidCents: number;
  cancelled: boolean;
  dueDate: string | null;
  today: string;
}): "paid" | "partial" | "open" | "overdue" | "cancelled" {
  if (input.cancelled) return "cancelled";
  if (input.paidCents >= input.amountCents) return "paid";
  if (input.dueDate !== null && input.dueDate < input.today) return "overdue";
  return input.paidCents > 0 ? "partial" : "open";
}
