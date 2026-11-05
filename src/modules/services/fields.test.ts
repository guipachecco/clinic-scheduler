import { describe, expect, it } from "vitest";

import {
  categoryFormSchema,
  formatCents,
  parsePriceToCents,
  serviceFormSchema,
  slugify,
} from "./fields";

const base = {
  categoryId: "5b1f6a52-3c8e-4f5a-9d0e-0a1b2c3d4e5f",
  name: "Limpeza de Pele",
  description: "",
  durationMinutes: "60",
  bufferBeforeMinutes: "",
  bufferAfterMinutes: "",
  price: "",
  priceDisplay: "hidden",
  preparationInstructions: "",
  sortOrder: "",
};

describe("slugify", () => {
  it("removes accents and punctuation", () => {
    expect(slugify("Limpeza de Pele Regenerativa")).toBe(
      "limpeza-de-pele-regenerativa",
    );
    expect(slugify("PEIM (microvasos)")).toBe("peim-microvasos");
    expect(slugify("  Avaliação / encaixe ")).toBe("avaliacao-encaixe");
  });
});

describe("parsePriceToCents", () => {
  it("reads the Brazilian format", () => {
    expect(parsePriceToCents("1.250,00")).toBe(125000);
    expect(parsePriceToCents("R$ 90")).toBe(9000);
    expect(parsePriceToCents("90,5")).toBe(9050);
    expect(parsePriceToCents("")).toBeNull();
  });
});

describe("formatCents", () => {
  it("formats as reais", () => {
    expect(formatCents(125050)).toBe("R$ 1.250,50");
    expect(formatCents(9000)).toBe("R$ 90,00");
  });
});

describe("serviceFormSchema", () => {
  it("applies defaults and outputs DB-ready values", () => {
    const out = serviceFormSchema.parse(base);
    expect(out).toMatchObject({
      durationMinutes: 60,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      priceCents: null,
      description: null,
      preparationInstructions: null,
      requiresApproval: false,
      onlineBookingEnabled: false,
      isActive: false,
      sortOrder: 0,
    });
  });

  it("accepts checkbox values", () => {
    const out = serviceFormSchema.parse({
      ...base,
      requiresApproval: "on",
      isActive: true,
    });
    expect(out.requiresApproval).toBe(true);
    expect(out.isActive).toBe(true);
  });

  it.each(["4", "721", "abc", "60.5"])("rejects duration %s", (value) => {
    const r = serviceFormSchema.safeParse({ ...base, durationMinutes: value });
    expect(r.success).toBe(false);
  });

  it("rejects a buffer of 241", () => {
    expect(
      serviceFormSchema.safeParse({ ...base, bufferAfterMinutes: "241" })
        .success,
    ).toBe(false);
  });

  it("requires a price for fixed and starting_at", () => {
    for (const priceDisplay of ["fixed", "starting_at"]) {
      const r = serviceFormSchema.safeParse({ ...base, priceDisplay });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0]!.path).toEqual(["price"]);
    }
    const ok = serviceFormSchema.parse({
      ...base,
      priceDisplay: "fixed",
      price: "R$ 1.250,00",
    });
    expect(ok.priceCents).toBe(125000);
  });

  it("rejects letters in the price", () => {
    expect(serviceFormSchema.safeParse({ ...base, price: "abc" }).success).toBe(
      false,
    );
  });

  it("rejects bad name, category and display", () => {
    expect(serviceFormSchema.safeParse({ ...base, name: "A" }).success).toBe(
      false,
    );
    expect(
      serviceFormSchema.safeParse({ ...base, categoryId: "x" }).success,
    ).toBe(false);
    expect(
      serviceFormSchema.safeParse({ ...base, priceDisplay: "free" }).success,
    ).toBe(false);
  });
});

describe("categoryFormSchema", () => {
  it("validates name and defaults", () => {
    expect(categoryFormSchema.parse({ name: "Facial", sortOrder: "" })).toEqual(
      { name: "Facial", isActive: false, sortOrder: 0 },
    );
    expect(categoryFormSchema.safeParse({ name: "A" }).success).toBe(false);
    expect(categoryFormSchema.safeParse({ name: "x".repeat(61) }).success).toBe(
      false,
    );
  });
});
