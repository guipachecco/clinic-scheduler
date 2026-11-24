import { expect, test } from "vitest";

import { cleanSource, QUOTE_URL, withSource } from "./quote-link";

test("cleanSource keeps a short plain word", () => {
  expect(cleanSource("Instagram")).toBe("instagram");
  expect(cleanSource("<b>meta ads</b>")).toBe("bmetaadsb");
  expect(cleanSource("")).toBeNull();
  expect(cleanSource(null)).toBeNull();
  expect(cleanSource("x".repeat(50))).toHaveLength(30);
});

test("withSource tags the owner's WhatsApp message once", () => {
  const tagged = withSource(QUOTE_URL, "instagram");
  expect(new URL(tagged).searchParams.get("text")).toBe(
    "Oi! Vi o site da Zemana e quero um orçamento para minha clínica. (vim pelo instagram)",
  );
  expect(withSource(tagged, "instagram")).toBe(tagged);
});

test("withSource leaves other links alone", () => {
  const other = "https://wa.me/5511999999999?text=oi";
  expect(withSource(other, "instagram")).toBe(other);
  expect(withSource("https://zemana.com.br/termos", "x")).toBe(
    "https://zemana.com.br/termos",
  );
});
