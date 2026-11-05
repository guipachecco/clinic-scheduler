import { type Palette, paletteCss } from "@/modules/branding/palettes";

// Overrides the identity tokens of globals.css with the palette's values.
export function PaletteStyle({ palette }: { palette: Palette }) {
  return <style>{paletteCss(palette)}</style>;
}
