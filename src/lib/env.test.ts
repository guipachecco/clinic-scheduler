import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./env";

const valid = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://user:password@db.example.com:5432/app",
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "https://clinica.example.com",
};

describe("parseServerEnv", () => {
  it("accepts a complete configuration and applies defaults", () => {
    expect(parseServerEnv(valid)).toEqual({ ...valid, LOG_LEVEL: "info" });
  });

  it("lists every missing variable without echoing values", () => {
    expect(() =>
      parseServerEnv({ BETTER_AUTH_SECRET: "curto-demais" }),
    ).toThrowError(
      /DATABASE_URL[\s\S]*BETTER_AUTH_SECRET[\s\S]*BETTER_AUTH_URL/,
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

  it("rejects a database URL that is not PostgreSQL", () => {
    expect(() =>
      parseServerEnv({ ...valid, DATABASE_URL: "mysql://db.example.com/app" }),
    ).toThrowError(/DATABASE_URL/);
  });
});
