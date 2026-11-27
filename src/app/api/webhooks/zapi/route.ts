import { createHash, timingSafeEqual } from "node:crypto";

import { after } from "next/server";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { handleIncoming } from "@/modules/reminders/opt-in";

// Z-API Omni's MESSAGE_RECEIVED webhook for Zemana's WhatsApp number
// (registered with auth BEARER = ZAPI_WEBHOOK_TOKEN). Only the sender's
// identifier and the text of messages she sent are read; ours (from_me) and
// anything without text are ignored. Z-API wants a 2xx within 5 s, so the
// work runs after the answer (after()); a failure there is only logged, since
// her message is not lost: she can send it again.
//
// 200 means "received"; 401 a wrong token; 503 not set up here.

// Constant-time comparison; hashing first makes both sides the same length.
function sameToken(given: string | null, expected: string): boolean {
  if (given === null) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(`Bearer ${expected}`));
}

type Incoming = {
  message?: {
    metadata?: { from_me?: unknown };
    sender?: { identifier?: unknown };
    contents?: { type?: unknown; message?: unknown }[];
  };
};

export async function POST(request: Request) {
  const token = env.ZAPI_WEBHOOK_TOKEN;
  if (!token) return new Response("Not configured", { status: 503 });
  if (!sameToken(request.headers.get("authorization"), token)) {
    return new Response("Invalid token", { status: 401 });
  }

  let body: Incoming = {};
  try {
    body = (await request.json()) as Incoming;
  } catch {
    return new Response("Ignored", { status: 200 });
  }
  const message = body.message;
  const senderId = message?.sender?.identifier;
  const text = message?.contents?.find(
    (content) => content.type === "TEXT",
  )?.message;
  if (
    !message ||
    message.metadata?.from_me === true ||
    typeof senderId !== "string" ||
    senderId.length > 64 ||
    typeof text !== "string" ||
    text.length > 500
  ) {
    return new Response("Ignored", { status: 200 });
  }

  after(async () => {
    try {
      await handleIncoming(senderId, text);
    } catch (error) {
      logger.error("zapi webhook: handling failed", { error });
    }
  });
  return new Response("OK", { status: 200 });
}
