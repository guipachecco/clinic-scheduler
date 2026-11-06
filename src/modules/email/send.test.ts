import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "@/lib/env";

import { parseSender } from "./sender";

// Fictitious addresses and keys only.
let outbox: string;

beforeEach(async () => {
  outbox = await mkdtemp(path.join(tmpdir(), "email-outbox-"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  await rm(outbox, { recursive: true, force: true });
});

const message = {
  to: "cliente@example.test",
  subject: "Confirme seu e-mail",
  html: "<p>Olá</p>",
  text: "Olá",
};

describe("sendEmail", () => {
  it("without MAILERSEND_API_KEY writes the message to EMAIL_OUTBOX_DIR", async () => {
    vi.stubEnv("MAILERSEND_API_KEY", "");
    vi.stubEnv("EMAIL_OUTBOX_DIR", outbox);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { readOutbox, sendEmail } = await import("./send");

    expect(await readOutbox()).toEqual([]);
    await sendEmail(message);

    const messages = await readOutbox(outbox);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject(message);
    expect(Number.isNaN(Date.parse(messages[0]!.sentAt))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("with MAILERSEND_API_KEY sends through the MailerSend API", async () => {
    vi.stubEnv("MAILERSEND_API_KEY", "mlsn.chave_ficticia");
    vi.stubEnv("EMAIL_FROM", "Zemana <nao-responda@example.com>");
    vi.stubEnv("EMAIL_OUTBOX_DIR", outbox);
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { MAILERSEND_URL, readOutbox, sendEmail } = await import("./send");

    await sendEmail(message);

    expect(MAILERSEND_URL).toBe("https://api.mailersend.com/v1/email");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(MAILERSEND_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer mlsn.chave_ficticia",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      from: { email: "nao-responda@example.com", name: "Zemana" },
      to: [{ email: "cliente@example.test" }],
      subject: "Confirme seu e-mail",
      html: "<p>Olá</p>",
      text: "Olá",
    });
    expect(await readOutbox(outbox)).toEqual([]);
  });

  it("fails with only the status when MailerSend refuses", async () => {
    vi.stubEnv("MAILERSEND_API_KEY", "mlsn.chave_ficticia");
    vi.stubEnv("EMAIL_FROM", "nao-responda@example.com");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: "cliente@example.test" }), {
            status: 422,
          }),
      ),
    );
    vi.resetModules();
    const { sendEmail } = await import("./send");

    const failure = sendEmail(message);
    await expect(failure).rejects.toThrowError(
      "Falha ao enviar o e-mail (MailerSend 422).",
    );
  });

  it("reads an empty outbox when the folder does not exist", async () => {
    const { readOutbox } = await import("./send");
    expect(await readOutbox(path.join(outbox, "nada-aqui"))).toEqual([]);
  });
});

describe("parseSender", () => {
  it("splits a name and an address", () => {
    expect(parseSender("Zemana <nao-responda@example.com>")).toEqual({
      email: "nao-responda@example.com",
      name: "Zemana",
    });
    expect(parseSender('"Grais Saúde" <ola@example.com>')).toEqual({
      email: "ola@example.com",
      name: "Grais Saúde",
    });
  });

  it("accepts a bare address", () => {
    expect(parseSender(" ola@example.com ")).toEqual({
      email: "ola@example.com",
    });
    expect(parseSender("<ola@example.com>")).toEqual({
      email: "ola@example.com",
    });
  });

  it("rejects what is not a sender", () => {
    expect(parseSender("Zemana")).toBeNull();
    expect(parseSender("Zemana <nao-responda>")).toBeNull();
    expect(parseSender("a@b@example.com")).toBeNull();
    expect(parseSender("Zemana <ola@example.com")).toBeNull();
  });
});

describe("e-mail configuration", () => {
  const production = {
    NODE_ENV: "production",
    DATABASE_URL_AUTH: "postgres://app_auth:a@db.example.com:5432/app",
    DATABASE_URL_PANEL: "postgres://app_panel:b@db.example.com:5432/app",
    DATABASE_URL_CLIENT: "postgres://app_client:c@db.example.com:5432/app",
    DATABASE_URL_PLATFORM: "postgres://app_platform:d@db.example.com:5432/app",
    BETTER_AUTH_SECRET: "a".repeat(32),
    BETTER_AUTH_URL: "https://clinica.example.com",
    EMAIL_FROM: "Zemana <nao-responda@example.com>",
  };

  it("production without MAILERSEND_API_KEY fails", () => {
    expect(() => parseServerEnv(production)).toThrowError(/MAILERSEND_API_KEY/);
  });

  it("production without EMAIL_FROM fails", () => {
    expect(() =>
      parseServerEnv({
        ...production,
        EMAIL_FROM: undefined,
        MAILERSEND_API_KEY: "mlsn.teste",
      }),
    ).toThrowError(/EMAIL_FROM/);
  });

  it("an EMAIL_FROM that is not a sender fails without echoing it", () => {
    expect(() =>
      parseServerEnv({
        ...production,
        EMAIL_FROM: "Zemana sem endereço",
        MAILERSEND_API_KEY: "mlsn.teste",
      }),
    ).toThrowError(/EMAIL_FROM: deve ser um remetente/);
    expect(() =>
      parseServerEnv({
        ...production,
        EMAIL_FROM: "Zemana sem endereço",
        MAILERSEND_API_KEY: "mlsn.teste",
      }),
    ).not.toThrowError(/sem endereço/);
  });

  it("a local production build (end-to-end tests) may use the outbox", () => {
    expect(
      parseServerEnv({
        ...production,
        BETTER_AUTH_URL: "http://localhost:3100",
      }).MAILERSEND_API_KEY,
    ).toBeUndefined();
  });
});
