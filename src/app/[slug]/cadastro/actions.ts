"use server";

import { redirect } from "next/navigation";

import { findPgError } from "@/db/errors";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { createClientAccount } from "@/modules/clients/accounts";
import {
  getClientContext,
  registerClientPatient,
} from "@/modules/clients/context";
import {
  completeSchema,
  fieldErrorsOf,
  signupSchema,
} from "@/modules/clients/forms";
import {
  findClinic,
  getClientUser,
  requestIp,
  safeNext,
} from "@/modules/clients/session";

// Signup and "complete your record" on a clinic link. Nothing here logs
// personal data; unexpected errors become a generic message.

export type SignupResult =
  { ok: true } | { ok: false; fieldErrors: Record<string, string> };

const GENERIC_ERROR = "Não foi possível criar a conta. Tente novamente.";
const ONLINE_OFF =
  "O agendamento online desta clínica está desligado. Fale direto com ela.";

// Creates her account (role client, by createClientAccount, limited per IP)
// and her record in this clinic, then sends the confirmation e-mail. The
// browser signs in next, through Better Auth's own endpoint.
export async function signUp(
  slug: string,
  input: unknown,
): Promise<SignupResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  }
  const clinic = await findClinic(slug);
  if (!clinic) {
    return { ok: false, fieldErrors: { form: "Clínica não encontrada." } };
  }
  // The page shows Unavailable; this also stops a direct call.
  if (!clinic.onlineBookingEnabled) {
    return { ok: false, fieldErrors: { form: ONLINE_OFF } };
  }
  const { name, phone, email, password } = parsed.data;

  let userId: string;
  try {
    const account = await createClientAccount({
      name,
      email,
      password,
      clinicSlug: clinic.slug,
      ip: await requestIp(),
    });
    if (!account.ok) return { ok: false, fieldErrors: account.fieldErrors };
    userId = account.userId;
  } catch (error) {
    logger.error("client signup failed", { error });
    return { ok: false, fieldErrors: { form: GENERIC_ERROR } };
  }

  // The account exists from here on. If her record fails, the next sign-in
  // asks for it again (cadastro?completar=1).
  try {
    await registerClientPatient({
      clinicId: clinic.id,
      userId,
      name,
      phone,
      email,
    });
  } catch (error) {
    logger.error("client record failed after signup", {
      code: findPgError(error)?.code,
    });
  }
  try {
    await auth.api.sendVerificationEmail({
      body: { email, callbackURL: `/${clinic.slug}/confirmar-email` },
    });
  } catch (error) {
    logger.error("verification e-mail failed after signup", { error });
  }
  return { ok: true };
}

export type CompleteResult = { ok: false; fieldErrors: Record<string, string> };

// Her record in this clinic, for an account that already exists (signed up
// on another clinic's link). Ends in a redirect.
export async function completeRegistration(
  slug: string,
  input: unknown,
  next: unknown,
): Promise<CompleteResult> {
  const destination = safeNext(slug, next) ?? `/${slug}/marcar`;
  const user = await getClientUser();
  if (!user) redirect(`/${slug}/entrar`);
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  }
  const context = await getClientContext(slug, user.id);
  if (!context) {
    return { ok: false, fieldErrors: { form: "Clínica não encontrada." } };
  }
  if (!context.clinic.onlineBookingEnabled) {
    return { ok: false, fieldErrors: { form: ONLINE_OFF } };
  }
  if (!context.patientId) {
    try {
      await registerClientPatient({
        clinicId: context.clinic.id,
        userId: user.id,
        name: parsed.data.name,
        phone: parsed.data.phone,
        email: user.email,
      });
    } catch (error) {
      const code = findPgError(error)?.code;
      // P0001: she already has a record there (a second tab).
      if (code !== "P0001") {
        logger.error("client record failed", { code });
        return {
          ok: false,
          fieldErrors: { form: "Não foi possível salvar. Tente novamente." },
        };
      }
    }
  }
  redirect(destination);
}
