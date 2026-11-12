import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  boolean,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { appointments, clinics, patients, products, services } from "./clinic";
import { createdAt, updatedAt } from "./columns";

// Financial module (docs/financeiro.md). Money is always integer cents (BRL).
// Every table belongs to one clinic, and rows that point to each other carry
// composite (clinic_id, id) foreign keys so the database refuses links across
// clinics. Nothing financial is deleted: payments are reversed, sales and
// expenses are cancelled. Balances and "paid" are always derived from
// installments and payments, never stored.

export const quoteStatus = pgEnum("quote_status", [
  "draft",
  "sent",
  "approved",
  "rejected",
  "cancelled",
]);

export const paymentPlan = pgEnum("payment_plan", [
  "upfront",
  "installments",
  "per_session",
]);

const clinicId = () =>
  uuid("clinic_id")
    .notNull()
    .references(() => clinics.id, { onDelete: "restrict" });

const actor = (name: string) =>
  uuid(name).references(() => users.id, { onDelete: "set null" });

// Forms of payment the clinic accepts (Pix, dinheiro, débito, crédito...).
export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: clinicId(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    unique("payment_methods_clinic_id_id_unique").on(t.clinicId, t.id),
    unique("payment_methods_clinic_name_unique").on(t.clinicId, t.name),
    check(
      "payment_methods_name_check",
      sql`char_length(${t.name}) between 1 and 40`,
    ),
  ],
);

export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: clinicId(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    unique("expense_categories_clinic_id_id_unique").on(t.clinicId, t.id),
    unique("expense_categories_clinic_name_unique").on(t.clinicId, t.name),
    check(
      "expense_categories_name_check",
      sql`char_length(${t.name}) between 1 and 40`,
    ),
  ],
);

// A quote the owner writes for a patient. Only drafts are edited; a sent
// quote stays as it was sent. "Expired" is derived from valid_until.
export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: clinicId(),
    // Sequential per clinic, to talk about it with the patient ("orçamento 12").
    number: integer("number").notNull(),
    patientId: uuid("patient_id").notNull(),
    status: quoteStatus("status").notNull().default("draft"),
    validUntil: date("valid_until", { mode: "string" }).notNull(),
    // Discount on the whole quote, on top of the item discounts.
    discountCents: integer("discount_cents").notNull().default(0),
    // Shown to the patient. Never health information.
    notes: text("notes"),
    createdByUserId: actor("created_by_user_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "quotes_patient_fk",
      columns: [t.clinicId, t.patientId],
      foreignColumns: [patients.clinicId, patients.id],
    }).onDelete("restrict"),
    unique("quotes_clinic_id_id_unique").on(t.clinicId, t.id),
    unique("quotes_clinic_number_unique").on(t.clinicId, t.number),
    index("quotes_patient_idx").on(t.clinicId, t.patientId),
    check("quotes_number_check", sql`${t.number} > 0`),
    check("quotes_discount_check", sql`${t.discountCents} >= 0`),
    check(
      "quotes_notes_check",
      sql`${t.notes} is null or char_length(${t.notes}) <= 500`,
    ),
  ],
);

