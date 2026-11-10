import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { decryptToken, encryptToken, tokenKey } from "./crypto";
import {
  amountToCents,
  centsToAmount,
  orderOutcome,
  readOrder,
} from "./orders";
import {
  isValidSignature,
  parseSignatureHeader,
  signatureManifest,
} from "./signature";

describe("token encryption", () => {
  const key = tokenKey("a".repeat(32));

  it("round-trips and never stores the plain token", () => {
    const sealed = encryptToken("APP_USR-segredo", key);
    expect(sealed).not.toContain("segredo");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(decryptToken(sealed, key)).toBe("APP_USR-segredo");
  });

  it("uses a fresh nonce each time", () => {
    expect(encryptToken("x", key)).not.toBe(encryptToken("x", key));
  });

  it("refuses another key and tampered data", () => {
    const sealed = encryptToken("APP_USR-segredo", key);
    expect(() => decryptToken(sealed, tokenKey("b".repeat(32)))).toThrow();
    const parts = sealed.split(".");
    parts[3] = Buffer.from("outra coisa").toString("base64url");
    expect(() => decryptToken(parts.join("."), key)).toThrow();
    expect(() => decryptToken("texto-simples", key)).toThrow();
  });
});

describe("webhook signature", () => {
  const secret = "segredo-do-webhook";
  const sign = (manifest: string) =>
    createHmac("sha256", secret).update(manifest).digest("hex");

  it("builds the manifest with a lower-case id", () => {
    expect(
      signatureManifest({ dataId: "ORD01ABC", requestId: "req-1", ts: "17" }),
    ).toBe("id:ord01abc;request-id:req-1;ts:17;");
    expect(signatureManifest({ dataId: null, requestId: null, ts: "17" })).toBe(
      "ts:17;",
    );
  });

  it("parses the header in any order", () => {
    expect(parseSignatureHeader("v1=abc, ts=123")).toEqual({
      ts: "123",
      v1: "abc",
    });
    expect(parseSignatureHeader("ts=123")).toBeNull();
    expect(parseSignatureHeader(null)).toBeNull();
  });

  it("accepts the right signature and refuses anything else", () => {
    const v1 = sign("id:ord01abc;request-id:req-1;ts:1704908010;");
    const good = {
      header: `ts=1704908010,v1=${v1}`,
      requestId: "req-1",
      dataId: "ORD01ABC",
      secret,
    };
    expect(isValidSignature(good)).toBe(true);
    expect(isValidSignature({ ...good, dataId: "ORD01ABD" })).toBe(false);
    expect(isValidSignature({ ...good, requestId: "req-2" })).toBe(false);
    expect(isValidSignature({ ...good, secret: "outro" })).toBe(false);
    expect(isValidSignature({ ...good, header: "ts=1704908010,v1=zz" })).toBe(
      false,
    );
    expect(isValidSignature({ ...good, header: null })).toBe(false);
  });
});

describe("order amounts", () => {
  it("writes cents as Mercado Pago's decimal string", () => {
    expect(centsToAmount(15000)).toBe("150.00");
    expect(centsToAmount(1)).toBe("0.01");
    expect(centsToAmount(12345)).toBe("123.45");
    expect(() => centsToAmount(-1)).toThrow();
    expect(() => centsToAmount(1.5)).toThrow();
  });

  it("reads amounts back into cents", () => {
    expect(amountToCents("150.00")).toBe(15000);
    expect(amountToCents("150.5")).toBe(15050);
    expect(amountToCents("150")).toBe(15000);
    expect(amountToCents(150.5)).toBe(15050);
    expect(amountToCents("abc")).toBeNull();
    expect(amountToCents(null)).toBeNull();
  });
});

describe("order outcome", () => {
  const outcome = (status: string) =>
    orderOutcome({ status, statusDetail: null, totalPaidCents: null });

  it("maps the order statuses", () => {
    expect(outcome("processed")).toBe("paid");
    expect(outcome("refunded")).toBe("refunded");
    expect(outcome("canceled")).toBe("closed");
    expect(outcome("expired")).toBe("closed");
    expect(outcome("created")).toBe("waiting");
    expect(outcome("processing")).toBe("waiting");
    expect(outcome("failed")).toBe("waiting");
    expect(outcome("action_required")).toBe("waiting");
  });

  it("reads only the fields it needs", () => {
    expect(
      readOrder({
        id: "ORD1",
        status: "processed",
        status_detail: "accredited",
        total_paid_amount: "150.00",
        external_reference: "c1",
      }),
    ).toEqual({
      id: "ORD1",
      status: "processed",
      statusDetail: "accredited",
      totalPaidCents: 15000,
      externalReference: "c1",
    });
    expect(() => readOrder({ status: "processed" })).toThrow();
  });
});
