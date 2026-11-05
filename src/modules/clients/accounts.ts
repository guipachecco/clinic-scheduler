import "server-only";

import { and, eq, sql } from "drizzle-orm";
import * as z from "zod";

import { platformDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { accounts, auditLogs, clinics, rateLimits, users } from "@/db/schema";
import {
  emailSchema,
  hashPassword,
  passwordSchema,
} from "@/modules/auth/admin-accounts";

import { SIGNUP_LIMIT } from "./signup-limit";

// Accounts of the people who book online. The site still has no public
// Better Auth sign-up (/sign-up/email is disabled): the signup page's Server
// Action calls createClientAccount. A client belongs to no clinic; each clinic
// knows her through a patients row. Runs as app_platform, which sees every
// account.

export type ClientAccountResult =
  | { ok: true; userId: string }
  | { ok: false; fieldErrors: Record<string, string> };

export const SIGNUP_RATE_LIMITED =
  "Muitas tentativas. Tente de novo em alguns minutos";

const EMAIL_TAKEN = "Já existe uma conta com esse e-mail.";

const clientAccountSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome.")
    .max(100, "O nome pode ter no máximo 100 caracteres."),
  email: emailSchema,
  password: passwordSchema,
  clinicSlug: z.string().trim().toLowerCase().min(1),
});

// Counts this attempt and says whether it is within the limit. The counter is
// a rate_limits row keyed "signup:<ip>"; the window starts at the first
// attempt (last_request) and a new one starts once it has passed.
async function consumeSignupAttempt(ip: string | null): Promise<boolean> {
  const key = `signup:${(ip ?? "").trim().slice(0, 64) || "unknown"}`;
  const now = Date.now();
  const windowStart = now - SIGNUP_LIMIT.window * 1000;
  const expired = sql`${rateLimits.lastRequest} <= ${windowStart}`;
  const [row] = await platformDb
    .insert(rateLimits)
    .values({ key, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
        lastRequest: sql`case when ${expired} then ${now} else ${rateLimits.lastRequest} end`,
      },
    })
    .returning({ count: rateLimits.count });
  return (row?.count ?? Infinity) <= SIGNUP_LIMIT.max;
}

export async function createClientAccount(input: {
  name: string;
  email: string;
  password: string;
  clinicSlug: string;
  // The visitor's address, for the signup limit; null when unknown (all
  // unknown addresses share one counter).
  ip: string | null;
}): Promise<ClientAccountResult> {
  if (!(await consumeSignupAttempt(input.ip))) {
    return { ok: false, fieldErrors: { form: SIGNUP_RATE_LIMITED } };
  }

  const parsed = clientAccountSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "form");
      fieldErrors[field] ??= issue.message;
    }
    return { ok: false, fieldErrors };
  }
  const { name, email, password, clinicSlug } = parsed.data;
  const passwordHash = await hashPassword(password);

  try {
    return await platformDb.transaction(
      async (tx): Promise<ClientAccountResult> => {
        const [clinic] = await tx
          .select({ id: clinics.id })
          .from(clinics)
          .where(and(eq(clinics.slug, clinicSlug), eq(clinics.isActive, true)))
          .limit(1);
        if (!clinic) {
          return {
            ok: false,
            fieldErrors: { form: "Clínica não encontrada." },
          };
        }
        const [existing] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (existing) return { ok: false, fieldErrors: { email: EMAIL_TAKEN } };

        const [user] = await tx
          .insert(users)
          .values({
            email,
            name,
            emailVerified: false,
            role: "client",
            clinicId: null,
          })
          .returning({ id: users.id });
        if (!user) throw new Error("Falha ao criar a conta.");

        await tx.insert(accounts).values({
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: passwordHash,
        });
        // The clinic whose page she signed up on; ids only.
        await tx.insert(auditLogs).values({
          clinicId: clinic.id,
          actorType: "patient",
          actorUserId: user.id,
          action: "client.created",
          entityType: "user",
          entityId: user.id,
        });
        return { ok: true, userId: user.id };
      },
    );
  } catch (error) {
    // Two signups with the same e-mail at the same time.
    if (isUniqueViolation(error, "users_email_unique")) {
      return { ok: false, fieldErrors: { email: EMAIL_TAKEN } };
    }
    throw new Error("Não foi possível criar a conta.", { cause: error });
  }
}
