import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { isAppointmentOverlapError, isUniqueViolation } from "./errors";

function pgError(code: string, constraint: string) {
  return Object.assign(new Error("database error"), { code, constraint });
}

describe("database error helpers", () => {
  it("recognizes the overlap constraint inside a Drizzle error", () => {
    const error = new DrizzleQueryError(
      "insert into appointments ...",
      [],
      pgError("23P01", "appointments_no_overlap"),
    );
    expect(isAppointmentOverlapError(error)).toBe(true);
  });

  it("ignores other errors", () => {
    expect(
      isAppointmentOverlapError(pgError("23P01", "another_constraint")),
    ).toBe(false);
    expect(isAppointmentOverlapError(new Error("network"))).toBe(false);
    expect(isAppointmentOverlapError("not an error")).toBe(false);
  });

  it("matches unique violations by constraint", () => {
    const error = pgError("23505", "appointments_idempotency_key_unique");
    expect(isUniqueViolation(error)).toBe(true);
    expect(
      isUniqueViolation(error, "appointments_idempotency_key_unique"),
    ).toBe(true);
    expect(isUniqueViolation(error, "users_email_unique")).toBe(false);
  });
});
