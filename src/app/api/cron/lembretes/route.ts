import { timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendDueReminders } from "@/modules/reminders/reminders";

// The WhatsApp reminder run: every 15 min from cron-job.org, plus the daily
// Vercel cron (vercel.json). Both call it with "Authorization: Bearer
// <CRON_SECRET>"; any other call is refused. Answers only the counts.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" };

function authorized(header: string | null): boolean {
  const secret = env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return Response.json({ ok: false }, { status: 401, headers: NO_STORE });
  }
  try {
    const run = await sendDueReminders();
    logger.info("whatsapp reminders sent", run);
    return Response.json({ ok: true, ...run }, { headers: NO_STORE });
  } catch (error) {
    logger.error("whatsapp reminders: run failed", { error });
    return Response.json({ ok: false }, { status: 500, headers: NO_STORE });
  }
}
