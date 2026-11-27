import { describe, expect, it } from "vitest";

import { generatePassword } from "./generate-password";
import { MIN_PASSWORD_LENGTH } from "./password-policy";

describe("generatePassword", () => {
  it("meets the password policy and never repeats", () => {
    const a = generatePassword();
    const b = generatePassword();
    expect(a.length).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/[0O1lI\s]/);
  });
});
