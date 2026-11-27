import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// handleIncoming touches the database (tests/integration covers it); here
// only what reaches it is checked. after() runs the callback right away.
const { handleIncoming } = vi.hoisted(() => ({
  handleIncoming: vi.fn<(from: string, text: string) => Promise<void>>(),
}));
vi.mock("@/modules/reminders/opt-in", () => ({ handleIncoming }));
vi.mock("next/server", () => ({
  after: (callback: () => Promise<void>) => callback(),
}));

// Fictitious tokens and numbers only.
const VERIFY = "verify-token-ficticio-com-32-caracteres!";
const SECRET = "app-secret-ficticio";
const URL_BASE = "https://zemana.test/api/webhooks/whatsapp";

beforeEach(() => {
  vi.stubEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", VERIFY);
  vi.stubEnv("WHATSAPP_APP_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  handleIncoming.mockClear();
});

const route = () => import("./route");

function verifyUrl(token: string) {
  return `${URL_BASE}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=12345`;
}

function signed(body: string, secret = SECRET) {
  return new Request(URL_BASE, {
    method: "POST",
    body,
    headers: {
      "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
    },
  });
}

describe("GET /api/webhooks/whatsapp", () => {
  it("echoes the challenge for the right token", async () => {
    const response = (await route()).GET(new Request(verifyUrl(VERIFY)));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("12345");
  });

  it("refuses a wrong token", async () => {
    const response = (await route()).GET(new Request(verifyUrl("errado")));
    expect(response.status).toBe(403);
  });

  it("says 503 without the verify token", async () => {
    vi.stubEnv("WHATSAPP_WEBHOOK_VERIFY_TOKEN", "");
    const response = (await route()).GET(new Request(verifyUrl(VERIFY)));
    expect(response.status).toBe(503);
  });
});

describe("POST /api/webhooks/whatsapp", () => {
  const body = JSON.stringify({
    entry: [{ changes: [{ value: { messages: [{}], statuses: [{}, {}] } }] }],
  });

  it("accepts a body signed with the app secret", async () => {
    const response = await (await route()).POST(signed(body));
    expect(response.status).toBe(200);
    expect(handleIncoming).not.toHaveBeenCalled();
  });

  it("hands each text message to handleIncoming with her wa_id", async () => {
    const withText = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    from: "5511987654321",
                    type: "text",
                    text: { body: "Código: K7P2Q9" },
                  },
                  { from: "5511987654321", type: "image" },
                ],
              },
            },
          ],
        },
      ],
    });
    const response = await (await route()).POST(signed(withText));
    expect(response.status).toBe(200);
    expect(handleIncoming).toHaveBeenCalledTimes(1);
    expect(handleIncoming).toHaveBeenCalledWith(
      "5511987654321",
      "Código: K7P2Q9",
    );
  });

  it("refuses a body signed with another secret", async () => {
    const response = await (await route()).POST(signed(body, "outro"));
    expect(response.status).toBe(401);
  });

  it("refuses a body without a signature", async () => {
    const response = await (
      await route()
    ).POST(new Request(URL_BASE, { method: "POST", body }));
    expect(response.status).toBe(401);
  });
});
