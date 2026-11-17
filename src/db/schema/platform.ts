import { index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";

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
