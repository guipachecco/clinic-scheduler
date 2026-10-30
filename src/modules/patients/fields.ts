import * as z from "zod";

// Pure helpers and the form schema for patients. This file is imported by
// client components, so it must not touch the database or server-only code.

const CLINIC_TIME_ZONE = "America/Sao_Paulo";
const MAX_AGE_YEARS = 120;

// Lowercase, no accents, single inner spaces. The same function is used when
// saving and when searching, so both sides always agree.
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Returns the 11 digits when the check digits are valid, else null.
export function parseCpf(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return null;
  const checkDigit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += Number(digits[i]) * (length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  if (checkDigit(9) !== Number(digits[9])) return null;
  if (checkDigit(10) !== Number(digits[10])) return null;
  return digits;
}

// Accepts a Brazilian number with area code (10 or 11 digits), optionally
// prefixed with 55 or +55. Returns E.164 (+55...) or null.
export function normalizeBrPhone(input: string): string | null {
  let digits = input.replace(/[\s().-]/g, "");
  if (!/^\+?\d+$/.test(digits)) return null;
  digits = digits.replace(/^\+/, "");
  if (
    (digits.length === 12 || digits.length === 13) &&
    digits.startsWith("55")
  ) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10 && digits.length !== 11) return null;
  const area = Number(digits.slice(0, 2));
  if (digits[0] === "0" || area < 11 || area > 99) return null;
  if (digits.length === 11 && digits[2] !== "9") return null;
  return `+55${digits}`;
}

