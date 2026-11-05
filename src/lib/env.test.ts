import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./env";

const valid = {
  NODE_ENV: "production",
  DATABASE_URL_AUTH: "postgres://app_auth:a@db.example.com:5432/app",
  DATABASE_URL_PANEL: "postgres://app_panel:b@db.example.com:5432/app",
  DATABASE_URL_CLIENT: "postgres://app_client:c@db.example.com:5432/app",
  DATABASE_URL_PLATFORM: "postgres://app_platform:d@db.example.com:5432/app",
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "https://clinica.example.com",
  RESEND_API_KEY: "re_chave_ficticia",
  EMAIL_FROM: "Zemana <nao-responda@example.com>",
};

describe("parseServerEnv", () => {
  it("accepts a complete configuration and applies defaults", () => {
    expect(parseServerEnv(valid)).toEqual({
      ...valid,
      LOG_LEVEL: "info",
      EMAIL_OUTBOX_DIR: ".emails",
    });
  });

  it("lists every missing variable without echoing values", () => {
    expect(() =>
      parseServerEnv({ BETTER_AUTH_SECRET: "curto-demais" }),
    ).toThrowError(
      /DATABASE_URL_AUTH[\s\S]*BETTER_AUTH_SECRET[\s\S]*BETTER_AUTH_URL/,
    );

    try {
      parseServerEnv({ ...valid, BETTER_AUTH_SECRET: "curto-demais" });
    } catch (error) {
      expect(String(error)).not.toContain("curto-demais");
    }
  });

  it("rejects the placeholder secret", () => {
    expect(() =>
      parseServerEnv({
        ...valid,
        BETTER_AUTH_SECRET: "troque-por-um-segredo-gerado-1234567890",
      }),
    ).toThrowError(/BETTER_AUTH_SECRET/);
  });

  it("requires https in production, except on localhost", () => {
    expect(() =>
      parseServerEnv({
        ...valid,
        BETTER_AUTH_URL: "http://clinica.example.com",
      }),
    ).toThrowError(/BETTER_AUTH_URL/);
    expect(
      parseServerEnv({ ...valid, BETTER_AUTH_URL: "http://localhost:3000" })
        .BETTER_AUTH_URL,
    ).toBe("http://localhost:3000");
  });

  it("requires a connection URL for each database role", () => {
    const withoutPanel: Record<string, string> = { ...valid };
    delete withoutPanel.DATABASE_URL_PANEL;
    expect(() => parseServerEnv(withoutPanel)).toThrowError(
      /DATABASE_URL_PANEL: não definida/,
    );
    expect(() =>
      parseServerEnv({ ...valid, DATABASE_URL_CLIENT: "http://x/app" }),
    ).toThrowError(/DATABASE_URL_CLIENT/);
  });

  it("rejects a database URL that is not PostgreSQL", () => {
    expect(() =>
      parseServerEnv({
        ...valid,
        DATABASE_URL_AUTH: "mysql://db.example.com/app",
      }),
    ).toThrowError(/DATABASE_URL_AUTH/);
  });

  // The app never connects as the owner of the tables.
  it("neither needs nor keeps the owner DATABASE_URL", () => {
    expect(() => parseServerEnv(valid)).not.toThrow();
    const parsed = parseServerEnv({
      ...valid,
      DATABASE_URL: "postgres://owner:segredo@db.example.com:5432/app",
    });
    expect(parsed).not.toHaveProperty("DATABASE_URL");
  });
});
