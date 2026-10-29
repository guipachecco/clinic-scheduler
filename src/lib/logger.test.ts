import { DrizzleQueryError } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { redact, redactText, toSafeError } from "./logger";

// All personal data below is fictitious.
describe("redactText", () => {
  it("removes emails and phone numbers", () => {
    expect(redactText("contato: maria.teste@example.com")).toBe(
      "contato: [email]",
    );
    expect(redactText("tel +5511912345678")).toBe("tel [telefone]");
    expect(redactText("tel (11) 91234-5678")).toBe("tel [telefone]");
    expect(redactText("tel 11 91234-5678")).toBe("tel [telefone]");
  });

  it("keeps ids, dates and timestamps", () => {
    const text =
      "appointment 123e4567-e89b-12d3-a456-426614174000 at 2026-10-29T16:37:00.000Z (1793291841534)";
    expect(redactText(text)).toBe(text);
  });

  it("removes the parameters Drizzle adds to query errors", () => {
    const message =
      'Failed query: insert into "patients" ("name", "phone") values ($1, $2)\nparams: Maria Teste,+5511912345678';
    expect(redactText(message)).toBe(
      'Failed query: insert into "patients" ("name", "phone") values ($1, $2)\nparams: [removido]',
    );
  });
});

describe("redact", () => {
  it("removes sensitive keys at any depth", () => {
    expect(
      redact({
        appointmentId: "a1",
        patient: { name: "Maria Teste", phone: "+5511912345678", id: "p1" },
        headers: { cookie: "x", authorization: "Bearer y" },
        password: "segredo",
        items: [{ email: "x@example.com" }],
      }),
    ).toEqual({
      appointmentId: "a1",
      patient: { name: "[removido]", phone: "[removido]", id: "p1" },
      headers: { cookie: "[removido]", authorization: "[removido]" },
      password: "[removido]",
      items: [{ email: "[removido]" }],
    });
  });

  it("handles circular references and deep objects", () => {
    const value: Record<string, unknown> = { id: "1" };
    value.self = value;
    expect(redact(value)).toEqual({ id: "1", self: "[circular]" });

    let deep: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 10; i++) deep = { child: deep };
    expect(JSON.stringify(redact(deep))).toContain("[...]");
  });
});

describe("toSafeError", () => {
  it("drops query parameters and driver details from database errors", () => {
    const pgError = Object.assign(
      new Error('duplicate key value violates unique constraint "x"'),
      {
        code: "23505",
        constraint: "patients_phone_name_idx",
        detail: "Key (phone)=(+5511912345678) already exists.",
      },
    );
    const error = new DrizzleQueryError(
      'insert into "patients" ("name", "phone") values ($1, $2)',
      ["Maria Teste", "+5511912345678"],
      pgError,
    );

    const safe = toSafeError(error);
    const printed = `${safe.message}\n${safe.stack}\n${JSON.stringify(safe)}\n${String((safe.cause as Error).message)}`;
    expect(printed).not.toContain("Maria");
    expect(printed).not.toContain("5511912345678");
    expect(safe.cause).toMatchObject({
      code: "23505",
      constraint: "patients_phone_name_idx",
    });
    expect(safe.cause).not.toHaveProperty("detail");
  });
});

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // The logger keeps the console functions it found when it was loaded.
  async function loadLoggerCapturingOutput() {
    const lines: string[] = [];
    const capture = (line: string) => {
      lines.push(line);
    };
    vi.spyOn(console, "log").mockImplementation(capture);
    vi.spyOn(console, "error").mockImplementation(capture);
    vi.resetModules();
    const loggerModule = await import("./logger");
    return { ...loggerModule, lines };
  }

  it("writes one JSON line without personal data", async () => {
    const { logger, lines } = await loadLoggerCapturingOutput();
    logger.error("falha ao avisar maria@example.com", {
      appointmentId: "a1",
      phone: "+5511912345678",
    });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({
      level: "error",
      msg: "falha ao avisar [email]",
      appointmentId: "a1",
      phone: "[removido]",
    });
  });

  it("skips levels below LOG_LEVEL", async () => {
    vi.stubEnv("LOG_LEVEL", "warn");
    const { logger, lines } = await loadLoggerCapturingOutput();
    logger.info("ignorado");
    logger.warn("registrado");

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toMatchObject({ msg: "registrado" });
  });

  it("redacts what other code prints through the console", async () => {
    const { installConsoleRedaction } = await loadLoggerCapturingOutput();
    const printed = vi.mocked(console.error);
    installConsoleRedaction();

    console.error(
      new DrizzleQueryError("select 1", ["maria@example.com"]),
      "telefone +5511912345678",
    );

    const [error, text] = printed.mock.calls[0] ?? [];
    expect(String((error as Error).message)).not.toContain("maria");
    expect(text).toBe("telefone [telefone]");
  });
});
