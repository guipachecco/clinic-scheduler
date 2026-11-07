import { describe, expect, it } from "vitest";

import {
  AMENITIES,
  AMENITY_LABELS,
  clinicPageSchema,
  loyaltySchema,
  parseInstagram,
  parsePriceInput,
  productSchema,
  reviewSchema,
} from "./fields";

const page = {
  headline: "",
  about: "",
  whatsappPhone: "",
  contactEmail: "",
  address: "",
  mapsUrl: "",
  instagram: "",
  amenities: [],
  onlineBookingEnabled: true,
};

describe("parseInstagram", () => {
  it("maps the accepted forms to the handle", () => {
    for (const input of [
      "karolpachecojk",
      "@karolpachecojk",
      "https://www.instagram.com/karolpachecojk/",
      "instagram.com/karolpachecojk?igsh=abc",
    ]) {
      expect(parseInstagram(input), input).toBe("karolpachecojk");
    }
  });

  it("refuses other hosts, spaces and empty input", () => {
    expect(parseInstagram("https://evil.com/x")).toBeNull();
    expect(parseInstagram("a b")).toBeNull();
    for (const input of [
      "https://www.instagram.com/p/Cabc123/",
      "https://instagram.com/reel/xyz",
      "instagram.com/reels/xyz",
      "https://instagram.com/explore/tags/x",
      "https://instagram.com/stories/user/1",
      "https://instagram.com/accounts/login",
      "https://instagram.com/tv/abc",
      "https://instagram.com",
      "https://www.instagram.com/",
      "instagram.com",
    ]) {
      expect(parseInstagram(input), input).toBeNull();
    }
    expect(parseInstagram("")).toBeNull();
  });
});

describe("parsePriceInput", () => {
  it("reads reais as cents", () => {
    expect(parsePriceInput("R$ 79,90")).toBe(7990);
    expect(parsePriceInput("79,90")).toBe(7990);
    expect(parsePriceInput("79.90")).toBe(7990);
    expect(parsePriceInput("1.234,50")).toBe(123450);
    expect(parsePriceInput("95")).toBe(9500);
  });

  it("treats empty as no price and junk as invalid", () => {
    expect(parsePriceInput("")).toBeNull();
    expect(parsePriceInput("abc")).toBe("invalid");
    expect(parsePriceInput("-5")).toBe("invalid");
    expect(parsePriceInput("100001")).toBe("invalid");
  });
});

describe("clinicPageSchema", () => {
  it("turns empty strings into null and carries the handle", () => {
    const parsed = clinicPageSchema.parse({ ...page, instagram: "@zemana" });
    expect(parsed.headline).toBeNull();
    expect(parsed.mapsUrl).toBeNull();
    expect(parsed.instagramHandle).toBe("zemana");
    expect(parsed).not.toHaveProperty("instagram");
  });

  it("refuses non-https map links", () => {
    for (const mapsUrl of ["javascript:alert(1)", "http://maps.google.com"]) {
      expect(clinicPageSchema.safeParse({ ...page, mapsUrl }).success).toBe(
        false,
      );
    }
    expect(
      clinicPageSchema.safeParse({ ...page, mapsUrl: "https://maps.app/x" })
        .success,
    ).toBe(true);
  });

  it("refuses unknown amenities", () => {
    expect(
      clinicPageSchema.safeParse({ ...page, amenities: ["sauna"] }).success,
    ).toBe(false);
  });

  it("normalizes the WhatsApp number", () => {
    const parsed = clinicPageSchema.parse({
      ...page,
      whatsappPhone: "(47) 99626-2982",
    });
    expect(parsed.whatsappPhone).toBe("+5547996262982");
    expect(
      clinicPageSchema.safeParse({ ...page, whatsappPhone: "123" }).success,
    ).toBe(false);
  });

  it("limits the lengths", () => {
    expect(
      clinicPageSchema.safeParse({ ...page, headline: "a".repeat(121) })
        .success,
    ).toBe(false);
    expect(
      clinicPageSchema.safeParse({ ...page, about: "a".repeat(2001) }).success,
    ).toBe(false);
  });
});

describe("amenities", () => {
  it("has a label for each key, in order", () => {
    expect(AMENITIES.map((key) => AMENITY_LABELS[key])).toEqual([
      "Wi-Fi",
      "Estacionamento",
      "Acessibilidade",
      "Ar-condicionado",
      "Café e água",
      "Banheiro",
      "Espaço kids",
      "Aceita pets",
    ]);
  });
});

describe("loyaltySchema", () => {
  it("needs a reward when enabled", () => {
    expect(
      loyaltySchema.safeParse({ enabled: true, visits: 10, reward: "  " })
        .success,
    ).toBe(false);
    expect(
      loyaltySchema.safeParse({ enabled: false, visits: 10, reward: "" })
        .success,
    ).toBe(true);
  });

  it("keeps the visits between 2 and 50", () => {
    for (const visits of [1, 51]) {
      expect(
        loyaltySchema.safeParse({ enabled: true, visits, reward: "Brinde" })
          .success,
      ).toBe(false);
    }
  });
});

describe("productSchema", () => {
  it("parses the price and requires a name", () => {
    const parsed = productSchema.parse({
      name: " Hidratante ",
      price: "R$ 69,90",
      description: "",
      isActive: true,
    });
    expect(parsed).toEqual({
      name: "Hidratante",
      price: 6990,
      description: null,
      isActive: true,
    });
    expect(
      productSchema.safeParse({
        name: "",
        price: "",
        description: "",
        isActive: true,
      }).success,
    ).toBe(false);
  });
});

describe("reviewSchema", () => {
  it("refuses ratings outside 1-5 and long comments", () => {
    expect(reviewSchema.safeParse({ rating: 0, comment: "" }).success).toBe(
      false,
    );
    expect(reviewSchema.safeParse({ rating: 6, comment: "" }).success).toBe(
      false,
    );
    expect(
      reviewSchema.safeParse({ rating: 5, comment: "a".repeat(501) }).success,
    ).toBe(false);
    expect(reviewSchema.parse({ rating: 5, comment: " ótimo " })).toEqual({
      rating: 5,
      comment: "ótimo",
    });
  });
});
