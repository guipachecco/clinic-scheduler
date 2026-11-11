import { describe, expect, it } from "vitest";

import { contrastRatio } from "./contrast";
import { HEX_COLOR, paletteFromColor, readableOn } from "./derive";
import { PALETTES } from "./palettes";

const COLORS = [
  "#7a3cff",
  "#ffff00",
  "#000000",
  "#ffffff",
  "#0a7d5a",
  "#ff8fab",
];

describe("paletteFromColor", () => {
  for (const color of COLORS) {
    it(`is readable for ${color}`, () => {
      const p = paletteFromColor(color);
      expect(p.id).toBe("custom");
      expect(p.light.primary).toBe(color);
      expect(p.light.brand).toBe(color);
      expect(
        contrastRatio(p.light.primary, p.light["primary-foreground"]),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(p.light.brand, p.light["brand-foreground"]),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(p.light["primary-text"], "#ffffff"),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(p.dark["primary-text"], "#0b0b10"),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(p.dark.primary, p.dark["primary-foreground"]),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(
          p.light["brand-accent"],
          p.light["brand-accent-foreground"],
        ),
      ).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.light.ring, "#ffffff")).toBeGreaterThanOrEqual(3);
      expect(p.dark.highlight).toBe(PALETTES.zemana.dark.highlight);
      expect(p.light["highlight-foreground"]).toBe(
        PALETTES.zemana.light["highlight-foreground"],
      );
    });
  }

  it("keeps primary-text equal to the color when it already passes", () => {
    expect(paletteFromColor("#2a0081").light["primary-text"]).toBe("#2a0081");
  });

  it("normalizes uppercase input", () => {
    expect(paletteFromColor("#7A3CFF").light.primary).toBe("#7a3cff");
  });
});

describe("readableOn", () => {
  it("picks the higher-contrast option", () => {
    expect(readableOn("#ffff00")).toBe("#1c1a22");
    expect(readableOn("#000000")).toBe("#ffffff");
  });
});

describe("HEX_COLOR", () => {
  it("accepts only lowercase #rrggbb", () => {
    expect(HEX_COLOR.test("#7a3cff")).toBe(true);
    expect(HEX_COLOR.test("#7A3CFF")).toBe(false);
    expect(HEX_COLOR.test("7a3cff")).toBe(false);
    expect(HEX_COLOR.test("#7a3cf")).toBe(false);
  });
});
