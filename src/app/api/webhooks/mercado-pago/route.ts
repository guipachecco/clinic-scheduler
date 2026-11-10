import { type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { handleOrderNotification } from "@/modules/mercado-pago/charges";
import { isValidSignature } from "@/modules/mercado-pago/signature";

// Mercado Pago's notifications (Webhooks > Configurar notificações, topic
// "Order (Mercado Pago)"). Only signed notifications are read, and only the
// order id is taken from them: handleOrderNotification fetches the order
// itself before recording anything.
//
// 200 means "done or nothing to do"; 401 a bad signature; 500 asks Mercado
// Pago to try again later.

const ORDER_ID = /^[A-Za-z0-9_-]{1,64}$/;

function isOrderTopic(type: string | null, dataId: string) {
  if (type) return /order/i.test(type);
  return /^ORD/i.test(dataId);
}

export async function POST(request: NextRequest) {
  const secret = env.MP_WEBHOOK_SECRET;
  if (!secret) return new Response("Not configured", { status: 503 });

  const query = request.nextUrl.searchParams;
  let body: { type?: unknown; data?: { id?: unknown } } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // Some notifications carry everything in the query string.
  }
  const dataId =
    query.get("data.id") ??
    (typeof body.data?.id === "string" || typeof body.data?.id === "number"
      ? String(body.data.id)
      : null);
  const type =
    query.get("type") ??
    query.get("topic") ??
    (typeof body.type === "string" ? body.type : null);

  if (
    !isValidSignature({
      header: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId,
      secret,
    })
  ) {
    return new Response("Invalid signature", { status: 401 });
  }

  if (!dataId || !ORDER_ID.test(dataId) || !isOrderTopic(type, dataId)) {
    return new Response("Ignored", { status: 200 });
  }

  try {
    const result = await handleOrderNotification(dataId);
    logger.info("mercado pago notification", { result, type });
    return new Response("OK", { status: 200 });
  } catch (error) {
    logger.error("mercado pago notification failed", { error });
    return new Response("Retry", { status: 500 });
  }
}
