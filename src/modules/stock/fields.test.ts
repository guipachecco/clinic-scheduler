import { describe, expect, it } from "vitest";

import { entrySchema, usageSchema } from "./fields";

const PRODUCT = "5b1f6a52-3c8e-4f5a-9d0e-0a1b2c3d4e5f";
const ITEM = "6c2f7b63-4d9f-4a6b-8e1f-1b2c3d4e5f60";

describe("entrySchema", () => {
  it("accepts 1 to 10000", () => {
    expect(entrySchema.parse({ quantity: "1" })).toEqual({
      quantity: 1,
      note: null,
    });
    expect(entrySchema.parse({ quantity: 10000 }).quantity).toBe(10000);
    for (const quantity of ["0", "10001", "-1", "1.5", "abc", ""]) {
      expect(entrySchema.safeParse({ quantity }).success).toBe(false);
    }
  });

  it("keeps a note of up to 200 characters", () => {
    expect(entrySchema.parse({ quantity: "2", note: " Lote 12 " }).note).toBe(
      "Lote 12",
    );
    expect(entrySchema.parse({ quantity: "2", note: "  " }).note).toBeNull();
    expect(
      entrySchema.safeParse({ quantity: "2", note: "x".repeat(200) }).success,
    ).toBe(true);
    expect(
      entrySchema.safeParse({ quantity: "2", note: "x".repeat(201) }).success,
    ).toBe(false);
  });
});

describe("usageSchema", () => {
  it("accepts 1 to 200", () => {
    expect(
      usageSchema.parse({
        productId: PRODUCT,
        quantity: "200",
        saleItemId: "",
      }),
    ).toEqual({ productId: PRODUCT, quantity: 200, saleItemId: null });
    for (const quantity of ["0", "201"]) {
      expect(
        usageSchema.safeParse({ productId: PRODUCT, quantity, saleItemId: "" })
          .success,
      ).toBe(false);
    }
  });

  it("reads the sale item as a uuid or none", () => {
    expect(
      usageSchema.parse({ productId: PRODUCT, quantity: "1", saleItemId: ITEM })
        .saleItemId,
    ).toBe(ITEM);
    expect(
      usageSchema.parse({ productId: PRODUCT, quantity: "1", saleItemId: null })
        .saleItemId,
    ).toBeNull();
    expect(
      usageSchema.safeParse({
        productId: PRODUCT,
        quantity: "1",
        saleItemId: "x",
      }).success,
    ).toBe(false);
    expect(
      usageSchema.safeParse({ productId: "x", quantity: "1", saleItemId: "" })
        .success,
    ).toBe(false);
  });
});