export const quoteItems = pgTable(
  "quote_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: clinicId(),
    quoteId: uuid("quote_id").notNull(),
    // Exactly one of service and product (quote_items_kind_check).
    serviceId: uuid("service_id"),
    productId: uuid("product_id"),
    serviceName: text("service_name").notNull(),
    sessions: integer("sessions").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    foreignKey({
      name: "quote_items_quote_fk",
      columns: [t.clinicId, t.quoteId],
      foreignColumns: [quotes.clinicId, quotes.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "quote_items_service_fk",
      columns: [t.clinicId, t.serviceId],
      foreignColumns: [services.clinicId, services.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "quote_items_product_fk",
      columns: [t.clinicId, t.productId],
      foreignColumns: [products.clinicId, products.id],
    }).onDelete("restrict"),
    index("quote_items_quote_idx").on(t.quoteId),
    check(
      "quote_items_kind_check",
      sql`num_nonnulls(${t.serviceId}, ${t.productId}) = 1`,
    ),
    check("quote_items_sessions_check", sql`${t.sessions} between 1 and 200`),
    check("quote_items_price_check", sql`${t.unitPriceCents} >= 0`),
    check(
      "quote_items_discount_check",
      sql`${t.discountCents} >= 0 and ${t.discountCents} <= ${t.sessions} * ${t.unitPriceCents}`,
    ),
  ],
);

// The approved quote, with its payment plan. One sale per quote.
export const sales = pgTable(
  "sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: clinicId(),
    quoteId: uuid("quote_id").notNull(),
    patientId: uuid("patient_id").notNull(),
    paymentPlan: paymentPlan("payment_plan").notNull(),
    totalCents: integer("total_cents").notNull(),
    createdByUserId: actor("created_by_user_id"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: "sales_quote_fk",
      columns: [t.clinicId, t.quoteId],
      foreignColumns: [quotes.clinicId, quotes.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "sales_patient_fk",
      columns: [t.clinicId, t.patientId],
      foreignColumns: [patients.clinicId, patients.id],
    }).onDelete("restrict"),
    unique("sales_clinic_id_id_unique").on(t.clinicId, t.id),
    unique("sales_quote_unique").on(t.quoteId),
    index("sales_patient_idx").on(t.clinicId, t.patientId),
    check("sales_total_check", sql`${t.totalCents} >= 0`),
    check(
      "sales_cancellation_check",
      sql`(${t.cancelledAt} is null) = (${t.cancellationReason} is null)`,
    ),
  ],
);

// What was sold, with the number of sessions. Sessions done and scheduled are
// counted from the appointments linked to the item.
export const saleItems = pgTable(
  "sale_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: clinicId(),
    saleId: uuid("sale_id").notNull(),
    // Exactly one of service and product (sale_items_kind_check).
    serviceId: uuid("service_id"),
    productId: uuid("product_id"),
    serviceName: text("service_name").notNull(),
    sessions: integer("sessions").notNull(),
    // Item total after every discount; the sum of the items is the sale total.
    totalCents: integer("total_cents").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    foreignKey({
      name: "sale_items_sale_fk",
      columns: [t.clinicId, t.saleId],
      foreignColumns: [sales.clinicId, sales.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "sale_items_service_fk",
      columns: [t.clinicId, t.serviceId],
      foreignColumns: [services.clinicId, services.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "sale_items_product_fk",
      columns: [t.clinicId, t.productId],
      foreignColumns: [products.clinicId, products.id],
    }).onDelete("restrict"),
    unique("sale_items_clinic_id_id_unique").on(t.clinicId, t.id),
    check(
      "sale_items_kind_check",
      sql`num_nonnulls(${t.serviceId}, ${t.productId}) = 1`,
    ),
    index("sale_items_sale_idx").on(t.saleId),
    check("sale_items_sessions_check", sql`${t.sessions} between 0 and 200`),
    check("sale_items_total_check", sql`${t.totalCents} >= 0`),
  ],
);

// The appointments that are sessions of a sold item. An appointment belongs
// to one item at most. Sessions scheduled and done are counted from here.
export const saleSessions = pgTable(
  "sale_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: clinicId(),
    saleItemId: uuid("sale_item_id").notNull(),
    appointmentId: uuid("appointment_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "sale_sessions_item_fk",
      columns: [t.clinicId, t.saleItemId],
      foreignColumns: [saleItems.clinicId, saleItems.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "sale_sessions_appointment_fk",
      columns: [t.clinicId, t.appointmentId],
      foreignColumns: [appointments.clinicId, appointments.id],
    }).onDelete("restrict"),
    unique("sale_sessions_appointment_unique").on(t.appointmentId),
    index("sale_sessions_item_idx").on(t.saleItemId),
  ],
);

