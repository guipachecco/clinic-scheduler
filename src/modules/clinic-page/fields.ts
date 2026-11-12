import { z } from "zod";

import { normalizeBrPhone } from "@/modules/patients/fields";

// Fields of the clinic page: parsing and validation shared by the panel and
// the client area. Keep the amenity keys in sync with clinics_amenities_check
// (migration 0017).

export const AMENITIES = [
  "wifi",
  "estacionamento",
  "acessibilidade",
  "ar_condicionado",
  "cafe_agua",
  "banheiro",
  "espaco_kids",
  "aceita_pets",
] as const;

export type Amenity = (typeof AMENITIES)[number];

export const AMENITY_LABELS: Record<Amenity, string> = {
  wifi: "Wi-Fi",
  estacionamento: "Estacionamento",
  acessibilidade: "Acessibilidade",
  ar_condicionado: "Ar-condicionado",
  cafe_agua: "Café e água",
  banheiro: "Banheiro",
  espaco_kids: "Espaço kids",
  aceita_pets: "Aceita pets",
};

const HANDLE = /^[A-Za-z0-9._]{1,30}$/;
const INSTAGRAM_URL =
  /^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([^/?#\s]+)\/?(?:[?#].*)?$/i;

const NOT_PROFILES = new Set([
  "p",
  "reel",
  "reels",
  "explore",
  "stories",
  "accounts",
  "tv",
]);

// Turns "@handle", "handle" or an instagram.com link into the bare handle.
// Null for anything else (other hosts, spaces, empty).
export function parseInstagram(input: string): string | null {
  let value = input.trim();
  const link = INSTAGRAM_URL.exec(value);
  if (link) {
    // Links to posts, reels, etc. are not profiles.
    if (NOT_PROFILES.has(link[1]!.toLowerCase())) return null;
    value = link[1]!;
  } else if (/^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/?$/i.test(value)) {
    return null;
  }
  value = value.replace(/^@/, "");
  return HANDLE.test(value) ? value : null;
}

// Price typed in reais to cents. "" is no price (null); anything unreadable,
// negative or above the column limit is "invalid".
export function parsePriceInput(input: string): number | null | "invalid" {
  let value = input.replace(/R\$/gi, "").replace(/\s+/g, "");
  if (value === "") return null;
  if (value.includes(",")) {
    value = value.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(value)) {
    value = value.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return "invalid";
  const cents = Math.round(Number(value) * 100);
  return cents <= 10_000_000 ? cents : "invalid";
}

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} muito longo (máximo de ${max} caracteres).`)
    .transform((value) => value || null);

export const clinicPageSchema = z
  .object({
    whatsappPhone: z
      .string()
      .trim()
      .transform((value, ctx): string | null => {
        if (value === "") return null;
        const phone = normalizeBrPhone(value);
        if (!phone) {
          ctx.addIssue({
            code: "custom",
            message: "Informe um WhatsApp brasileiro com DDD.",
          });
          return z.NEVER;
        }
        return phone;
      }),
    contactEmail: z
      .string()
      .trim()
      .transform((value, ctx): string | null => {
        if (value === "") return null;
        if (value.length > 254 || !z.email().safeParse(value).success) {
          ctx.addIssue({ code: "custom", message: "E-mail inválido." });
          return z.NEVER;
        }
        return value.toLowerCase();
      }),
    address: optionalText(200, "Endereço"),
    mapsUrl: z
      .string()
      .trim()
      .max(500, "Link muito longo (máximo de 500 caracteres).")
      .refine(
        (value) => value === "" || value.startsWith("https://"),
        "O link do mapa deve começar com https://.",
      )
      .transform((value) => value || null),
    instagram: z
      .string()
      .trim()
      .transform((value, ctx): string | null => {
        if (value === "") return null;
        const handle = parseInstagram(value);
        if (!handle) {
          ctx.addIssue({
            code: "custom",
            message: "Informe o @ ou o link do Instagram.",
          });
          return z.NEVER;
        }
        return handle;
      }),
    amenities: z
      .array(z.enum(AMENITIES))
      .transform((list) => AMENITIES.filter((key) => list.includes(key))),
    onlineBookingEnabled: z.boolean(),
  })
  .transform(({ instagram, ...rest }) => ({
    ...rest,
    instagramHandle: instagram,
  }));

export type ClinicPageInput = z.infer<typeof clinicPageSchema>;

export const loyaltySchema = z
  .object({
    enabled: z.boolean(),
    visits: z.coerce
      .number()
      .int("Informe um número inteiro.")
      .min(2, "O cartão precisa de pelo menos 2 visitas.")
      .max(50, "O cartão aceita no máximo 50 visitas."),
    reward: z
      .string()
      .trim()
      .max(120, "Prêmio muito longo (máximo de 120 caracteres)."),
  })
  .superRefine((value, ctx) => {
    if (value.enabled && value.reward === "") {
      ctx.addIssue({
        code: "custom",
        path: ["reward"],
        message: "Informe o prêmio do cartão fidelidade.",
      });
    }
  });

export type LoyaltyInput = z.infer<typeof loyaltySchema>;

export const reviewSchema = z.object({
  rating: z.coerce
    .number()
    .int("Escolha de 1 a 5 estrelas.")
    .min(1, "Escolha de 1 a 5 estrelas.")
    .max(5, "Escolha de 1 a 5 estrelas."),
  comment: optionalText(500, "Comentário"),
});

export type ReviewInput = z.infer<typeof reviewSchema>;
