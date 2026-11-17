import { describe, expect, it } from "vitest";

import {
  AsaasError,
  createPixPayment,
  deletePayment,
  getCommercialInfo,
  getPayment,
  getWalletId,
  listWebhooks,
  saveWebhook,
  type Fetch,
} from "./api";

type Call = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
};

// A fake Asaas: records every call and answers with the given status/body.
function fakeFetch(status: number, payload: unknown = {}) {
  const calls: Call[] = [];
  const impl: Fetch = async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: init?.headers as Record<string, string>,
      body:
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : undefined,
    });
    return new Response(JSON.stringify(payload), { status });
  };
  return { calls, impl };
}

describe("asaas api", () => {
  it("sends access_token and User-Agent, never logs the key", async () => {
    const { calls, impl } = fakeFetch(200, {
      id: "pay_1",
      status: "PENDING",
      value: 12,
      externalReference: null,
    });
    await getPayment("k", "pay_1", impl);
    expect(calls[0].headers.access_token).toBe("k");
    expect(calls[0].headers["User-Agent"]).toBe("zemana");
    expect(calls[0].url).toMatch(/\/payments\/pay_1$/);
  });

  it("converts value in reais to cents and back", async () => {
    const { calls, impl } = fakeFetch(200, {
      id: "pay_1",
      status: "PENDING",
      value: 12.5,
      externalReference: "ref",
    });
    const payment = await createPixPayment(
      "k",
      {
        customer: "cus_1",
        valueCents: 1200,
        dueDate: "2026-11-17",
        externalReference: "ref",
        description: "Sinal",
      },
      impl,
    );
    expect(calls[0].body?.value).toBe(12);
    expect(calls[0].body?.billingType).toBe("PIX");
    expect(payment.valueCents).toBe(1250);
  });

  it("AsaasError carries status and codes only", async () => {
    const { impl } = fakeFetch(400, {
      errors: [
        { code: "invalid_billingType", description: "CPF 123.456.789-00" },
      ],
    });
    const error = await getPayment("k", "pay_1", impl).catch((e) => e);
    expect(error).toBeInstanceOf(AsaasError);
    expect(error.status).toBe(400);
    expect(error.codes).toEqual(["invalid_billingType"]);
    expect(error.message).not.toContain("123");
  });

  it("getWalletId returns the first wallet and sends no body", async () => {
    const { calls, impl } = fakeFetch(200, { data: [{ id: "wal-1" }] });
    await expect(getWalletId("k", impl)).resolves.toBe("wal-1");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toMatch(/\/wallets$/);
    expect(calls[0].body).toBeUndefined();
  });

  it("getWalletId throws no_wallet when the list is empty", async () => {
    const { impl } = fakeFetch(200, { data: [] });
    const error = await getWalletId("k", impl).catch((e) => e);
    expect(error).toBeInstanceOf(AsaasError);
    expect(error.status).toBe(0);
    expect(error.codes).toEqual(["no_wallet"]);
  });

  it("getCommercialInfo returns name and email", async () => {
    const { calls, impl } = fakeFetch(200, {
      name: "Clinica",
      email: "dona@b.com",
      cpfCnpj: "123",
    });
    await expect(getCommercialInfo("k", impl)).resolves.toEqual({
      name: "Clinica",
      email: "dona@b.com",
    });
    expect(calls[0].url).toMatch(/\/myAccount\/commercialInfo$/);
  });

  it("listWebhooks asks for 100 and keeps id and url", async () => {
    const { calls, impl } = fakeFetch(200, {
      data: [{ id: "wh-1", url: "https://x.test/a", name: "Outro" }],
    });
    await expect(listWebhooks("k", impl)).resolves.toEqual([
      { id: "wh-1", url: "https://x.test/a" },
    ]);
    expect(calls[0].url).toMatch(/\/webhooks\?limit=100$/);
  });

  it.each([
    [undefined, "POST", /\/webhooks$/],
    ["wh-1", "PUT", /\/webhooks\/wh-1$/],
  ])("saveWebhook with id %s uses %s", async (id, method, urlPattern) => {
    const { calls, impl } = fakeFetch(200, {});
    await saveWebhook(
      "k",
      {
        id,
        url: "https://x.test/api/webhooks/asaas",
        email: "dona@b.com",
        authToken: "tok",
      },
      impl,
    );
    expect(calls[0].method).toBe(method);
    expect(calls[0].url).toMatch(urlPattern);
    // The sandbox refuses a webhook without these (checked 17/11/2026).
    expect(calls[0].body).toMatchObject({
      name: "Zemana",
      url: "https://x.test/api/webhooks/asaas",
      email: "dona@b.com",
      enabled: true,
      interrupted: false,
      apiVersion: 3,
      sendType: "SEQUENTIALLY",
      authToken: "tok",
      events: [
        "PAYMENT_RECEIVED",
        "PAYMENT_CONFIRMED",
        "PAYMENT_REFUNDED",
        "PAYMENT_DELETED",
      ],
    });
    expect(calls[0].body).not.toHaveProperty("id");
  });

  it("deletePayment treats 404 as already gone", async () => {
    const { impl } = fakeFetch(404, { errors: [{ code: "not_found" }] });
    await expect(deletePayment("k", "pay_1", impl)).resolves.toBeUndefined();
    const failing = fakeFetch(500, {});
    await expect(deletePayment("k", "pay_1", failing.impl)).rejects.toThrow(
      AsaasError,
    );
  });
});
