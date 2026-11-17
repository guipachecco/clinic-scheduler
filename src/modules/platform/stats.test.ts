import { describe, expect, it } from "vitest";

import { buildErrorReport, buildLogReport } from "./report-error";
import {
  formatBytes,
  latencyLevel,
  latencySummary,
  pathPattern,
  percentile,
  safeErrorMessage,
  safeRequestPath,
} from "./stats";

describe("latency", () => {
  it("summarizes samples", () => {
    expect(latencySummary([5, 1, 3])).toEqual({
      min: 1,
      median: 3,
      max: 5,
      samples: 3,
    });
    expect(latencySummary([]).samples).toBe(0);
    expect(percentile([1, 2, 3, 4, 100], 95)).toBe(100);
  });

  it("grades the round trip", () => {
    expect(latencyLevel(20)).toBe("good");
    expect(latencyLevel(150)).toBe("warn");
    expect(latencyLevel(900)).toBe("bad");
  });
});

describe("error reports", () => {
  it("drops the query string and groups ids", () => {
    expect(safeRequestPath("/marcar?telefone=11999998888&x=1")).toBe("/marcar");
    expect(
      pathPattern("/admin/pacientes/0b9a4a2e-1d1c-4c1e-9f0a-123456789abc"),
    ).toBe("/admin/pacientes/:id");
  });

  it("redacts personal data from the message", () => {
    const message = safeErrorMessage(
      "falhou para maria@example.com no (11) 99999-8888",
    );
    expect(message).not.toContain("maria@example.com");
    expect(message).not.toContain("99999-8888");
  });

  it("ignores redirect() and notFound()", () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/admin;307;",
    });
    const notFound = Object.assign(new Error("x"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    for (const error of [redirect, notFound]) {
      expect(
        buildErrorReport(
          error,
          { path: "/", method: "GET" },
          {
            routeType: "render",
          },
        ),
      ).toBeNull();
    }
  });

  it("builds a row from a real failure", () => {
    const error = Object.assign(new TypeError("boom"), { digest: "42" });
    expect(
      buildErrorReport(
        error,
        { path: "/admin/agenda?dia=2026-11-17", method: "post" },
        { routeType: "action", routePath: "/admin/(painel)/agenda/page" },
      ),
    ).toEqual({
      digest: "42",
      errorName: "TypeError",
      message: "boom",
      path: "/admin/agenda",
      method: "POST",
      routeType: "action",
      routePath: "/admin/(painel)/agenda/page",
    });
  });

  it("builds a row from logger.error", () => {
    const report = buildLogReport("asaas notification failed", {
      error: new Error("timeout"),
    });
    expect(report.message).toBe("asaas notification failed: timeout");
    expect(report.routeType).toBe("log");
  });
});

describe("formatBytes", () => {
  it("uses the right unit", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(11_581_107)).toBe("11 MB");
  });
});
