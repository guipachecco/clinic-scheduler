import "server-only";

import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import { platformDb } from "@/db/client";
import { whatsappMessages } from "@/db/schema";
import { logger, redactText } from "@/lib/logger";

// One row per WhatsApp message Zemana's number sent (whatsapp_messages), the
// proof root shows on "Mensagens". Recording never breaks a send: a failure
// here is only logged.

export type MessageKind = "reminder" | "opt_in" | "reply";

export async function recordMessage(input: {
  clinicId: string;
  appointmentId?: string | null;
  kind: MessageKind;
  to: string;
  body: string;
  error?: unknown;
}): Promise<void> {
  const failed = input.error !== undefined;
  await platformDb
    .insert(whatsappMessages)
    .values({
      clinicId: input.clinicId,
      appointmentId: input.appointmentId ?? null,
      kind: input.kind,
      phoneLast4: input.to.replace(/\D/g, "").slice(-4),
      body: input.body,
      ok: !failed,
      error: failed
        ? redactText(
            input.error instanceof Error
              ? input.error.message
              : String(input.error),
          ).slice(0, 500)
        : null,
    })
    .catch((error: unknown) => {
      logger.error("whatsapp message log failed", {
        clinicId: input.clinicId,
        error,
      });
    });
}

// Messages between from (inclusive) and to (exclusive), newest first, of one
// clinic or all.
export async function listMessages(filter: {
  clinicId?: string;
  from: Date;
  to: Date;
  limit?: number;
}) {
  return platformDb
    .select()
    .from(whatsappMessages)
    .where(
      and(
        gte(whatsappMessages.createdAt, filter.from),
        lt(whatsappMessages.createdAt, filter.to),
        filter.clinicId
          ? eq(whatsappMessages.clinicId, filter.clinicId)
          : undefined,
      ),
    )
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(filter.limit ?? 1000);
}

// Totals per clinic in the same window, failures apart.
export async function messageTotals(filter: { from: Date; to: Date }) {
  return platformDb
    .select({
      clinicId: whatsappMessages.clinicId,
      sent: sql<number>`count(*) filter (where ${whatsappMessages.ok})::int`,
      failed: sql<number>`count(*) filter (where not ${whatsappMessages.ok})::int`,
      reminders: sql<number>`count(*) filter (where ${whatsappMessages.ok} and ${whatsappMessages.kind} = 'reminder')::int`,
    })
    .from(whatsappMessages)
    .where(
      and(
        gte(whatsappMessages.createdAt, filter.from),
        lt(whatsappMessages.createdAt, filter.to),
      ),
    )
    .groupBy(whatsappMessages.clinicId);
}