// What the patient owes, in parts. Upfront is one installment, "parcelado" is
// several, and "por sessão" is one per session (linked to the item, and to
// the appointment once the session is scheduled). Paid = the sum of its
// payments not reversed reaches the amount; computed, not stored.
export const installments = pgTable(
  "installments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: clinicId(),
    saleId: uuid("sale_id").notNull(),
    // Only for "por sessão".
    saleItemId: uuid("sale_item_id"),
    appointmentId: uuid("appointment_id"),
    number: integer("number").notNull(),
    amountCents: integer("amount_cents").notNull(),
    // Empty for a "por sessão" installment whose session is not scheduled.
    dueDate: date("due_date", { mode: "string" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "installments_sale_fk",
      columns: [t.clinicId, t.saleId],
      foreignColumns: [sales.clinicId, sales.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "installments_sale_item_fk",
      columns: [t.clinicId, t.saleItemId],
      foreignColumns: [saleItems.clinicId, saleItems.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "installments_appointment_fk",
      columns: [t.clinicId, t.appointmentId],
      foreignColumns: [appointments.clinicId, appointments.id],
    }).onDelete("restrict"),
    unique("installments_clinic_id_id_unique").on(t.clinicId, t.id),
    // A session is paid by one installment at most.
    uniqueIndex("installments_appointment_idx")
      .on(t.appointmentId)
      .where(sql`${t.appointmentId} is not null`),
    index("installments_sale_idx").on(t.saleId),
    index("installments_due_idx").on(t.clinicId, t.dueDate),
    check("installments_amount_check", sql`${t.amountCents} > 0`),
    check("installments_number_check", sql`${t.number} > 0`),
    check(
      "installments_appointment_check",
      sql`${t.appointmentId} is null or ${t.saleItemId} is not null`,
    ),
  ],
);

// A "baixa". Reversed payments stay, struck through, and stop counting.
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: clinicId(),
    installmentId: uuid("installment_id").notNull(),
    // The day the money came in, as the owner says (may be in the past).
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    paymentMethodId: uuid("payment_method_id").notNull(),
    notes: text("notes"),
    createdByUserId: actor("created_by_user_id"),
    createdAt: createdAt(),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedByUserId: actor("reversed_by_user_id"),
    reversalReason: text("reversal_reason"),
  },
  (t) => [
    foreignKey({
      name: "payments_installment_fk",
      columns: [t.clinicId, t.installmentId],
      foreignColumns: [installments.clinicId, installments.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "payments_method_fk",
      columns: [t.clinicId, t.paymentMethodId],
      foreignColumns: [paymentMethods.clinicId, paymentMethods.id],
    }).onDelete("restrict"),
    index("payments_installment_idx").on(t.installmentId),
    index("payments_paid_on_idx").on(t.clinicId, t.paidOn),
    check("payments_amount_check", sql`${t.amountCents} > 0`),
    check(
      "payments_reversal_check",
      sql`(${t.reversedAt} is null) = (${t.reversalReason} is null)`,
    ),
    check(
      "payments_notes_check",
      sql`${t.notes} is null or char_length(${t.notes}) <= 200`,
    ),
  ],
);

