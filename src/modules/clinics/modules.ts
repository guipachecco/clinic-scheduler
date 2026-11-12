import * as z from "zod";

// Optional modules a clinic can have on or off. The order here is the
// canonical order used for display and for normalizing stored lists.
export const CLINIC_MODULES = [
  "products",
  "finance",
  "online_booking",
  "loyalty",
  "anamnesis",
  "reviews",
] as const;

export type ClinicModule = (typeof CLINIC_MODULES)[number];

export const CLINIC_MODULE_LABELS: Record<ClinicModule, string> = {
  products: "Produtos",
  finance: "Financeiro",
  online_booking: "Agendamento online",
  loyalty: "Fidelidade",
  anamnesis: "Anamnese",
  reviews: "Avaliações",
};

export const MODULE_OFF_ERROR = "Este recurso não está ativo para a clínica.";

export function hasModule(
  clinic: { modules: readonly string[] },
  key: ClinicModule,
): boolean {
  return clinic.modules.includes(key);
}

// Drops duplicates and sorts by the catalog order; an empty list is valid.
export const modulesSchema: z.ZodType<ClinicModule[], ClinicModule[]> = z
  .array(z.enum(CLINIC_MODULES))
  .transform((list) => CLINIC_MODULES.filter((key) => list.includes(key)));
