import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseServerEnv } from "@/lib/env";

// Fictitious addresses only.
let outbox: string;

beforeEach(async () => {
  outbox = await mkdtemp(path.join(tmpdir(), "email-outbox-"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  await rm(outbox, { recursive: true, force: true });
});

describe("sendEmail", () => {
  it("without RESEND_API_KEY writes the message to EMAIL_OUTBOX_DIR", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_OUTBOX_DIR", outbox);
    vi.resetModules();
    const { readOutbox, sendEmail } = await import("./send");

    expect(await readOutbox()).toEqual([]);
    await sendEmail({
      to: "cliente@example.test",
      subject: "Confirme seu e-mail",
      html: "<p>Olá</p>",
      text: "Olá",
    });

    const messages = await readOutbox(outbox);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      to: "cliente@example.test",
      subject: "Confirme seu e-mail",
      html: "<p>Olá</p>",
      text: "Olá",
    });
    expect(Number.isNaN(Date.parse(messages[0]!.sentAt))).toBe(false);
  });

  it("reads an empty outbox when the folder does not exist", async () => {
    const { readOutbox } = await import("./send");
    expect(await readOutbox(path.join(outbox, "nada-aqui"))).toEqual([]);
  });
});

describe("e-mail configuration", () => {
  const production = {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://user:password@db.example.com:5432/app",
    DATABASE_URL_AUTH: "postgres://app_auth:a@db.example.com:5432/app",
    DATABASE_URL_PANEL: "postgres://app_panel:b@db.example.com:5432/app",
    DATABASE_URL_CLIENT: "postgres://app_client:c@db.example.com:5432/app",
    DATABASE_URL_PLATFORM: "postgres://app_platform:d@db.example.com:5432/app",
    BETTER_AUTH_SECRET: "a".repeat(32),
    BETTER_AUTH_URL: "https://clinica.example.com",
    EMAIL_FROM: "Zemana <nao-responda@example.com>",
  };

  it("production without RESEND_API_KEY fails", () => {
    expect(() => parseServerEnv(production)).toThrowError(/RESEND_API_KEY/);
  });

  it("production without EMAIL_FROM fails", () => {
    expect(() =>
      parseServerEnv({
        ...production,
        EMAIL_FROM: undefined,
        RESEND_API_KEY: "re_teste",
      }),
    ).toThrowError(/EMAIL_FROM/);
  });

  it("a local production build (end-to-end tests) may use the outbox", () => {
    expect(
      parseServerEnv({
        ...production,
        BETTER_AUTH_URL: "http://localhost:3100",
      }).RESEND_API_KEY,
    ).toBeUndefined();
  });
});
