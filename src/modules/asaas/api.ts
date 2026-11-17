import "server-only";

import { env } from "@/lib/env";

// The few Asaas endpoints the Zemana calls. Errors carry the status and the
// Asaas error codes only: the response body may hold CPF or other personal
// data. The API key is never logged or put in an error.

export type Fetch = typeof fetch;

export class AsaasError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly codes: string[] = [],
  ) {
    super(message);
    this.name = "AsaasError";
  }
}

async function readCodes(response: Response): Promise<string[]> {
  try {
    const body = (await response.json()) as {
      errors?: { code?: unknown }[];
    };
    return (body.errors ?? [])
      .map((entry) => entry.code)
      .filter((code): code is string => typeof code === "string");
  } catch {
    return [];
  }
}

async function call<T>(
  fetchImpl: Fetch,
  apiKey: string,
  path: string,
  init: { method: "GET" | "POST" | "DELETE"; body?: unknown },
): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/json",
    access_token: apiKey,
    "User-Agent": "zemana",
  };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetchImpl(`${env.ASAAS_BASE_URL}${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new AsaasError(
      `Asaas respondeu ${response.status} em ${init.method} ${path.split("?")[0]}.`,
      response.status,
      await readCodes(response),
    );
  }
  return (await response.json()) as T;
}

const WEBHOOK_EVENTS = [
  "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_REFUNDED",
  "PAYMENT_DELETED",
];

// ------------------------------------------------------------- subaccounts

export type SubaccountInput = {
  name: string;
  email: string;
  cpfCnpj: string;
  birthDate?: string;
  companyType?: string;
  mobilePhone: string;
  incomeValue: number;
  address: string;
  addressNumber: string;
  province: string;
  postalCode: string;
  webhookUrl: string;
  webhookToken: string;
  // Where Asaas warns about a paused webhook queue. Asaas requires it.
  webhookEmail: string;
};

export async function createSubaccount(
  apiKey: string,
  input: SubaccountInput,
  fetchImpl: Fetch = fetch,
): Promise<{ id: string; walletId: string; apiKey: string }> {
  const { webhookUrl, webhookToken, webhookEmail, ...account } = input;
  const raw = await call<{ id: string; walletId: string; apiKey: string }>(
    fetchImpl,
    apiKey,
    "/accounts",
    {
      method: "POST",
      body: {
        ...account,
        // Asaas refuses the account when the webhook lacks name, email,
        // enabled, interrupted or apiVersion (sandbox, 17/11/2026).
        webhooks: [
          {
            name: "Zemana",
            url: webhookUrl,
            email: webhookEmail,
            enabled: true,
            interrupted: false,
            apiVersion: 3,
            sendType: "SEQUENTIALLY",
            authToken: webhookToken,
            events: WEBHOOK_EVENTS,
          },
        ],
      },
    },
  );
  return { id: raw.id, walletId: raw.walletId, apiKey: raw.apiKey };
}

export async function getAccountStatus(
  apiKey: string,
  fetchImpl: Fetch = fetch,
): Promise<{
  general: string;
  documentation: string;
  commercialInfo: string;
  bankAccountInfo: string;
}> {
  const raw = await call<{
    general: string;
    documentation: string;
    commercialInfo: string;
    bankAccountInfo: string;
  }>(fetchImpl, apiKey, "/myAccount/status", { method: "GET" });
  return {
    general: raw.general,
    documentation: raw.documentation,
    commercialInfo: raw.commercialInfo,
    bankAccountInfo: raw.bankAccountInfo,
  };
}

// --------------------------------------------------------------- Pix keys

export async function createEvpKey(
  apiKey: string,
  fetchImpl: Fetch = fetch,
): Promise<{ id: string; status: string }> {
  const raw = await call<{ id: string; status: string }>(
    fetchImpl,
    apiKey,
    "/pix/addressKeys",
    { method: "POST", body: { type: "EVP" } },
  );
  return { id: raw.id, status: raw.status };
}

export async function listPixKeys(
  apiKey: string,
  fetchImpl: Fetch = fetch,
): Promise<{ id: string; status: string }[]> {
  const raw = await call<{ data?: { id: string; status: string }[] }>(
    fetchImpl,
    apiKey,
    "/pix/addressKeys",
    { method: "GET" },
  );
  return (raw.data ?? []).map((key) => ({ id: key.id, status: key.status }));
}

// -------------------------------------------------------------- customers

export async function createCustomer(
  apiKey: string,
  input: { name: string; cpfCnpj: string; externalReference: string },
  fetchImpl: Fetch = fetch,
): Promise<{ id: string }> {
  const raw = await call<{ id: string }>(fetchImpl, apiKey, "/customers", {
    method: "POST",
    body: input,
  });
  return { id: raw.id };
}

// --------------------------------------------------------------- payments

export type AsaasPayment = {
  id: string;
  status: string;
  valueCents: number;
  externalReference: string | null;
};

type RawPayment = {
  id: string;
  status: string;
  value: number;
  externalReference?: string | null;
};

function readPayment(raw: RawPayment): AsaasPayment {
  return {
    id: raw.id,
    status: raw.status,
    valueCents: Math.round(raw.value * 100),
    externalReference: raw.externalReference ?? null,
  };
}

export async function createPixPayment(
  apiKey: string,
  input: {
    customer: string;
    valueCents: number;
    dueDate: string;
    externalReference: string;
    description: string;
  },
  fetchImpl: Fetch = fetch,
): Promise<AsaasPayment> {
  const raw = await call<RawPayment>(fetchImpl, apiKey, "/payments", {
    method: "POST",
    body: {
      customer: input.customer,
      billingType: "PIX",
      value: input.valueCents / 100,
      dueDate: input.dueDate,
      externalReference: input.externalReference,
      description: input.description,
    },
  });
  return readPayment(raw);
}

export async function getPayment(
  apiKey: string,
  id: string,
  fetchImpl: Fetch = fetch,
): Promise<AsaasPayment> {
  return readPayment(
    await call<RawPayment>(
      fetchImpl,
      apiKey,
      `/payments/${encodeURIComponent(id)}`,
      { method: "GET" },
    ),
  );
}

export async function getPixQrCode(
  apiKey: string,
  id: string,
  fetchImpl: Fetch = fetch,
): Promise<{ payload: string; encodedImage: string; expirationDate: string }> {
  const raw = await call<{
    payload: string;
    encodedImage: string;
    expirationDate: string;
  }>(fetchImpl, apiKey, `/payments/${encodeURIComponent(id)}/pixQrCode`, {
    method: "GET",
  });
  return {
    payload: raw.payload,
    encodedImage: raw.encodedImage,
    expirationDate: raw.expirationDate,
  };
}

// A payment that is already gone (404) counts as deleted.
export async function deletePayment(
  apiKey: string,
  id: string,
  fetchImpl: Fetch = fetch,
): Promise<void> {
  try {
    await call<unknown>(
      fetchImpl,
      apiKey,
      `/payments/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
  } catch (error) {
    if (error instanceof AsaasError && error.status === 404) return;
    throw error;
  }
}

// Full refund.
export async function refundPayment(
  apiKey: string,
  id: string,
  fetchImpl: Fetch = fetch,
): Promise<AsaasPayment> {
  return readPayment(
    await call<RawPayment>(
      fetchImpl,
      apiKey,
      `/payments/${encodeURIComponent(id)}/refund`,
      { method: "POST" },
    ),
  );
}
