import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "@/lib/env";

// Fictitious numbers, ids and tokens only.
let outbox: string;

beforeEach(async () => {
  outbox = await mkdtemp(path.join(tmpdir(), "whatsapp-outbox-"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  await rm(outbox, { recursive: true, force: true });
});

const message = {
  to: "5511987654321",
  params: ["Maria", "Clínica Teste", "quinta-feira, 19/11", "14:30", "Corte"],
};

describe("sendWhatsAppTemplate", () => {
  it("without WHATSAPP_TOKEN writes the message to WHATSAPP_OUTBOX_DIR", async () => {
    vi.stubEnv("WHATSAPP_TOKEN", "");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "");
    vi.stubEnv("WHATSAPP_OUTBOX_DIR", outbox);
    vi.resetModules();
    const { readWhatsAppOutbox, sendWhatsAppTemplate } =
      await import("./whatsapp");
    const fetchMock = vi.fn();

    await sendWhatsAppTemplate(message, fetchMock);

    const sent = await readWhatsAppOutbox(outbox);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ ...message, template: "lembrete_horario" });
    expect(sent[0]!.text).toContain("Olá, Maria!");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("with the Meta keys sends the approved template through the Cloud API", async () => {
    vi.stubEnv("WHATSAPP_TOKEN", "token-ficticio-da-meta");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123456789012345");
    vi.stubEnv("WHATSAPP_OUTBOX_DIR", outbox);
    vi.resetModules();
    const { readWhatsAppOutbox, sendWhatsAppTemplate } =
      await import("./whatsapp");
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ messages: [{ id: "x" }] })),
    );

    await sendWhatsAppTemplate(message, fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://graph.facebook.com/v23.0/123456789012345/messages",
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer token-ficticio-da-meta",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5511987654321",
      type: "template",
      template: {
        name: "lembrete_horario",
        language: { code: "pt_BR" },
        components: [
          {
            type: "body",
            parameters: message.params.map((text) => ({ type: "text", text })),
          },
        ],
      },
    });
    expect(await readWhatsAppOutbox(outbox)).toEqual([]);
  });

  it("without the Meta keys but with Z-API Omni sends the reminder as text", async () => {
    vi.stubEnv("WHATSAPP_TOKEN", "");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "");
    vi.stubEnv("ZAPI_INSTANCE_ID", "CANALFICTICIO");
    vi.stubEnv("ZAPI_TOKEN", "token-ficticio-zapi");
    vi.stubEnv("WHATSAPP_OUTBOX_DIR", outbox);
    vi.resetModules();
    const { readWhatsAppOutbox, sendWhatsAppTemplate } =
      await import("./whatsapp");
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ messageId: "x" })),
    );

    await sendWhatsAppTemplate(message, fetchMock);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://api.omni.z-api.io/v1/channels/CANALFICTICIO/messages",
    );
    expect(init.headers).toMatchObject({
      Authorization: "Bearer token-ficticio-zapi",
    });
    const body = JSON.parse(init.body as string);
    expect(body.recipient).toEqual({ identifier: "5511987654321" });
    expect(body.content.type).toBe("TEXT");
    expect(body.content.body.message).toContain("Olá, Maria!");
    expect(await readWhatsAppOutbox(outbox)).toEqual([]);
  });

  it("throws Meta's reason without the phone number", async () => {
    vi.stubEnv("WHATSAPP_TOKEN", "token-ficticio-da-meta");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123456789012345");
    vi.resetModules();
    const { sendWhatsAppTemplate } = await import("./whatsapp");
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 131026,
              message: "Message undeliverable to +5511987654321",
            },
          }),
          { status: 400 },
        ),
    );

    const failure = sendWhatsAppTemplate(message, fetchMock);
    await expect(failure).rejects.toThrow(/Meta 400/);
    await expect(failure).rejects.not.toThrow(/987654321/);
  });
});

describe("WhatsApp variables in parseServerEnv", () => {
  const base = {
    DATABASE_URL_AUTH: "postgres://a:b@localhost:5432/x",
    DATABASE_URL_PANEL: "postgres://a:b@localhost:5432/x",
    DATABASE_URL_CLIENT: "postgres://a:b@localhost:5432/x",
    DATABASE_URL_PLATFORM: "postgres://a:b@localhost:5432/x",
    BETTER_AUTH_SECRET: "segredo-apenas-para-testes-automatizados-0123456789",
    BETTER_AUTH_URL: "http://localhost:3000",
  };

  it("needs the token and the phone number id together", () => {
    expect(() =>
      parseServerEnv({ ...base, WHATSAPP_TOKEN: "token-ficticio" }),
    ).toThrow(/WHATSAPP_PHONE_NUMBER_ID/);
  });

  it("refuses a short CRON_SECRET", () => {
    expect(() => parseServerEnv({ ...base, CRON_SECRET: "curto" })).toThrow(
      /CRON_SECRET/,
    );
  });

  it("has defaults for the template", () => {
    const env = parseServerEnv(base);
    expect(env.WHATSAPP_TEMPLATE).toBe("lembrete_horario");
    expect(env.WHATSAPP_TEMPLATE_LANGUAGE).toBe("pt_BR");
    expect(env.WHATSAPP_GRAPH_VERSION).toBe("v23.0");
  });
});
