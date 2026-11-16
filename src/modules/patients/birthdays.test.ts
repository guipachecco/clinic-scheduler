import { describe, expect, it } from "vitest";

import { ageTurning, birthdayKeys } from "./birthdays";

describe("birthdayKeys", () => {
  it("is just today's month and day", () => {
    expect(birthdayKeys("2026-11-16")).toEqual(["11-16"]);
  });

  it("adds Feb 29 on Feb 28 of a non-leap year", () => {
    expect(birthdayKeys("2027-02-28")).toEqual(["02-28", "02-29"]);
  });

  it("does not add Feb 29 on Feb 28 of a leap year", () => {
    expect(birthdayKeys("2028-02-28")).toEqual(["02-28"]);
  });

  it("is Feb 29 on Feb 29", () => {
    expect(birthdayKeys("2028-02-29")).toEqual(["02-29"]);
  });
});

describe("ageTurning", () => {
  it("is the year difference", () => {
    expect(ageTurning("1992-11-16", "2026-11-16")).toBe(34);
  });

  it("counts a Feb 29 birth on Feb 28 of a non-leap year", () => {
    expect(ageTurning("2000-02-29", "2027-02-28")).toBe(27);
  });
});
