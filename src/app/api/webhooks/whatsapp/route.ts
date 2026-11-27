import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { after } from "next/server";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { handleIncoming } from "@/modules/reminders/opt-in";

// Webhook of the WhatsApp Cloud API (Meta app > WhatsApp > Configuração).
// GET is Meta's one-time check of the URL: it echoes hub.challenge when
// hub.verify_token matches. POST carries incoming messages and delivery
// statuses, signed with the app secret as X-Hub-Signature-256. The text of
// each message a patient sent goes to handleIncoming (activation code, "1"/
// "2") after the answer (after()): Meta retries for days on anything but a
// quick 200, and a failure there is only logged, since she can send again.
// Statuses are only counted (no phone numbers in the log).
//
// 200 means "received"; 401/403 a wrong signature or token; 503 not set up.

// Constant-time comparison; hashing first makes both sides the same length.
function same(given: string | null, expected: string): boolean {
  if (given === null) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

export function GET(request: Request) {
  const token = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!token) return new Response("Not configured", { status: 503 });
  const params = new URL(request.url).searchParams;
  const challenge = params.get("hub.challenge");
  if (
    params.get("hub.mode") !== "subscribe" ||
    !same(params.get("hub.verify_token"), token) ||
    challenge === null
  ) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

type Incoming = { from?: unknown; type?: unknown; text?: { body?: unknown } };

type Notification = {
  entry?: {
    changes?: {
      value?: { messages?: Incoming[]; statuses?: unknown[] };
    }[];
  }[];
};

export async function POST(request: Request) {
  const secret = env.WHATSAPP_APP_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });

  // The signature covers the raw bytes, so read them before parsing.
  const raw = await request.text();
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  if (!same(request.headers.get("x-hub-signature-256"), expected)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: Notification = {};
  try {
    body = JSON.parse(raw) as Notification;
  } catch {
    return new Response("Ignored", { status: 200 });
  }
  const values = (body.entry ?? []).flatMap((entry) =>
    (entry.changes ?? []).map((change) => change.value ?? {}),
  );
  // Text messages only; her wa_id is digits ("554791037244").
  const texts = values
    .flatMap((value) => value.messages ?? [])
    .flatMap((message) => {
      const from = message.from;
      const text = message.text?.body;
      return message.type === "text" &&
        typeof from === "string" &&
        /^\d{8,20}$/.test(from) &&
        typeof text === "string" &&
        text.length <= 500
        ? [{ from, text }]
        : [];
    });
  logger.info("whatsapp webhook", {
    messages: texts.length,
    statuses: values.reduce((n, v) => n + (v.statuses?.length ?? 0), 0),
  });
  if (texts.length > 0) {
    after(async () => {
      for (const { from, text } of texts) {
        try {
          await handleIncoming(from, text);
        } catch (error) {
          logger.error("whatsapp webhook: handling failed", { error });
        }
      }
    });
  }
  return new Response("OK", { status: 200 });
}
