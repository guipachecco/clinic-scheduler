export type TokenName =
  | "primary"
  | "primary-pressed"
  | "primary-foreground"
  | "highlight"
  | "highlight-foreground"
  | "brand"
  | "brand-foreground"
  | "brand-muted"
  | "brand-accent"
  | "brand-accent-foreground"
  | "ring";

export type Palette = {
  id: string;
  name: string;
  description: string;
  light: Record<TokenName, string>;
  dark: Record<TokenName, string>;
};

export const GRAIS_PALETTE_ID = "grais";
export const NEUTRAL_PALETTE_ID = "painel";
export const ZEMANA_PALETTE_ID = "zemana";

const INK = "#1c1a22";
const WHITE = "#ffffff";
const DARK_PAGE = "#0b0b10";
const DARK_TEXT = "#f2f0f5";

type Tones = {
  /** Main tone: primary and brand in the light theme. */
  main: string;
  mainPressed: string;
  /** Darkened main tone, used as text on the light tint. */
  deep: string;
  highlight: string;
  highlightForeground: string;
  /** Light tint: brand-accent, and primary in the dark theme. */
  tint: string;
  tintPressed: string;
  /** Dark theme surface tones. */
  darkBrand: string;
  darkBrandMuted: string;
};

function fromTones(
  id: string,
  name: string,
  description: string,
  t: Tones,
): Palette {
  return {
    id,
    name,
    description,
    light: {
      primary: t.main,
      "primary-pressed": t.mainPressed,
      "primary-foreground": WHITE,
      highlight: t.highlight,
      "highlight-foreground": t.highlightForeground,
      brand: t.main,
      "brand-foreground": WHITE,
      "brand-muted": t.mainPressed,
      "brand-accent": t.tint,
      "brand-accent-foreground": t.deep,
      ring: t.main,
    },
    dark: {
      primary: t.tint,
      "primary-pressed": t.tintPressed,
      "primary-foreground": DARK_PAGE,
      highlight: t.highlight,
      "highlight-foreground": t.highlightForeground,
      brand: t.darkBrand,
      "brand-foreground": DARK_TEXT,
      "brand-muted": t.darkBrandMuted,
      "brand-accent": t.tint,
      "brand-accent-foreground": t.deep,
      ring: t.tint,
    },
  };
}

const GRAIS: Palette = {
  id: GRAIS_PALETTE_ID,
  name: "Grais",
  description: "Identidade atual da Grais: azul profundo e amarelo.",
  light: {
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
  },
  dark: {
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
  },
};

// The Zemana brand: purple, yellow and pink from the identity manual.
const ZEMANA: Palette = {
  id: ZEMANA_PALETTE_ID,
  name: "Zemana",
  description: "Identidade Zemana: roxo profundo, amarelo e rosa.",
  light: {
    primary: "#2a0081",
    "primary-pressed": "#1d005c",
    "primary-foreground": "#ffffff",
    highlight: "#f5c700",
    "highlight-foreground": "#2a0081",
    brand: "#2a0081",
    "brand-foreground": "#ffffff",
    "brand-muted": "#1d005c",
    "brand-accent": "#ffd3f0",
    "brand-accent-foreground": "#2a0081",
    ring: "#2a0081",
  },
  dark: {
    primary: "#b7e7fc",
    "primary-pressed": "#8fd3f2",
    "primary-foreground": "#0b0b10",
    highlight: "#f5c700",
    "highlight-foreground": "#2a0081",
    brand: "#14033a",
    "brand-foreground": "#f2f0f5",
    "brand-muted": "#1d0a52",
    "brand-accent": "#ffd3f0",
    "brand-accent-foreground": "#2a0081",
    ring: "#b7e7fc",
  },
};

