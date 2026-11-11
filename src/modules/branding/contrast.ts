function channel(hex: string, start: number): number {
  const value = parseInt(hex.slice(start, start + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return (
    0.2126 * channel(hex, 1) +
    0.7152 * channel(hex, 3) +
    0.0722 * channel(hex, 5)
  );
}

/** WCAG contrast ratio between two `#rrggbb` colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

function toHex(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, "0");
}

/** Mixes `a` with `b`; `amount` (0 to 1) is how much of `b` goes in. */
export function mixColors(a: string, b: string, amount: number): string {
  const parts = [1, 3, 5].map((start) => {
    const x = parseInt(a.slice(start, start + 2), 16);
    const y = parseInt(b.slice(start, start + 2), 16);
    return toHex(x + (y - x) * amount);
  });
  return `#${parts.join("")}`;
}
