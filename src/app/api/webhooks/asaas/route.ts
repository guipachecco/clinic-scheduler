import { createHash, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { handleDepositNotification } from "@/modules/asaas/deposits";

// Asaas's notifications for the clinics' own accounts (registered in each
// owner's account when she connects it: PAYMENT_RECEIVED, PAYMENT_CONFIRMED, PAYMENT_REFUNDED...). Only
// notifications carrying our token are read, and only the payment id and its
// externalReference (the deposit id) are taken from them:
// handleDepositNotification fetches the payment itself before acting.
//
// 200 means "done or nothing to do"; 401 a wrong token; 503 Asaas is not set
// up here; 500 asks Asaas to try again later.

const PAYMENT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Constant-time comparison; hashing first makes both sides the same length.
function sameToken(given: string | null, expected: string): boolean {
  if (given === null) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

export async function POST(request: Request) {
  const token = env.ASAAS_WEBHOOK_TOKEN;
  if (!token) return new Response("Not configured", { status: 503 });
  if (!sameToken(request.headers.get("asaas-access-token"), token)) {
    return new Response("Invalid token", { status: 401 });
  }

  let body: { payment?: { id?: unknown; externalReference?: unknown } } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response("Ignored", { status: 200 });
  }
  const paymentId = body.payment?.id;
  const depositId = body.payment?.externalReference;
  if (
    typeof paymentId !== "string" ||
    !PAYMENT_ID.test(paymentId) ||
    typeof depositId !== "string" ||
    !UUID.test(depositId)
  ) {
    return new Response("Ignored", { status: 200 });
  }

  try {
    const result = await handleDepositNotification(depositId, paymentId);
    logger.info("asaas notification", { result });
    return new Response("OK", { status: 200 });
  } catch (error) {
    logger.error("asaas notification failed", { error });
    return new Response("Retry", { status: 500 });
  }
}
