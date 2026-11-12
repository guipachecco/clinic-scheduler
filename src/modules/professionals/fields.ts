import * as z from "zod";

// Form schema of the clinic's team (professionals). This file is imported by
// client components, so it must not touch the database or server-only code.

const checkbox = z
  .union([z.boolean(), z.literal("on")])
  .optional()
  .transform((value) => value === true || value === "on");

export const MAX_SORT_ORDER = 999;

export const professionalFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome.")
    .max(60, "Nome muito longo (máximo de 60 caracteres)."),
  registration: z
    .string()
    .trim()
    .max(40, "Registro muito longo (máximo de 40 caracteres).")
    .transform((value) => value || null),
  sortOrder: z
    .union([z.string(), z.number()])
    .transform((value, ctx): number => {
      const text = String(value).trim();
      if (text === "") return 0;
      const number = Number(text);
      if (!Number.isInteger(number) || number < 0 || number > MAX_SORT_ORDER) {
        ctx.addIssue({
          code: "custom",
          message: `Use um número inteiro de 0 a ${MAX_SORT_ORDER}.`,
        });
        return z.NEVER;
      }
      return number;
    }),
  isActive: checkbox,
});

export type ProfessionalFormInput = z.input<typeof professionalFormSchema>;
export type ProfessionalFormValues = z.output<typeof professionalFormSchema>;
