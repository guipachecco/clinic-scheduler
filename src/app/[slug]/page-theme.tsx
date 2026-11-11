import type { ClinicTheme } from "@/db/schema/clinic";
import { HEX_COLOR, paletteFromColor } from "@/modules/branding/derive";
import type { TokenName } from "@/modules/branding/palettes";
import { BUTTON_SHAPES } from "@/modules/page-style/buttons";
import { pageStyleVars } from "@/modules/page-style/fonts";

// The look the owner published for her page (page builder), applied only
// inside the page's container so that it never leaks into the panel or other
// screens. Without a chosen color the Zemana palette of globals.css stays.

function declarations(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([name, value]) => `${name}:${value};`)
    .join("");
}

function tokens(palette: Record<TokenName, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(palette).map(([name, value]) => [`--${name}`, value]),
  );
}

/** The chosen color as #rrggbb; null when there is none or it is invalid. */
export function customColor(theme: ClinicTheme): string | null {
  const raw: unknown = theme.primaryColor;
  const color = typeof raw === "string" ? raw.toLowerCase() : null;
  return color && HEX_COLOR.test(color) ? color : null;
}

/** The palette of the chosen color, scoped; "" without a valid color. */
export function pageThemeCss(theme: ClinicTheme, scope: string): string {
  // Only a validated #rrggbb reaches paletteFromColor (and the <style>).
  const color = customColor(theme);
  if (!color) return "";
  const palette = paletteFromColor(color);
  return `${scope}{${declarations(tokens(palette.light))}}.dark ${scope}{${declarations(tokens(palette.dark))}}`;
}

/** Heading font and button radius, scoped (defaults when nothing is chosen). */
export function pageStyleCss(theme: ClinicTheme, scope: string): string {
  // pageStyleVars falls back to the first font for an unknown id; an unknown
  // shape is dropped here so that it falls back to the pill.
  const shape = BUTTON_SHAPES.find((s) => s === theme.buttonShape);
  const vars = pageStyleVars({ fontId: theme.fontId, buttonShape: shape });
  // The chosen family first, then the same fallbacks as globals.css.
  vars["--font-heading"] = `${vars["--font-heading"]}, system-ui, sans-serif`;
  return `${scope}{${declarations(vars)}}`;
}

// Rendered inside the page's container (the layout), before its content.
export function PageTheme({
  theme,
  scopeClass,
}: {
  theme: ClinicTheme;
  scopeClass: string;
}) {
  const scope = `.${scopeClass}`;
  const css = pageThemeCss(theme, scope) + pageStyleCss(theme, scope);
  // Raw text on purpose: React would escape the quotes of the font names.
  // Every value comes from fixed lists or from the validated color, so it
  // cannot close the element.
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