// Progressive CPF mask for typing: 000.000.000-00. Digits only, at most 11.
export function formatCpfInput(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// Progressive Brazilian phone mask for typing: (00) 0000-0000 or
// (00) 00000-0000. A leading 55 is dropped only when more than 11 digits
// remain, so pasting +55... works but typing 55 as an area code does not.
export function formatBrPhoneInput(value: string): string {
  let d = value.replace(/\D/g, "");
  // A pasted number may carry the country code. A value that already starts
  // with "(" is the masked field being typed into: its 55 is an area code.
  const pasted = !value.trimStart().startsWith("(");
  if (pasted && d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  const split = d.length === 11 ? 7 : 6;
  return `(${d.slice(0, 2)}) ${d.slice(2, split)}-${d.slice(split)}`;
}

// Stored E.164 (+55...) -> display mask. Empty string for null.
export function formatStoredPhone(e164: string | null): string {
  if (!e164) return "";
  const digits = e164.replace(/\D/g, "");
  const national =
    digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
  if (national.length !== 10 && national.length !== 11) return e164;
  return formatBrPhoneInput(national);
}

// Stored CPF (11 digits) -> display mask. Empty string for null.
export function formatStoredCpf(digits: string | null): string {
  if (!digits) return "";
  return formatCpfInput(digits);
}

function parseIsoDate(value: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return [year, month, day];
}

// Whole years between two YYYY-MM-DD dates.
export function ageOn(birthDate: string, today: string): number {
  const birth = parseIsoDate(birthDate);
  const now = parseIsoDate(today);
  if (!birth || !now) throw new Error("Invalid date");
  let age = now[0] - birth[0];
  if (now[1] < birth[1] || (now[1] === birth[1] && now[2] < birth[2])) age -= 1;
  return age;
}

export function isMinor(birthDate: string, today: string): boolean {
  return ageOn(birthDate, today) < 18;
}

// Today's date (YYYY-MM-DD) in the clinic time zone.
export function todayInClinic(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CLINIC_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export const GENDERS = [
  { value: "male", label: "Masculino" },
  { value: "female", label: "Feminino" },
  { value: "other", label: "Outro" },
  { value: "undisclosed", label: "Prefere não informar" },
] as const;

export const REFERRAL_SOURCES = [
  { value: "google", label: "Google" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "referral", label: "Indicação" },
  { value: "school", label: "Escola" },
  { value: "outdoor", label: "Outdoor" },
  { value: "flyer", label: "Panfleto" },
  { value: "sign", label: "Placa" },
  { value: "insurance", label: "Plano/Convênio" },
  { value: "radio", label: "Rádio" },
  { value: "tv", label: "TV" },
  { value: "magazine", label: "Revista" },
  { value: "other", label: "Outros" },
] as const;

type Gender = (typeof GENDERS)[number]["value"];
type ReferralSource = (typeof REFERRAL_SOURCES)[number]["value"];

// Raw form text; an empty string means "not provided" and becomes null.
function optionalText(max: number, message: string) {
  return z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value === "" ? null : value));
}

function optionalEnum<T extends string>(values: readonly T[], message: string) {
  return z
    .string()
    .trim()
    .transform((value, ctx): T | null => {
      if (value === "") return null;
      const found = values.find((candidate) => candidate === value);
      if (found === undefined) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return found;
    });
}

const phoneMessage = "Informe um telefone do Brasil com DDD.";

export const patientFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Informe o nome completo.")
      .max(120, "O nome pode ter no máximo 120 caracteres."),
    nickname: optionalText(40, "O apelido pode ter no máximo 40 caracteres."),
    cpf: z
      .string()
      .trim()
      .transform((value, ctx): string | null => {
        if (value === "") return null;
        const cpf = parseCpf(value);
        if (!cpf) {
          ctx.addIssue({ code: "custom", message: "CPF inválido." });
          return z.NEVER;
        }
        return cpf;
      }),
    rg: optionalText(20, "O RG pode ter no máximo 20 caracteres."),
    phone: z
      .string()
      .trim()
      .transform((value, ctx): string => {
        const phone = normalizeBrPhone(value);
        if (!phone) {
          ctx.addIssue({
            code: "custom",
            message: value === "" ? "Informe o WhatsApp." : phoneMessage,
          });
          return z.NEVER;
        }
        return phone;
      }),
    landlinePhone: z
      .string()
      .trim()
      .transform((value, ctx): string | null => {
        if (value === "") return null;
        const phone = normalizeBrPhone(value);
        if (!phone) {
          ctx.addIssue({ code: "custom", message: phoneMessage });
          return z.NEVER;
        }
        return phone;
      }),
    email: z
      .string()
      .trim()
      .transform((value, ctx): string | null => {
        if (value === "") return null;
        if (value.length > 254) {
          ctx.addIssue({
            code: "custom",
            message: "E-mail muito longo (máximo de 254 caracteres).",
          });
          return z.NEVER;
        }
        if (!z.email().safeParse(value).success) {
          ctx.addIssue({ code: "custom", message: "E-mail inválido." });
          return z.NEVER;
        }
        return value.toLowerCase();
      }),
    birthDate: z
      .string()
      .trim()
      .transform((value, ctx): string => {
        if (value === "") {
          ctx.addIssue({
            code: "custom",
            message: "Informe a data de nascimento.",
          });
          return z.NEVER;
        }
        if (!parseIsoDate(value)) {
          ctx.addIssue({
            code: "custom",
            message: "Data de nascimento inválida.",
          });
          return z.NEVER;
        }
        const today = todayInClinic();
        if (value >= today) {
          ctx.addIssue({
            code: "custom",
            message: "A data de nascimento precisa estar no passado.",
          });
          return z.NEVER;
        }
        if (ageOn(value, today) > MAX_AGE_YEARS) {
          ctx.addIssue({
            code: "custom",
            message:
              "A data de nascimento não pode ser de mais de 120 anos atrás.",
          });
          return z.NEVER;
        }
        return value;
      }),
    gender: optionalEnum<Gender>(
      GENDERS.map((g) => g.value),
      "Gênero inválido.",
    ),
    referralSource: optionalEnum<ReferralSource>(
      REFERRAL_SOURCES.map((r) => r.value),
      "Opção inválida.",
    ),
    referredBy: optionalText(120, "O campo pode ter no máximo 120 caracteres."),
    notes: optionalText(
      1000,
      "As observações podem ter no máximo 1000 caracteres.",
    ),
  })
  .superRefine((data, ctx) => {
    if (data.referredBy !== null && data.referralSource !== "referral") {
      ctx.addIssue({
        code: "custom",
        path: ["referredBy"],
        message:
          "Só é possível informar quem indicou quando a opção é Indicação.",
      });
    }
  });

export type PatientFormInput = z.input<typeof patientFormSchema>;
export type PatientFormValues = z.output<typeof patientFormSchema>;