// Money received outside a sale: a single appointment paid on the spot
// ("Receber" on the appointment) or anything else ("Nova entrada"), such as a
// product. Reversed receipts stay, struck through, and stop counting; an
// appointment has at most one receipt that counts.
export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: clinicId(),
    appointmentId: uuid("appointment_id"),
    patientId: uuid("patient_id"),
    // What was paid for, as shown in the cash book (the service's name when
    // it comes from an appointment).
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    paymentMethodId: uuid("payment_method_id").notNull(),
    // The day the money came in, as the owner says (may be in the past).
    receivedOn: date("received_on", { mode: "string" }).notNull(),
    notes: text("notes"),
    createdByUserId: actor("created_by_user_id"),
    createdAt: createdAt(),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedByUserId: actor("reversed_by_user_id"),
    reversalReason: text("reversal_reason"),
  },
  (t) => [
    foreignKey({
      name: "receipts_appointment_fk",
      columns: [t.clinicId, t.appointmentId],
      foreignColumns: [appointments.clinicId, appointments.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "receipts_patient_fk",
      columns: [t.clinicId, t.patientId],
      foreignColumns: [patients.clinicId, patients.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "receipts_method_fk",
      columns: [t.clinicId, t.paymentMethodId],
      foreignColumns: [paymentMethods.clinicId, paymentMethods.id],
    }).onDelete("restrict"),
    // One receipt that counts per appointment; a reversal frees it.
    uniqueIndex("receipts_appointment_active_idx")
      .on(t.appointmentId)
      .where(sql`${t.appointmentId} is not null and ${t.reversedAt} is null`),
    index("receipts_received_on_idx").on(t.clinicId, t.receivedOn),
    check("receipts_amount_check", sql`${t.amountCents} > 0`),
    check(
      "receipts_description_check",
      sql`char_length(${t.description}) between 1 and 80`,
    ),
    check(
      "receipts_notes_check",
      sql`${t.notes} is null or char_length(${t.notes}) <= 200`,
    ),
    check(
      "receipts_reversal_check",
      sql`(${t.reversedAt} is null) = (${t.reversalReason} is null)`,
    ),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: clinicId(),
    spentOn: date("spent_on", { mode: "string" }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    categoryId: uuid("category_id").notNull(),
    paymentMethodId: uuid("payment_method_id").notNull(),
    description: text("description"),
    // A refund to a patient points to the sale it refunds.
    saleId: uuid("sale_id"),
    createdByUserId: actor("created_by_user_id"),
    createdAt: createdAt(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledByUserId: actor("cancelled_by_user_id"),
    cancellationReason: text("cancellation_reason"),
  },
  (t) => [
    foreignKey({
      name: "expenses_category_fk",
      columns: [t.clinicId, t.categoryId],
      foreignColumns: [expenseCategories.clinicId, expenseCategories.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "expenses_method_fk",
      columns: [t.clinicId, t.paymentMethodId],
      foreignColumns: [paymentMethods.clinicId, paymentMethods.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "expenses_sale_fk",
      columns: [t.clinicId, t.saleId],
      foreignColumns: [sales.clinicId, sales.id],
    }).onDelete("restrict"),
    index("expenses_spent_on_idx").on(t.clinicId, t.spentOn),
    check("expenses_amount_check", sql`${t.amountCents} > 0`),
    check(
      "expenses_cancellation_check",
      sql`(${t.cancelledAt} is null) = (${t.cancellationReason} is null)`,
    ),
    check(
      "expenses_description_check",
      sql`${t.description} is null or char_length(${t.description}) <= 200`,
    ),
  ],
);

// Every change to an approved sale: who, when, why, and the items, total and
// installments before and after. Shown in order on the sale page.
export const saleRevisions = pgTable(
  "sale_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: clinicId(),
    saleId: uuid("sale_id").notNull(),
    actorUserId: actor("actor_user_id"),
    reason: text("reason").notNull(),
    before: jsonb("before").$type<Record<string, unknown>>().notNull(),
    after: jsonb("after").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "sale_revisions_sale_fk",
      columns: [t.clinicId, t.saleId],
      foreignColumns: [sales.clinicId, sales.id],
    }).onDelete("restrict"),
    index("sale_revisions_sale_idx").on(t.saleId, t.createdAt),
    check(
      "sale_revisions_reason_check",
      sql`char_length(${t.reason}) between 1 and 200`,
    ),
  ],
);

// Names seeded for every clinic (migration 0009 and createClinic).
export const DEFAULT_PAYMENT_METHODS = ["Pix", "Dinheiro", "Débito", "Crédito"];
export const REFUND_CATEGORY = "Devolução a cliente";
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Aluguel",
  "Produtos e materiais",
  "Contas",
  "Taxas de cartão",
  REFUND_CATEGORY,
  "Outros",
];
