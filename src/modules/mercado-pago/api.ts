import "server-only";

import { centsToAmount, type RawOrder } from "./orders";

// The few Mercado Pago endpoints the Zemana calls. Errors never carry the
// response body or the tokens: they may hold personal or secret data.

const API = "https://api.mercadopago.com";
export const AUTHORIZATION_URL = "https://auth.mercadopago.com/authorization";

export type Fetch = typeof fetch;

export class MercadoPagoError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MercadoPagoError";
  }
}

async function call<T>(
  fetchImpl: Fetch,
  path: string,
  init: {
    method: "GET" | "POST";
    token?: string;
    body?: unknown;
    idempotencyKey?: string;
  },
): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.idempotencyKey) headers["x-idempotency-key"] = init.idempotencyKey;
  const response = await fetchImpl(`${API}${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new MercadoPagoError(
      `Mercado Pago respondeu ${response.status} em ${init.method} ${path.split("?")[0]}.`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

// ------------------------------------------------------------------ OAuth

export function authorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(AUTHORIZATION_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", input.state);
  url.searchParams.set("redirect_uri", input.redirectUri);
  return url.toString();
}

export type OAuthTokens = {
  accessToken: string;
  refreshToken: string;
  publicKey: string | null;
  userId: string;
  liveMode: boolean;
  expiresAt: Date;
};

type RawTokens = {
  access_token?: unknown;
  refresh_token?: unknown;
  public_key?: unknown;
  user_id?: unknown;
  live_mode?: unknown;
  expires_in?: unknown;
};

function readTokens(raw: RawTokens, now: Date): OAuthTokens {
  if (
    typeof raw.access_token !== "string" ||
    typeof raw.refresh_token !== "string" ||
    (typeof raw.user_id !== "number" && typeof raw.user_id !== "string")
  ) {
    throw new MercadoPagoError("Resposta do OAuth incompleta.", 502);
  }
  // 180 days when Mercado Pago does not say.
  const seconds =
    typeof raw.expires_in === "number" && raw.expires_in > 0
      ? raw.expires_in
      : 180 * 24 * 3600;
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    publicKey: typeof raw.public_key === "string" ? raw.public_key : null,
    userId: String(raw.user_id),
    liveMode: raw.live_mode === true,
    expiresAt: new Date(now.getTime() + seconds * 1000),
  };
}

export async function exchangeCode(
  input: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
  },
  fetchImpl: Fetch = fetch,
  now: Date = new Date(),
): Promise<OAuthTokens> {
  const raw = await call<RawTokens>(fetchImpl, "/oauth/token", {
    method: "POST",
    body: {
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      grant_type: "authorization_code",
      redirect_uri: input.redirectUri,
    },
  });
  return readTokens(raw, now);
}

export async function refreshTokens(
  input: { clientId: string; clientSecret: string; refreshToken: string },
  fetchImpl: Fetch = fetch,
  now: Date = new Date(),
): Promise<OAuthTokens> {
  const raw = await call<RawTokens>(fetchImpl, "/oauth/token", {
    method: "POST",
    body: {
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    },
  });
  return readTokens(raw, now);
}

// ----------------------------------------------------------------- orders

export async function createOrder(
  input: {
    accessToken: string;
    // Our charge id: the idempotency key and the external reference.
    chargeId: string;
    title: string;
    amountCents: number;
    // ISO 8601 duration, such as "P7D".
    expiresIn: string;
  },
  fetchImpl: Fetch = fetch,
): Promise<RawOrder> {
  const amount = centsToAmount(input.amountCents);
  return call<RawOrder>(fetchImpl, "/v1/orders", {
    method: "POST",
    token: input.accessToken,
    idempotencyKey: input.chargeId,
    body: {
      type: "online",
      processing_mode: "manual",
      total_amount: amount,
      external_reference: input.chargeId,
      expiration_time: input.expiresIn,
      items: [{ title: input.title, quantity: 1, unit_price: amount }],
    },
  });
}

export async function getOrder(
  input: { accessToken: string; orderId: string },
  fetchImpl: Fetch = fetch,
): Promise<RawOrder> {
  return call<RawOrder>(
    fetchImpl,
    `/v1/orders/${encodeURIComponent(input.orderId)}`,
    { method: "GET", token: input.accessToken },
  );
}

// Full refund. The idempotency key keeps a retried click from refunding twice.
export async function refundOrder(
  input: { accessToken: string; orderId: string; idempotencyKey: string },
  fetchImpl: Fetch = fetch,
): Promise<RawOrder> {
  return call<RawOrder>(
    fetchImpl,
    `/v1/orders/${encodeURIComponent(input.orderId)}/refund`,
    {
      method: "POST",
      token: input.accessToken,
      idempotencyKey: input.idempotencyKey,
    },
  );
}
