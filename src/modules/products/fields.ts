import * as z from "zod";

import { parsePriceInput } from "@/modules/clinic-page/fields";

// Form schemas of the products catalog. This file is imported by client
// components, so it must not touch the database or server-only code.

// Checkboxes: true / "on" when ticked, absent when not.
const checkbox = z
  .union([z.boolean(), z.literal("on")])
  .optional()
  .transform((value) => value === true || value === "on");

export const productFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Informe o nome do produto.")
      .max(80, "Nome muito longo (máximo de 80 caracteres)."),
    categoryId: z.uuid("Escolha a categoria."),
    description: z
      .string()
      .trim()
      .max(300, "Descrição muito longa (máximo de 300 caracteres).")
      .transform((value) => value || null),
    price: z.string().transform((value, ctx): number | null => {
      const cents = parsePriceInput(value);
      if (cents === "invalid") {
        ctx.addIssue({ code: "custom", message: "Preço inválido." });
        return z.NEVER;
      }
      return cents;
    }),
    showOnPage: checkbox,
    isActive: checkbox,
  })
  .transform(({ price, ...rest }) => ({ ...rest, priceCents: price }));

export const productCategoryFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome da categoria.")
    .max(40, "Nome muito longo (máximo de 40 caracteres)."),
});

export type ProductFormInput = z.input<typeof productFormSchema>;
export type ProductFormValues = z.output<typeof productFormSchema>;
export type ProductCategoryFormInput = z.input<
  typeof productCategoryFormSchema
>;
export type ProductCategoryFormValues = z.output<
  typeof productCategoryFormSchema
>;
