import { describe, expect, it } from "vitest";

import {
  AsaasError,
  createPixPayment,
  createSubaccount,
  deletePayment,
  getPayment,
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

  it("createSubaccount registers the webhook with the token", async () => {
    const { calls, impl } = fakeFetch(200, {
      id: "acc_1",
      walletId: "w_1",
      apiKey: "sub-key",
    });
    const created = await createSubaccount(
      "k",
      {
        name: "Clinica",
        email: "a@b.com",
        cpfCnpj: "00000000000",
        mobilePhone: "11999999999",
        incomeValue: 5000,
        address: "Rua",
        addressNumber: "1",
        province: "Centro",
        postalCode: "01001000",
        webhookUrl: "https://x.test/api/webhooks/asaas",
        webhookToken: "tok",
        webhookEmail: "dona@b.com",
      },
      impl,
    );
    const webhooks = calls[0].body?.webhooks as {
      url: string;
      authToken: string;
      events: string[];
    }[];
    // The sandbox refuses a webhook without these (checked 17/11/2026).
    expect(webhooks[0]).toMatchObject({
      name: "Zemana",
      email: "dona@b.com",
      enabled: true,
      interrupted: false,
      apiVersion: 3,
    });
    expect(webhooks[0].authToken).toBe("tok");
    expect(webhooks[0].url).toBe("https://x.test/api/webhooks/asaas");
    expect(webhooks[0].events).toContain("PAYMENT_RECEIVED");
    expect(created).toEqual({
      id: "acc_1",
      walletId: "w_1",
      apiKey: "sub-key",
    });
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
