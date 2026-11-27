import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt } from "./columns";

// Server errors seen by the app (src/instrumentation.ts, onRequestError), for
// root's monitoring screen. Never personal data: the message is redacted
// (src/lib/logger.ts), the path has no query string, and nothing from the
// request body, headers or cookies is stored. Only app_platform reads and
// writes it (migration 0040); old rows are pruned after 30 days.
export const platformErrors = pgTable(
  "platform_errors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Next.js error digest: the same id the user sees on the error page.
    digest: text("digest"),
    errorName: text("error_name").notNull(),
    message: text("message").notNull(),
    // Request path without the query string, e.g. "/admin/agenda".
    path: text("path").notNull(),
    method: text("method").notNull(),
    // "render", "route", "action" or "proxy" (Next.js routerKind/routeType).
    routeType: text("route_type").notNull(),
    // The file route, e.g. "/admin/(painel)/agenda/page".
    routePath: text("route_path"),
    createdAt: createdAt(),
  },
  (t) => [index("platform_errors_created_at_idx").on(t.createdAt)],
);

// Database latency samples: one when root opens the monitoring screen and at
// most one every few minutes from /api/saude (an uptime monitor can call it).
// Pruned after 30 days.
export const platformHealthChecks = pgTable(
  "platform_health_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Round trip of a trivial query, in milliseconds.
    dbMs: integer("db_ms").notNull(),
    source: text("source").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("platform_health_checks_created_at_idx").on(t.createdAt)],
);

// WhatsApp reminders through Z-API (src/modules/reminders, migration 0043).
// Zemana's one number serves every clinic, so these live outside any clinic
// and only app_platform reads and writes them.

// The code a patient sends to activate her reminders (the button on the
// booking confirmation). It says whose message it is whatever form the
// phone arrives in from Z-API.
export const whatsappOptInCodes = pgTable(
  "whatsapp_opt_in_codes",
  {
    code: text("code").primaryKey(),
    clinicId: uuid("clinic_id").notNull(),
    patientId: uuid("patient_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("whatsapp_opt_in_codes_patient_idx").on(t.patientId)],
);

// The last reminder sent to each WhatsApp sender, so her "1" or "2" reaches
// the right appointment.
export const whatsappPending = pgTable("whatsapp_pending", {
  senderId: text("sender_id").primaryKey(),
  clinicId: uuid("clinic_id").notNull(),
  appointmentId: uuid("appointment_id").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
});

// Reminders sent per day (Brasília), for the number's warm-up: the daily
// limit grows from the first day in this table.
export const whatsappDailySends = pgTable("whatsapp_daily_sends", {
  day: date("day", { mode: "string" }).primaryKey(),
  sent: integer("sent").notNull().default(0),
});

// Every WhatsApp message Zemana's number sent, one row each, for root's
// "Mensagens" screen: the proof of what went to each clinic's patients. The
// phone keeps only its last 4 digits; the text is exactly what was sent.
// Only app_platform reads and writes it (migration 0044).
export const whatsappMessages = pgTable(
  "whatsapp_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id").notNull(),
    appointmentId: uuid("appointment_id"),
    // "reminder", "opt_in" (activation reply) or "reply" (after her 1/2).
    kind: text("kind").notNull(),
    phoneLast4: text("phone_last4").notNull(),
    body: text("body").notNull(),
    ok: boolean("ok").notNull(),
    // Why it failed, redacted (src/lib/logger.ts).
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [
    index("whatsapp_messages_clinic_created_idx").on(t.clinicId, t.createdAt),
    index("whatsapp_messages_created_at_idx").on(t.createdAt),
  ],
);

// Zemana's own money, typed in by root: what came in (a clinic's monthly
// fee) and the bills to pay (Neon, Z-API, accountant...). Cents.
export const zemanaLedger = pgTable(
  "zemana_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // "in" money received, "out" a bill.
    direction: text("direction").notNull(),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    dueOn: date("due_on", { mode: "string" }).notNull(),
    paidOn: date("paid_on", { mode: "string" }),
    clinicId: uuid("clinic_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("zemana_ledger_due_on_idx").on(t.dueOn),
    check("zemana_ledger_direction_check", sql`${t.direction} in ('in', 'out')`),
    check("zemana_ledger_amount_check", sql`${t.amountCents} > 0`),
  ],
);
