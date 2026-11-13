import { describe, expect, it } from "vitest";

import { professionalFormSchema } from "./fields";

const parse = (input: Record<string, unknown>) =>
  professionalFormSchema.safeParse({
    name: "Ana Souza",
    registration: "",
    sortOrder: "",
    ...input,
  });

describe("professionalFormSchema", () => {
  it("trims the name, empties the registration and defaults the order", () => {
    const result = parse({ name: "  Ana Souza  ", isActive: "on" });
    expect(result.success && result.data).toEqual({
      name: "Ana Souza",
      registration: null,
      sortOrder: 0,
      isActive: true,
    });
  });

  it("keeps a registration and reads the order as a number", () => {
    const result = parse({ registration: " CREFITO 12345 ", sortOrder: "3" });
    expect(result.success && result.data).toMatchObject({
      registration: "CREFITO 12345",
      sortOrder: 3,
      isActive: false,
    });
  });

  it("requires a name of at most 60 characters", () => {
    expect(parse({ name: "   " }).success).toBe(false);
    expect(parse({ name: "a".repeat(60) }).success).toBe(true);
    expect(parse({ name: "a".repeat(61) }).success).toBe(false);
  });

  it("limits the registration to 40 characters", () => {
    expect(parse({ registration: "r".repeat(40) }).success).toBe(true);
    expect(parse({ registration: "r".repeat(41) }).success).toBe(false);
  });

  it("refuses an order that is not an integer from 0 to 999", () => {
    for (const sortOrder of ["-1", "1000", "1.5", "abc"]) {
      expect(parse({ sortOrder }).success).toBe(false);
    }
    expect(parse({ sortOrder: "999" }).success).toBe(true);
  });
});
