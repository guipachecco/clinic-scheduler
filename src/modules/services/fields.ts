import * as z from "zod";

// Pure helpers and form schemas for the services catalog. This file is
// imported by client components, so it must not touch the database or
// server-only code.

// Lowercase, no accents, non-alphanumerics become "-", trimmed. The result
// matches ^[a-z0-9]+(-[a-z0-9]+)*$ unless the name has no letters or digits,
// in which case it is "".
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const MAX_CENTS = 2_147_483_647;

// undefined = invalid, null = empty, number = cents.
function readPrice(input: string): number | null | undefined {
  const text = input.trim().replace(/^R\$\s*/i, "");
  if (text === "") return null;
  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(text);
  if (!match) return undefined;
  const reais = Number(match[1]!.replace(/\./g, ""));
  const cents = Number((match[2] ?? "").padEnd(2, "0") || "0");
  const total = reais * 100 + cents;
  return total > MAX_CENTS ? undefined : total;
}

// "1.250,00", "R$ 90" and "90,5" become integer cents. Empty or invalid input
// gives null; the form schema is what reports an invalid price.
export function parsePriceToCents(input: string): number | null {
  return readPrice(input) ?? null;
}

// 125050 -> "R$ 1.250,50"
export function formatCents(cents: number): string {
  const reais = Math.trunc(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const rest = (cents % 100).toString().padStart(2, "0");
  return `R$ ${reais},${rest}`;
}

export const PRICE_DISPLAYS = [
  { value: "fixed", label: "Preço fixo" },
  { value: "starting_at", label: "A partir de" },
  { value: "on_request", label: "Sob consulta" },
  { value: "hidden", label: "Oculto" },
] as const;

type PriceDisplay = (typeof PRICE_DISPLAYS)[number]["value"];

function optionalText(max: number, message: string) {
  return z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value === "" ? null : value));
}

// Number inputs arrive as text. An empty field gives `empty`, or an error
// when `empty` is undefined.
function integerField(
  min: number,
  max: number,
  message: string,
  empty?: number,
) {
  return z
    .string()
    .trim()
    .transform((value, ctx): number => {
      if (value === "" && empty !== undefined) return empty;
      const number = /^\d+$/.test(value) ? Number(value) : NaN;
      if (!Number.isSafeInteger(number) || number < min || number > max) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return number;
    });
}

// Checkboxes: true / "on" when ticked, absent when not.
const checkbox = z
  .union([z.boolean(), z.literal("on")])
  .optional()
  .transform((value) => value === true || value === "on");

const nameMessage = "Informe o nome (de 2 a 80 caracteres).";

export const serviceFormSchema = z
  .object({
    categoryId: z.uuid("Escolha a categoria."),
    name: z
      .string()
      .trim()
      .min(2, nameMessage)
      .max(80, nameMessage)
      .refine(
        (value) => slugify(value) !== "",
        "Use letras ou números no nome.",
      ),
    description: optionalText(
      500,
      "A descrição pode ter no máximo 500 caracteres.",
    ),
    durationMinutes: integerField(
      5,
      720,
      "A duração deve ser de 5 a 720 minutos.",
    ),
    bufferBeforeMinutes: integerField(
      0,
      240,
      "O preparo deve ser de 0 a 240 minutos.",
      0,
    ),
    bufferAfterMinutes: integerField(
      0,
      240,
      "O intervalo deve ser de 0 a 240 minutos.",
      0,
    ),
    price: z
      .string()
      .trim()
      .transform((value, ctx): number | null => {
        const cents = readPrice(value);
        if (cents === undefined) {
          ctx.addIssue({
            code: "custom",
            message: "Informe um preço válido, como 90,00.",
          });
          return z.NEVER;
        }
        return cents;
      }),
    priceDisplay: z.enum(
      PRICE_DISPLAYS.map((d) => d.value) as [PriceDisplay, ...PriceDisplay[]],
      "Escolha como exibir o preço.",
    ),
    requiresApproval: checkbox,
    onlineBookingEnabled: checkbox,
    preparationInstructions: optionalText(
      1000,
      "As orientações podem ter no máximo 1000 caracteres.",
    ),
    isActive: checkbox,
    sortOrder: integerField(
      0,
      1_000_000,
      "A ordem deve ser um número inteiro, 0 ou mais.",
      0,
    ),
  })
  .superRefine((data, ctx) => {
    if (
      data.price === null &&
      (data.priceDisplay === "fixed" || data.priceDisplay === "starting_at")
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["price"],
        message: "Informe o preço para esta forma de exibição.",
      });
    }
  })
  .transform(({ price, ...rest }) => ({ ...rest, priceCents: price }));

export const categoryFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome (de 2 a 60 caracteres).")
    .max(60, "Informe o nome (de 2 a 60 caracteres).")
    .refine((value) => slugify(value) !== "", "Use letras ou números no nome."),
  isActive: checkbox,
  sortOrder: integerField(
    0,
    1_000_000,
    "A ordem deve ser um número inteiro, 0 ou mais.",
    0,
  ),
});

export type ServiceFormInput = z.input<typeof serviceFormSchema>;
export type ServiceFormValues = z.output<typeof serviceFormSchema>;
export type CategoryFormInput = z.input<typeof categoryFormSchema>;
export type CategoryFormValues = z.output<typeof categoryFormSchema>;
