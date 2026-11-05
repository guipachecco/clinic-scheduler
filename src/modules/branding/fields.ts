import * as z from "zod";

// Client-safe validation for the clinic's display name and area.

const optionalText = z
  .string()
  .trim()
  .max(40, "Use no máximo 40 caracteres.")
  .transform((value) => (value === "" ? null : value));

export const brandingTextSchema = z.object({
  displayName: optionalText,
  areaLabel: optionalText,
});

export type BrandingTextInput = z.input<typeof brandingTextSchema>;
export type BrandingTextValues = z.output<typeof brandingTextSchema>;
