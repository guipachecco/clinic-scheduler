import type { ClinicTheme } from "@/db/schema/clinic";

import { buttonRadius } from "./buttons";

export const FONTS = [
  {
    id: "bricolage",
    label: "Moderna",
    family: '"Bricolage Grotesque Variable"',
  },
  { id: "playfair", label: "Elegante", family: '"Playfair Display Variable"' },
  { id: "oswald", label: "Forte", family: '"Oswald Variable"' },
  { id: "quicksand", label: "Delicada", family: '"Quicksand Variable"' },
  { id: "dmsans", label: "Simples", family: '"DM Sans Variable"' },
] as const;

export type FontId = (typeof FONTS)[number]["id"];

export function fontFamily(id: FontId | undefined): string {
  return (FONTS.find((f) => f.id === id) ?? FONTS[0]).family;
}

export function pageStyleVars(theme: ClinicTheme): Record<string, string> {
  return {
    "--font-heading": fontFamily(theme.fontId as FontId | undefined),
    "--radius-button": buttonRadius(theme.buttonShape),
  };
}
