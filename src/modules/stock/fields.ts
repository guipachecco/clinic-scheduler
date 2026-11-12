import * as z from "zod";

// Form schemas of the stock. This file is imported by client components, so
// it must not touch the database or server-only code.

export const MAX_ENTRY_QUANTITY = 10000;
export const MAX_USAGE_QUANTITY = 200;

const quantityField = (max: number) =>
  z
    .union([z.number(), z.string().trim()])
    .transform((value) => (typeof value === "number" ? value : Number(value)))
    .refine(
      (n) => Number.isInteger(n) && n >= 1 && n <= max,
      `A quantidade deve ficar entre 1 e ${max}.`,
    );

export const entrySchema = z.object({
  quantity: quantityField(MAX_ENTRY_QUANTITY),
  note: z
    .string()
    .trim()
    .max(200, "Use no máximo 200 caracteres.")
    .optional()
    .transform((value) => (value ? value : null)),
});

export const usageSchema = z.object({
  productId: z.uuid("Escolha o produto."),
  quantity: quantityField(MAX_USAGE_QUANTITY),
  // "Sem venda" is sent as an empty value.
  saleItemId: z
    .union([z.literal(""), z.null(), z.uuid("Escolha a venda.")])
    .optional()
    .transform((value) => value || null),
});

export type EntryInput = z.input<typeof entrySchema>;
export type EntryValues = z.output<typeof entrySchema>;
export type UsageInput = z.input<typeof usageSchema>;
export type UsageValues = z.output<typeof usageSchema>;
