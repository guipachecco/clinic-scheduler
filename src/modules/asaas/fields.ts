import * as z from "zod";

import { isValidCpfCnpj } from "./rules";

// Form of the "Receber sinal por Pix" activation. Imported by client
// components: no database, no server-only code. Input comes as typed text;
// the parsed value is what createSubaccount receives.

export const COMPANY_TYPES = [
  { value: "MEI", label: "MEI" },
  { value: "LIMITED", label: "Empresa limitada (Ltda)" },
  { value: "INDIVIDUAL", label: "Empresa individual" },
  { value: "ASSOCIATION", label: "Associação" },
] as const;

const digits = (value: string) => value.replace(/\D/g, "");

const required = (message: string, max = 120) =>
  z.string().trim().min(1, message).max(max, "Texto longo demais.");

// "R$ 5.000,00", "5000" or "5000,5" -> 5000 / 5000.5. NaN when invalid.
function readMoney(input: string): number {
  const text = input.trim().replace(/^R\$\s*/i, "");
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(text)) return NaN;
  return Number(text.replace(/\./g, "").replace(",", "."));
}

export const activationSchema = z
  .object({
    name: required("Informe o nome ou a razão social."),
    email: z.email("Informe um e-mail válido.").max(160),
    cpfCnpj: z
      .string()
      .transform(digits)
      .refine(isValidCpfCnpj, "CPF ou CNPJ inválido."),
    // Natural person: birth date. Company: its type.
    birthDate: z.string().trim().default(""),
    companyType: z.string().trim().default(""),
    mobilePhone: z
      .string()
      .transform(digits)
      .refine((v) => v.length === 10 || v.length === 11, "Celular inválido."),
    incomeValue: z
      .string()
      .transform(readMoney)
      .refine((v) => Number.isFinite(v) && v > 0, "Informe um valor."),
    postalCode: z
      .string()
      .transform(digits)
      .refine((v) => v.length === 8, "CEP inválido."),
    address: required("Informe o endereço."),
    addressNumber: required("Informe o número.", 20),
    province: required("Informe o bairro."),
  })
  .superRefine((value, ctx) => {
    if (value.cpfCnpj.length === 11) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value.birthDate)) {
        ctx.addIssue({
          code: "custom",
          path: ["birthDate"],
          message: "Informe a data de nascimento.",
        });
      }
    } else if (
      !COMPANY_TYPES.some((type) => type.value === value.companyType)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["companyType"],
        message: "Escolha o tipo de empresa.",
      });
    }
  })
  .transform((value) => ({
    name: value.name,
    email: value.email,
    cpfCnpj: value.cpfCnpj,
    ...(value.cpfCnpj.length === 11
      ? { birthDate: value.birthDate }
      : { companyType: value.companyType }),
    mobilePhone: value.mobilePhone,
    incomeValue: value.incomeValue,
    postalCode: value.postalCode,
    address: value.address,
    addressNumber: value.addressNumber,
    province: value.province,
  }));

export type ActivationInput = z.input<typeof activationSchema>;
export type ActivationValues = z.output<typeof activationSchema> & {
  birthDate?: string;
  companyType?: string;
};
