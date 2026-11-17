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
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { appointments, clinics, patients } from "./clinic";
import { createdAt, updatedAt } from "./columns";
import { payments, sales } from "./finance";

// Pix deposit ("sinal") on Asaas. Each clinic has its own Asaas subaccount and
// the money goes straight to it. The subaccount API key is stored encrypted,
// never in plain text. The enum values mirror DepositStatus and CloseReason in
// src/modules/asaas/rules.ts.

export const asaasAccountStatus = pgEnum("asaas_account_status", [
  "pending",
  "approved",
  "rejected",
]);

export const asaasDepositStatus = pgEnum("asaas_deposit_status", [
  "pending",
  "paid",
  "expired",
  "refunded",
  "kept",
  "closed",
]);

export const asaasCloseReason = pgEnum("asaas_close_reason", [
  "timeout",
  "clinic_cancelled",
  "manual_confirm",
  "charge_failed",
]);

// The subaccount of a clinic. One per clinic.
export const asaasAccounts = pgTable("asaas_accounts", {
  clinicId: uuid("clinic_id")
    .primaryKey()
    .references(() => clinics.id, { onDelete: "restrict" }),
  accountId: text("account_id").notNull(),
  walletId: text("wallet_id").notNull(),
  apiKeyEnc: text("api_key_enc").notNull(),
  status: asaasAccountStatus("status").notNull().default("pending"),
  pixKeyReady: boolean("pix_key_ready").notNull().default(false),
  depositEnabled: boolean("deposit_enabled").notNull().default(true),
  // Short Asaas code of the last failure (for example "limit_exceeded").
  lastError: text("last_error"),
  activatedByUserId: uuid("activated_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// The Asaas customer made for a patient. The full CPF is never stored, only
// its last 4 digits, to show "CPF final 4725".
export const asaasCustomers = pgTable(
  "asaas_customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id").notNull(),
    customerId: text("customer_id").notNull(),
    cpfCnpjLast4: text("cpf_cnpj_last4").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "asaas_customers_patient_fk",
      columns: [t.clinicId, t.patientId],
      foreignColumns: [patients.clinicId, patients.id],
    }).onDelete("restrict"),
    unique("asaas_customers_clinic_patient_unique").on(t.clinicId, t.patientId),
    check("asaas_customers_last4_check", sql`${t.cpfCnpjLast4} ~ '^[0-9]{4}$'`),
  ],
);

// The deposit held for one appointment. Its id is the externalReference of the
// Asaas charge. The row exists before the charge does, so charge_id is null at
// first.
export const asaasDeposits = pgTable(
  "asaas_deposits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "restrict" }),
    appointmentId: uuid("appointment_id").notNull(),
    patientId: uuid("patient_id").notNull(),
    amountCents: integer("amount_cents").notNull(),
    chargeId: text("charge_id"),
    status: asaasDepositStatus("status").notNull().default("pending"),
    closeReason: asaasCloseReason("close_reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    paymentId: uuid("payment_id"),
    saleId: uuid("sale_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "asaas_deposits_appointment_fk",
      columns: [t.clinicId, t.appointmentId],
      foreignColumns: [appointments.clinicId, appointments.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "asaas_deposits_patient_fk",
      columns: [t.clinicId, t.patientId],
      foreignColumns: [patients.clinicId, patients.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "asaas_deposits_sale_fk",
      columns: [t.clinicId, t.saleId],
      foreignColumns: [sales.clinicId, sales.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "asaas_deposits_payment_fk",
      columns: [t.paymentId],
      foreignColumns: [payments.id],
    }).onDelete("restrict"),
    unique("asaas_deposits_appointment_unique").on(t.appointmentId),
    uniqueIndex("asaas_deposits_charge_idx")
      .on(t.chargeId)
      .where(sql`${t.chargeId} is not null`),
    index("asaas_deposits_status_idx").on(t.status, t.expiresAt),
    check("asaas_deposits_amount_check", sql`${t.amountCents} > 0`),
    check(
      "asaas_deposits_paid_check",
      sql`(${t.status} in ('paid', 'kept', 'refunded')) = (${t.paymentId} is not null)`,
    ),
    check(
      "asaas_deposits_close_reason_check",
      sql`${t.closeReason} is null or ${t.status} in ('expired', 'closed')`,
    ),
  ],
);
