import { contrastRatio, mixColors } from "./contrast";
import { PALETTES, type Palette, ZEMANA_PALETTE_ID } from "./palettes";

export const HEX_COLOR = /^#[0-9a-f]{6}$/;

const INK = "#1c1a22";
const WHITE = "#ffffff";
const BLACK = "#000000";
const DARK_PAGE = "#0b0b10";
const DARK_TEXT = "#f2f0f5";
const STEP = 0.02;

/** Whichever of white or ink has the higher contrast over `hex`. */
export function readableOn(hex: string): "#ffffff" | "#1c1a22" {
  return contrastRatio(hex, WHITE) >= contrastRatio(hex, INK) ? WHITE : INK;
}

/**
 * Text color for a button over `hex`: white or ink when one reaches 4.5, else
 * pure black or white. Ink alone tops out near 4.2 on mid-tones.
 */
function foregroundFor(hex: string): string {
  const preferred = readableOn(hex);
  if (contrastRatio(hex, preferred) >= 4.5) return preferred;
  return contrastRatio(hex, BLACK) >= contrastRatio(hex, WHITE) ? BLACK : WHITE;
}

/** Mixes `color` toward `target` in 2% steps until it reaches `ratio` against `against`. */
function shiftUntil(
  color: string,
  target: string,
  against: string,
  ratio: number,
): string {
  for (let amount = 0; amount < 1; amount += STEP) {
    const candidate = mixColors(color, target, amount);
    if (contrastRatio(candidate, against) >= ratio) return candidate;
  }
  return target;
}

/** Builds a readable palette in both themes from any `#rrggbb` color. */
export function paletteFromColor(hex: string): Palette {
  const color = hex.toLowerCase();
  if (!HEX_COLOR.test(color)) throw new Error(`Invalid color: ${hex}`);
  const zemana = PALETTES[ZEMANA_PALETTE_ID];
  const pressed = mixColors(color, BLACK, 0.12);
  const accent = mixColors(color, WHITE, 0.85);
  const accentForeground = shiftUntil(color, BLACK, accent, 4.5);
  const textOnLight = shiftUntil(color, BLACK, WHITE, 4.5);
  const darkPrimary = shiftUntil(color, WHITE, DARK_PAGE, 4.5);

  return {
    id: "custom",
    name: "Cor personalizada",
    description: "Paleta gerada a partir da cor escolhida.",
    light: {
      primary: color,
      "primary-pressed": pressed,
      "primary-foreground": foregroundFor(color),
      "primary-text": textOnLight,
      highlight: zemana.light.highlight,
      "highlight-foreground": zemana.light["highlight-foreground"],
      brand: color,
      "brand-foreground": foregroundFor(color),
      "brand-muted": pressed,
      "brand-accent": accent,
      "brand-accent-foreground": accentForeground,
      ring: shiftUntil(color, BLACK, WHITE, 3),
    },
    dark: {
      primary: darkPrimary,
      "primary-pressed": mixColors(darkPrimary, BLACK, 0.12),
      "primary-foreground": foregroundFor(darkPrimary),
      "primary-text": darkPrimary,
      highlight: zemana.dark.highlight,
      "highlight-foreground": zemana.dark["highlight-foreground"],
      brand: mixColors(color, DARK_PAGE, 0.8),
      "brand-foreground": DARK_TEXT,
      // brand-muted: 70% toward the page, a step lighter than brand (80%).
      // brand-accent and its foreground reuse the light values, which are
      // already readable and do not depend on the theme.
      "brand-muted": mixColors(color, DARK_PAGE, 0.7),
      "brand-accent": accent,
      "brand-accent-foreground": accentForeground,
      ring: darkPrimary,
    },
  };
}
