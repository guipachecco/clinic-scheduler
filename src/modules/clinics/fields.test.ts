import { describe, expect, it } from "vitest";

import { clinicEditSchema, clinicFormSchema } from "./fields";

describe("clinicEditSchema", () => {
  it("accepts an empty module list and has no slug", () => {
    const parsed = clinicEditSchema.safeParse({
      name: "X",
      businessType: "nail_salon",
      modules: [],
    });
    expect(parsed.success).toBe(true);
    expect("slug" in clinicEditSchema.shape).toBe(false);
  });

  it("rejects an unknown business type", () => {
    expect(
      clinicEditSchema.safeParse({ name: "X", businessType: "x", modules: [] })
        .success,
    ).toBe(false);
  });
});

describe("clinicFormSchema", () => {
  it("defaults the type to clinic and keeps the old name+slug form working", () => {
    const parsed = clinicFormSchema.parse({ name: "X", slug: "xx" });
    expect(parsed.businessType).toBe("clinic");
    expect(parsed.modules).toHaveLength(6);
  });
});
