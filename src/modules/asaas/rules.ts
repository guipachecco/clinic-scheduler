// Pure rules for the Pix deposit (sinal). No database, no network: the
// handlers that call these functions own the side effects.

import type { priceDisplay } from "@/db/schema/clinic";

export const DEPOSIT_PERCENT = 15;
export const HOLD_MINUTES = 30;
export const REFUND_WINDOW_HOURS = 24;
// Asaas refuses Pix charges under R$ 5,00 in the sandbox (confirmed in Task 1).
export const MIN_DEPOSIT_CENTS = 500;

type PriceDisplay = (typeof priceDisplay.enumValues)[number];

// Deposit in cents for a service, or null when the service takes no deposit.
// The amount is 15% of the price, rounded up to the cent.
export function depositFor(service: {
  priceCents: number | null;
  priceDisplay: PriceDisplay;
}): number | null {
  if (service.priceCents === null) return null;
  if (
    service.priceDisplay !== "fixed" &&
    service.priceDisplay !== "starting_at"
  ) {
    return null;
  }
  // Integer arithmetic: ceil(cents * 15 / 100) without floating point.
  const deposit = Math.floor((service.priceCents * DEPOSIT_PERCENT + 99) / 100);
  return deposit >= MIN_DEPOSIT_CENTS ? deposit : null;
}

// Exactly 24h before the start still keeps the deposit: refunds need strictly
// more than the window. The clinic always refunds.
export function cancellationOutcome(input: {
  by: "patient" | "clinic";
  startsAt: Date;
  now: Date;
}): "refund" | "keep" {
  if (input.by === "clinic") return "refund";
  const msUntilStart = input.startsAt.getTime() - input.now.getTime();
  return msUntilStart > REFUND_WINDOW_HOURS * 60 * 60 * 1000
    ? "refund"
    : "keep";
}

export type DepositStatus =
  "pending" | "paid" | "expired" | "refunded" | "kept" | "closed";

export type CloseReason =
  "timeout" | "clinic_cancelled" | "manual_confirm" | "charge_failed";

// What to do with a payment that arrives after the deposit was already
// decided. The caller handles a repeat of the stored charge before this.
export function lateArrival(input: {
  status: DepositStatus;
  closeReason: CloseReason | null;
  slotFree: boolean;
}): "confirm" | "refund" | "ignore" {
  const { status, closeReason, slotFree } = input;
  if (status === "refunded" || status === "kept") return "ignore";
  if (status === "paid" || status === "closed") return "refund";
  // Expired for any reason other than the hold timing out: refund, never confirm.
  if (status === "expired" && closeReason !== "timeout") return "refund";
  // Still pending, or expired by timeout: keep the booking only if the slot is free.
  return slotFree ? "confirm" : "refund";
}

function allSameDigit(digits: string): boolean {
  return /^(\d)\1*$/.test(digits);
}

function checkDigit(digits: string, weights: number[]): number {
  const sum = weights.reduce(
    (acc, weight, index) => acc + Number(digits[index]) * weight,
    0,
  );
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

// Validates CPF (11 digits) or CNPJ (14 digits) by their check digits.
// Input is digits only; anything else is invalid.
export function isValidCpfCnpj(digits: string): boolean {
  if (!/^\d+$/.test(digits) || allSameDigit(digits)) return false;

  if (digits.length === 11) {
    const first = checkDigit(digits, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    if (first !== Number(digits[9])) return false;
    const second = checkDigit(digits, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return second === Number(digits[10]);
  }

  if (digits.length === 14) {
    const first = checkDigit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    if (first !== Number(digits[12])) return false;
    const second = checkDigit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return second === Number(digits[13]);
  }

  return false;
}

// Asaas reports the subaccount's general status; only APPROVED accepts charges.
export function accountReady(status: { general: string }): boolean {
  return status.general === "APPROVED";
}
