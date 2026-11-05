import * as z from "zod";

import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/modules/auth/password-policy";
import { normalizeBrPhone } from "@/modules/patients/fields";

// Form schemas of the clinic link's pages. Imported by client components and
// by their Server Actions (which parse again), so nothing server-only here.

const name = z
  .string()
  .trim()
  .min(1, "Informe o nome.")
  .max(100, "O nome pode ter no máximo 100 caracteres.");

const phone = z
  .string()
  .trim()
  .refine(
    (value) => normalizeBrPhone(value) !== null,
    "Informe um celular com DDD, por exemplo (11) 98765-4321.",
  );

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Informe um e-mail válido."));

const password = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
  )
  .max(
    MAX_PASSWORD_LENGTH,
    `A senha pode ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.`,
  );

export const signupSchema = z.object({ name, phone, email, password });
export type SignupValues = z.infer<typeof signupSchema>;

export const completeSchema = z.object({ name, phone });
export type CompleteValues = z.infer<typeof completeSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Informe a senha."),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const forgotSchema = z.object({ email });
export type ForgotValues = z.infer<typeof forgotSchema>;

export const newPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((values) => values.password === values.confirm, {
    path: ["confirm"],
    message: "As senhas não são iguais.",
  });
export type NewPasswordValues = z.infer<typeof newPasswordSchema>;

// Field errors of a failed parse, first message per field.
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= issue.message;
  }
  return errors;
}