const LIST: Palette[] = [
  ZEMANA,
  GRAIS,
  fromTones(
    "karol-vinho",
    "Nude e vinho",
    "Vinho profundo com dourado suave sobre fundo nude.",
    {
      main: "#6e1f2e",
      mainPressed: "#581925",
      deep: "#3d1119",
      highlight: "#b08d57",
      highlightForeground: INK,
      tint: "#e8d3c3",
      tintPressed: "#ccbaac",
      darkBrand: "#2c0c12",
      darkBrandMuted: "#3d1119",
    },
  ),
  fromTones(
    "karol-preto-ouro",
    "Preto e dourado",
    "Preto elegante com detalhes em dourado.",
    {
      main: "#1f1b1a",
      mainPressed: "#191615",
      deep: "#110f0e",
      highlight: "#b8925a",
      highlightForeground: INK,
      tint: "#ece3d6",
      tintPressed: "#d0c8bc",
      darkBrand: "#0c0b0a",
      darkBrandMuted: "#110f0e",
    },
  ),
  fromTones(
    "karol-rose",
    "Rosé terroso",
    "Tons de rosé e terracota, acolhedores e suaves.",
    {
      main: "#a4553f",
      mainPressed: "#834432",
      deep: "#5a2f23",
      highlight: "#d9a38f",
      highlightForeground: INK,
      tint: "#f5ded5",
      tintPressed: "#d8c3bb",
      darkBrand: "#422219",
      darkBrandMuted: "#5a2f23",
    },
  ),
  fromTones(
    "sirlei-salvia",
    "Sálvia",
    "Verde sálvia calmo, para um ambiente de relaxamento.",
    {
      main: "#4f6f5a",
      mainPressed: "#3f5948",
      deep: "#2b3d32",
      highlight: "#a9bfa8",
      highlightForeground: INK,
      tint: "#e3ebe4",
      tintPressed: "#c8cfc9",
      darkBrand: "#202c24",
      darkBrandMuted: "#2b3d32",
    },
  ),
  fromTones(
    "sirlei-argila",
    "Argila",
    "Tons terrosos de argila, quentes e naturais.",
    {
      main: "#8a5a44",
      mainPressed: "#6e4836",
      deep: "#4c3225",
      highlight: "#c9a88e",
      highlightForeground: INK,
      tint: "#efe3d6",
      tintPressed: "#d2c8bc",
      darkBrand: "#37241b",
      darkBrandMuted: "#4c3225",
    },
  ),
  fromTones(
    "sirlei-grafite",
    "Grafite e cobre",
    "Grafite sóbrio com um toque de cobre.",
    {
      main: "#2e2e33",
      mainPressed: "#252529",
      deep: "#19191c",
      highlight: "#b87348",
      highlightForeground: INK,
      tint: "#e7e3de",
      tintPressed: "#cbc8c3",
      darkBrand: "#121214",
      darkBrandMuted: "#19191c",
    },
  ),
  fromTones(
    "karina-marinho-coral",
    "Marinho e coral",
    "Azul marinho com coral vibrante.",
    {
      main: "#22315a",
      mainPressed: "#1b2748",
      deep: "#131b32",
      // Proposal was #D9503E; darkened (same hue) so white text reaches 4.5:1.
      highlight: "#c8412f",
      highlightForeground: WHITE,
      tint: "#e6e9f2",
      tintPressed: "#cacdd5",
      darkBrand: "#0e1424",
      darkBrandMuted: "#131b32",
    },
  ),
  fromTones(
    "karina-rosa",
    "Rosa esmalte",
    "Rosa intenso, como um esmalte recém-aplicado.",
    {
      main: "#b2295b",
      mainPressed: "#8e2149",
      deep: "#621732",
      highlight: "#e98aae",
      highlightForeground: INK,
      tint: "#f9dce6",
      tintPressed: "#dbc2ca",
      darkBrand: "#471024",
      darkBrandMuted: "#621732",
    },
  ),
  fromTones(
    "karina-ameixa",
    "Ameixa e dourado",
    "Ameixa profunda com dourado.",
    {
      main: "#5b3a7a",
      mainPressed: "#492e62",
      deep: "#322043",
      highlight: "#c9a84e",
      highlightForeground: INK,
      tint: "#ece3f6",
      tintPressed: "#d0c8d8",
      darkBrand: "#241731",
      darkBrandMuted: "#322043",
    },
  ),
  fromTones(
    NEUTRAL_PALETTE_ID,
    "Painel (neutra)",
    "Azul acinzentado neutro, para clínicas sem identidade própria.",
    {
      main: "#3e4c63",
      mainPressed: "#323d4f",
      deep: "#222a36",
      highlight: "#d8e1ee",
      highlightForeground: INK,
      tint: "#c7d3e3",
      tintPressed: "#afbac8",
      darkBrand: "#191e28",
      darkBrandMuted: "#222a36",
    },
  ),
];

export const PALETTES: Record<string, Palette> = Object.fromEntries(
  LIST.map((palette) => [palette.id, palette]),
);

const OFFERED: readonly string[] = Object.freeze([ZEMANA_PALETTE_ID]);

export const CLINIC_BRANDING: Record<
  string,
  {
    palettes: readonly string[];
    displayName: string | null;
    areaLabel: string | null;
  }
> = {
  "karol-pacheco": {
    palettes: OFFERED,
    displayName: "Karol Pacheco",
    areaLabel: "Estética",
  },
  "sirlei-massoterapia": {
    palettes: OFFERED,
    displayName: "Sirlei",
    areaLabel: "Massoterapia",
  },
  "karina-manicure": {
    palettes: OFFERED,
    displayName: "Karina",
    areaLabel: "Manicure",
  },
  grais: {
    palettes: OFFERED,
    displayName: null,
    areaLabel: null,
  },
};

/** Every clinic uses the Zemana brand; the older palettes are kept but not offered. */
export function palettesForClinic(slug: string): Palette[] {
  void slug;
  return [PALETTES[ZEMANA_PALETTE_ID]];
}

/** Always the Zemana palette, whatever a clinic stored before. */
export function resolvePalette(
  slug: string,
  stored: string | undefined,
): Palette {
  void stored;
  return palettesForClinic(slug)[0];
}

function block(tokens: Record<TokenName, string>): string {
  return (Object.keys(tokens) as TokenName[])
    .map((name) => `--${name}:${tokens[name]};`)
    .join("");
}

export function paletteCss(palette: Palette): string {
  return `:root{${block(palette.light)}}.dark{${block(palette.dark)}}`;
}

/** First letter of the first and last word, uppercase, at most two. */
export function initialsFor(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toLocaleUpperCase("pt-BR");
}
