import type { ClinicTheme } from "@/db/schema/clinic";

export const BUSINESS_TYPES = [
  "clinic",
  "barbershop",
  "nail_salon",
  "other",
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  clinic: "Clínica",
  barbershop: "Barbearia",
  nail_salon: "Manicure e estética",
  other: "Outro",
};

export function vocabulary(type: BusinessType) {
  return type === "clinic"
    ? {
        person: "paciente",
        people: "pacientes",
        Person: "Paciente",
        People: "Pacientes",
        newPerson: "Novo paciente",
      }
    : {
        person: "cliente",
        people: "clientes",
        Person: "Cliente",
        People: "Clientes",
        newPerson: "Novo cliente",
      };
}

export const STARTER_STYLE: Record<
  BusinessType,
  Required<Pick<ClinicTheme, "primaryColor" | "fontId" | "buttonShape">>
> = {
  clinic: { primaryColor: "#2f6f9f", fontId: "dmsans", buttonShape: "rounded" },
  barbershop: {
    primaryColor: "#1f1b1a",
    fontId: "oswald",
    buttonShape: "square",
  },
  nail_salon: {
    primaryColor: "#c2577a",
    fontId: "quicksand",
    buttonShape: "pill",
  },
  other: { primaryColor: "#7a3cff", fontId: "bricolage", buttonShape: "pill" },
};
