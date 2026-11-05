import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio } from "./contrast";
import {
  CLINIC_BRANDING,
  initialsFor,
  paletteCss,
  PALETTES,
  palettesForClinic,
  type TokenName,
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

  it("the grais entry still exists unchanged (not offered)", () => {
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

  it("zemana matches the manual", () => {
    const z = PALETTES.zemana;
    expect(z.light.primary).toBe("#2a0081");
    expect(z.light.brand).toBe("#2a0081");
    expect(z.light.ring).toBe("#2a0081");
    expect(z.light.highlight).toBe("#f5c700");
    expect(z.light["highlight-foreground"]).toBe("#2a0081");
    expect(z.light["brand-accent"]).toBe("#ffd3f0");
    expect(z.light["brand-accent-foreground"]).toBe("#2a0081");
    expect(z.dark.highlight).toBe("#f5c700");
  });

  it("every clinic sees only zemana", () => {
    for (const slug of ["grais", "karina-manicure", "nova"]) {
      expect(palettesForClinic(slug).map((p) => p.id)).toEqual(["zemana"]);
    }
  });

  it("resolvePalette always returns zemana", () => {
    expect(resolvePalette("karina-manicure", "karina-rosa").id).toBe("zemana");
    expect(resolvePalette("x", undefined).id).toBe("zemana");
  });

  it("globals.css identity tokens equal the zemana palette", () => {
    const css = readFileSync(
      join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    const blockOf = (selector: RegExp) => {
      const m = css.match(selector);
      if (!m) throw new Error(`block not found: ${selector}`);
      return m[1];
    };
    const blocks = {
      light: blockOf(/^:root\s*\{([^}]*)\}/m),
      dark: blockOf(/^\.dark\s*\{([^}]*)\}/m),
    };
    const names = Object.keys(PALETTES.zemana.light) as TokenName[];
    expect(names).toHaveLength(11);
    for (const theme of ["light", "dark"] as const) {
      for (const name of names) {
        const m = blocks[theme].match(
          new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`),
        );
        expect(m, `${theme} --${name} missing`).not.toBeNull();
        expect(m![1].toLowerCase(), `${theme} --${name}`).toBe(
          PALETTES.zemana[theme][name],
        );
      }
    }
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
