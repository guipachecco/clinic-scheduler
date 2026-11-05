import { describe, expect, it } from "vitest";

import { contrastRatio } from "./contrast";
import {
  CLINIC_BRANDING,
  initialsFor,
  paletteCss,
  PALETTES,
  palettesForClinic,
  resolvePalette,
} from "./palettes";

const BACKGROUND = { light: "#f7f5f8", dark: "#0b0b10" } as const;

describe("palettes", () => {
  it("every palette id used by a clinic exists", () => {
    for (const [slug, branding] of Object.entries(CLINIC_BRANDING)) {
      for (const id of branding.palettes) {
        expect(PALETTES[id], `${slug}: ${id}`).toBeDefined();
      }
    }
  });

  it("every palette is readable in both themes", () => {
    for (const palette of Object.values(PALETTES)) {
      for (const theme of ["light", "dark"] as const) {
        const t = palette[theme];
        const pairs: [string, string, string][] = [
          ["primary-foreground", t["primary-foreground"], t.primary],
          ["brand-foreground", t["brand-foreground"], t.brand],
          ["highlight-foreground", t["highlight-foreground"], t.highlight],
          [
            "brand-accent-foreground",
            t["brand-accent-foreground"],
            t["brand-accent"],
          ],
          ["primary on background", t.primary, BACKGROUND[theme]],
        ];
        for (const [label, a, b] of pairs) {
          expect(
            contrastRatio(a, b),
            `${palette.id} ${theme} ${label}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("grais is today's globals.css", () => {
    const g = PALETTES.grais;
    expect(g.light.primary).toBe("#00357a");
    expect(g.light.highlight).toBe("#ffde59");
    expect(g.dark.primary).toBe("#99f0ff");
    expect(g.dark.brand).toBe("#000000");
    expect(g.light).toEqual({
      primary: "#00357a",
      "primary-pressed": "#00245a",
      "primary-foreground": "#ffffff",
      highlight: "#ffde59",
      "highlight-foreground": "#00357a",
      brand: "#00357a",
      "brand-foreground": "#ffffff",
      "brand-muted": "#002a63",
      "brand-accent": "#99f0ff",
      "brand-accent-foreground": "#00357a",
      ring: "#00357a",
    });
    expect(g.dark).toEqual({
      primary: "#99f0ff",
      "primary-pressed": "#6fe3f7",
      "primary-foreground": "#0b0b10",
      highlight: "#ffde59",
      "highlight-foreground": "#00357a",
      brand: "#000000",
      "brand-foreground": "#f2f0f5",
      "brand-muted": "#16151c",
      "brand-accent": "#99f0ff",
      "brand-accent-foreground": "#00357a",
      ring: "#99f0ff",
    });
  });

  it("each clinic sees its three palettes", () => {
    expect(palettesForClinic("karina-manicure").map((p) => p.id)).toEqual([
      "karina-rosa",
      "karina-marinho-coral",
      "karina-ameixa",
    ]);
    expect(palettesForClinic("grais").map((p) => p.id)).toEqual(["grais"]);
    const unknown = palettesForClinic("nova");
    expect(unknown[0].id).toBe("painel");
    expect(unknown).toHaveLength(10);
  });

  it("resolvePalette never borrows another clinic's palette", () => {
    expect(resolvePalette("karina-manicure", "karol-vinho").id).toBe(
      "karina-rosa",
    );
    expect(resolvePalette("sirlei-massoterapia", "sirlei-argila").id).toBe(
      "sirlei-argila",
    );
    expect(resolvePalette("x", undefined).id).toBe("painel");
  });

  it("initials", () => {
    expect(initialsFor("Karol Pacheco")).toBe("KP");
    expect(initialsFor("  Sirlei  ")).toBe("S");
    expect(initialsFor("Ângela Souza")).toBe("ÂS");
    expect(initialsFor("maria da silva")).toBe("MS");
  });

  it("paletteCss writes both themes", () => {
    const css = paletteCss(PALETTES["karina-rosa"]);
    expect(css).toContain(":root{");
    expect(css).toContain(".dark{");
    expect(css).toContain("--brand:#b2295b");
  });
});
