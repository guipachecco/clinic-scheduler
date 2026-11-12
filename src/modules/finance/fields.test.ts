import { describe, expect, it } from "vitest";

import { quoteFormSchema, quoteItemSchema } from "./fields";

const PRODUCT_ID = "5b1f6a52-3c8e-4f5a-9d0e-0a1b2c3d4e5f";
const SERVICE_ID = "6c2f7b63-4d9f-4a6b-8e1f-1b2c3d4e5f60";

describe("quoteItemSchema", () => {
  it("accepts a product item, with its quantity in sessions", () => {
    const parsed = quoteItemSchema.parse({
      kind: "product",
      productId: PRODUCT_ID,
      sessions: "2",
      unitPrice: "59,90",
      discount: "",
    });
    expect(parsed).toEqual({
      kind: "product",
      productId: PRODUCT_ID,
      sessions: 2,
      unitPrice: 5990,
      discount: 0,
    });
  });

  it("refuses a product item without the product", () => {
    const result = quoteItemSchema.safeParse({
      kind: "product",
      sessions: "2",
      unitPrice: "59,90",
      discount: "",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["productId"]);
    expect(result.error?.issues[0]?.message).toBe("Escolha o produto.");
  });

  it("still reads a service item", () => {
    const parsed = quoteItemSchema.parse({
      kind: "service",
      serviceId: SERVICE_ID,
      sessions: "4",
      unitPrice: "150,00",
      discount: "10,00",
    });
    expect(parsed).toEqual({
      kind: "service",
      serviceId: SERVICE_ID,
      sessions: 4,
      unitPrice: 15000,
      discount: 1000,
    });
  });

  it("keeps the quantity of a product between 1 and 200", () => {
    const result = quoteItemSchema.safeParse({
      kind: "product",
      productId: PRODUCT_ID,
      sessions: "201",
      unitPrice: "59,90",
      discount: "",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["sessions"]);
  });
});

describe("quoteFormSchema", () => {
  it("totals services and products together for the discount check", () => {
    const result = quoteFormSchema.safeParse({
      patientId: SERVICE_ID,
      validUntil: "2026-11-30",
      discount: "200,00",
      notes: "",
      items: [
        {
          kind: "service",
          serviceId: SERVICE_ID,
          sessions: "1",
          unitPrice: "150,00",
          discount: "",
        },
        {
          kind: "product",
          productId: PRODUCT_ID,
          sessions: "1",
          unitPrice: "59,90",
          discount: "",
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
