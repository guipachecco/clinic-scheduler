import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { after } from "next/server";

import { env } from "@/lib/env";
import { logger, redactText } from "@/lib/logger";
import { handleIncoming } from "@/modules/reminders/opt-in";

// Webhook of the WhatsApp Cloud API (Meta app > WhatsApp > Configuração).
// GET is Meta's one-time check of the URL: it echoes hub.challenge when
// hub.verify_token matches. POST carries incoming messages and delivery
// statuses, signed with the app secret as X-Hub-Signature-256. Her text
// messages go to the opt-in / "1"-"2" handling; statuses are only counted.
// Meta retries for days on anything but 200.
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

type Status = {
  status?: unknown;
  errors?: {
    code?: unknown;
    title?: unknown;
    error_data?: { details?: unknown };
  }[];
};

type Notification = {
  entry?: {
    changes?: {
      value?: { messages?: Incoming[]; statuses?: Status[] };
    }[];
  }[];
};

// Why Meta did not deliver a message (sent, delivered and read are only
// counted). Code, title and details, phone numbers taken out.
function failureReasons(statuses: Status[]): string[] {
  return statuses
    .filter((status) => status.status === "failed")
    .flatMap((status) => status.errors ?? [])
    .map((error) =>
      redactText(
        [error.code, error.title, error.error_data?.details]
          .filter(
            (part) => typeof part === "string" || typeof part === "number",
          )
          .join(" | "),
      ).slice(0, 300),
    );
}

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
  const statuses = values.flatMap((value) => value.statuses ?? []);
  logger.info("whatsapp webhook", {
    messages: values.reduce((n, v) => n + (v.messages?.length ?? 0), 0),
    statuses: statuses.map((status) => String(status.status)).join(","),
  });
  for (const reason of failureReasons(statuses)) {
    logger.error("whatsapp webhook: message failed", { reason });
  }
  // Her text messages (activation code, "1"/"2"); ours never come here.
  const texts = values
    .flatMap((value) => value.messages ?? [])
    .flatMap((message) =>
      message.type === "text" &&
      typeof message.from === "string" &&
      message.from.length <= 64 &&
      typeof message.text?.body === "string" &&
      message.text.body.length <= 500
        ? [{ from: message.from, body: message.text.body }]
        : [],
    );
  if (texts.length > 0) {
    // Meta wants the 200 fast; a failure is only logged (she can resend).
    after(async () => {
      for (const { from, body } of texts) {
        await handleIncoming(from, body).catch((error: unknown) => {
          logger.error("whatsapp webhook: handling failed", { error });
        });
      }
    });
  }
  return new Response("OK", { status: 200 });
}
