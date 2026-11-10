// Pure rules about Mercado Pago orders (Checkout Pro via the Orders API).

// Mercado Pago writes money as a decimal string: "150.00".
export function centsToAmount(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new Error("Valor em centavos inválido.");
  }
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function amountToCents(amount: string | number | null | undefined) {
  if (amount === null || amount === undefined) return null;
  const text = String(amount).trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

export type OrderSnapshot = {
  status: string;
  statusDetail: string | null;
  totalPaidCents: number | null;
};

// What an order means for its charge. Statuses from the "Status de order"
// page: processed/accredited is paid; refunded is a full refund; canceled
// (one L) covers cancelled and expired; failed means the attempt failed and
// the patient may try again with the same link.
export type OrderOutcome = "paid" | "refunded" | "closed" | "waiting";

export function orderOutcome(order: OrderSnapshot): OrderOutcome {
  const status = order.status.toLowerCase();
  if (status === "processed") return "paid";
  if (status === "refunded" || status === "charged_back") return "refunded";
  if (status === "canceled" || status === "cancelled" || status === "expired") {
    return "closed";
  }
  return "waiting";
}

// Fields of an order as Mercado Pago returns them. Only what we read.
export type RawOrder = {
  id?: unknown;
  status?: unknown;
  status_detail?: unknown;
  total_amount?: unknown;
  total_paid_amount?: unknown;
  external_reference?: unknown;
  checkout_url?: unknown;
};

export function readOrder(raw: RawOrder): OrderSnapshot & {
  id: string;
  externalReference: string | null;
} {
  if (typeof raw.id !== "string" || typeof raw.status !== "string") {
    throw new Error("Resposta do Mercado Pago sem id ou status.");
  }
  return {
    id: raw.id,
    status: raw.status,
    statusDetail:
      typeof raw.status_detail === "string" ? raw.status_detail : null,
    totalPaidCents: amountToCents(
      typeof raw.total_paid_amount === "string" ||
        typeof raw.total_paid_amount === "number"
        ? raw.total_paid_amount
        : null,
    ),
    externalReference:
      typeof raw.external_reference === "string"
        ? raw.external_reference
        : null,
  };
}
