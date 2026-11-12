import { describe, expect, it } from "vitest";

import { productCategoryFormSchema, productFormSchema } from "./fields";

const base = {
  name: "Protetor solar",
  categoryId: "5b1f6a52-3c8e-4f5a-9d0e-0a1b2c3d4e5f",
  description: "",
  price: "59,90",
  showOnPage: true,
  isActive: true,
};

describe("productFormSchema", () => {
  it("reads the price in reais as cents", () => {
    const parsed = productFormSchema.parse(base);
    expect(parsed.priceCents).toBe(5990);
    expect(parsed.description).toBeNull();
    expect(parsed.showOnPage).toBe(true);
  });

  it("accepts an empty price as no price", () => {
    expect(
      productFormSchema.parse({ ...base, price: "" }).priceCents,
    ).toBeNull();
  });

  it("refuses an empty name, a bad price and a bad category", () => {
    expect(productFormSchema.safeParse({ ...base, name: "  " }).success).toBe(
      false,
    );
    expect(productFormSchema.safeParse({ ...base, price: "abc" }).success).toBe(
      false,
    );
    expect(
      productFormSchema.safeParse({ ...base, categoryId: "x" }).success,
    ).toBe(false);
  });

  it("reads unticked checkboxes as false", () => {
    const parsed = productFormSchema.parse({
      name: base.name,
      categoryId: base.categoryId,
      description: "",
      price: "",
    });
    expect(parsed.showOnPage).toBe(false);
    expect(parsed.isActive).toBe(false);
  });
});

describe("productCategoryFormSchema", () => {
  it("trims and limits the name to 40 characters", () => {
    expect(productCategoryFormSchema.parse({ name: " Cremes " }).name).toBe(
      "Cremes",
    );
    expect(productCategoryFormSchema.safeParse({ name: "" }).success).toBe(
      false,
    );
    expect(
      productCategoryFormSchema.safeParse({ name: "a".repeat(41) }).success,
    ).toBe(false);
  });
});
