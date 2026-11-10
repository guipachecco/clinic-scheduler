import { createHmac, timingSafeEqual } from "node:crypto";

// Checks that a notification really came from Mercado Pago. The x-signature
// header carries "ts=<seconds>,v1=<hex>": v1 is the HMAC-SHA256, with the
// application's webhook secret, of
//   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
// where an alphanumeric data.id goes in lower case. A part that is missing is
// left out of the text, as Mercado Pago does.

export function parseSignatureHeader(
  header: string | null,
): { ts: string; v1: string } | null {
  if (!header) return null;
  const parts = new Map<string, string>();
  for (const piece of header.split(",")) {
    const [key, ...rest] = piece.split("=");
    if (key && rest.length > 0) parts.set(key.trim(), rest.join("=").trim());
  }
  const ts = parts.get("ts");
  const v1 = parts.get("v1");
  return ts && v1 ? { ts, v1 } : null;
}

export function signatureManifest(input: {
  dataId: string | null;
  requestId: string | null;
  ts: string;
}): string {
  let manifest = "";
  if (input.dataId) manifest += `id:${input.dataId.toLowerCase()};`;
  if (input.requestId) manifest += `request-id:${input.requestId};`;
  manifest += `ts:${input.ts};`;
  return manifest;
}

export function isValidSignature(input: {
  header: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
}): boolean {
  const parsed = parseSignatureHeader(input.header);
  if (!parsed || !/^[0-9a-f]+$/i.test(parsed.v1)) return false;
  const expected = createHmac("sha256", input.secret)
    .update(
      signatureManifest({
        dataId: input.dataId,
        requestId: input.requestId,
        ts: parsed.ts,
      }),
    )
    .digest();
  const given = Buffer.from(parsed.v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
