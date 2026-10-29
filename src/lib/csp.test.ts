import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy } from "./csp";

describe("buildContentSecurityPolicy", () => {
  it("only allows scripts that carry the nonce in production", () => {
    const policy = buildContentSecurityPolicy({
      nonce: "abc123",
      isDevelopment: false,
      upgradeInsecureRequests: true,
    });

    expect(policy).toContain(
      "script-src 'self' 'nonce-abc123' 'strict-dynamic';",
    );
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toMatch(/upgrade-insecure-requests$/);
  });

  it("allows eval only in development", () => {
    const policy = buildContentSecurityPolicy({
      nonce: "abc123",
      isDevelopment: true,
      upgradeInsecureRequests: false,
    });

    expect(policy).toContain("'unsafe-eval'");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });
});
