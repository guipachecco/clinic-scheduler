import * as z from "zod";

// Client-safe validation for the clinic form (root only).

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Paths the app already uses, which a clinic slug must not take over.
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "_next",
  "agendar",
  "entrar",
  "favicon.ico",
  "icon.png",
  "apple-icon.png",
  "robots.txt",
  "sitemap.xml",
]);

export const clinicFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome da clínica.")
    .max(100, "O nome pode ter no máximo 100 caracteres."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "O endereço precisa de pelo menos 2 caracteres.")
    .max(40, "O endereço pode ter no máximo 40 caracteres.")
    .regex(
      SLUG_PATTERN,
      "Use só letras minúsculas, números e hífen entre palavras.",
    )
    .refine((slug) => !RESERVED_SLUGS.has(slug), "Este endereço é reservado."),
});

export type ClinicFormInput = z.input<typeof clinicFormSchema>;
export type ClinicFormValues = z.output<typeof clinicFormSchema>;
