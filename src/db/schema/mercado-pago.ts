import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { clinics } from "./clinic";
import { createdAt, updatedAt } from "./columns";
import { installments, payments } from "./finance";

// Mercado Pago (docs/mercado-pago.md). Each clinic connects its own account by
// OAuth, and the money goes straight to it. Tokens are stored encrypted
// (src/modules/mercado-pago/crypto.ts), never in plain text.

// The account a clinic connected. One per clinic; disconnecting deletes it.
export const mercadoPagoAccounts = pgTable(
  "mercado_pago_accounts",
  {
    clinicId: uuid("clinic_id")
      .primaryKey()
      .references(() => clinics.id, { onDelete: "restrict" }),
    // The seller's id at Mercado Pago (OAuth user_id).
    mpUserId: text("mp_user_id").notNull(),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc").notNull(),
    publicKey: text("public_key"),
    liveMode: boolean("live_mode").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    connectedByUserId: uuid("connected_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    connectedAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "mercado_pago_accounts_user_check",
      sql`char_length(${t.mpUserId}) between 1 and 40`,
    ),
  ],
);

export const mercadoPagoChargeStatus = pgEnum("mercado_pago_charge_status", [
  // Link created, waiting for the patient.
  "pending",
  // Paid: the payment row was recorded.
  "paid",
  // Paid at Mercado Pago, but the installment was already settled here. The
  // owner must refund it; nothing was recorded.
  "conflict",
  // Refunded or charged back after being paid: the payment was reversed.
  "refunded",
  // Cancelled or expired before being paid.
  "closed",
]);

// A payment link (a Checkout Pro order) for one installment.
export const mercadoPagoCharges = pgTable(
  "mercado_pago_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    installmentId: uuid("installment_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    orderId: text("order_id").notNull(),
    checkoutUrl: text("checkout_url").notNull(),
    status: mercadoPagoChargeStatus("status").notNull().default("pending"),
    statusDetail: text("status_detail"),
    paymentId: uuid("payment_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "mercado_pago_charges_installment_fk",
      columns: [t.clinicId, t.installmentId],
      foreignColumns: [installments.clinicId, installments.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "mercado_pago_charges_payment_fk",
      columns: [t.paymentId],
      foreignColumns: [payments.id],
    }).onDelete("restrict"),
    uniqueIndex("mercado_pago_charges_order_idx").on(t.orderId),
    uniqueIndex("mercado_pago_charges_payment_idx")
      .on(t.paymentId)
      .where(sql`${t.paymentId} is not null`),
    index("mercado_pago_charges_installment_idx").on(t.installmentId),
    check("mercado_pago_charges_amount_check", sql`${t.amountCents} > 0`),
    check(
      "mercado_pago_charges_paid_check",
      sql`(${t.status} in ('paid', 'refunded')) = (${t.paymentId} is not null)`,
    ),
  ],
);
