import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// Webhook of the WhatsApp Cloud API (Meta app > WhatsApp > Configuração).
// GET is Meta's one-time check of the URL: it echoes hub.challenge when
// hub.verify_token matches. POST carries incoming messages and delivery
// statuses, signed with the app secret as X-Hub-Signature-256. For now they
// are only acknowledged (counts logged, no phone numbers): Meta retries for
// days on anything but 200.
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

type Notification = {
  entry?: {
    changes?: { value?: { messages?: unknown[]; statuses?: unknown[] } }[];
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
  logger.info("whatsapp webhook", {
    messages: values.reduce((n, v) => n + (v.messages?.length ?? 0), 0),
    statuses: values.reduce((n, v) => n + (v.statuses?.length ?? 0), 0),
  });
  return new Response("OK", { status: 200 });
}
