import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import * as z from "zod";

import { inClinic, platformDb, type Tx } from "@/db/client";
import {
  accounts,
  auditLogs,
  clinics,
  patients,
  sessions,
  twoFactors,
  users,
} from "@/db/schema";
import { auth } from "@/lib/auth";

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password-policy";

// Panel accounts are managed from the terminal (scripts/admin.ts) because the
// site has no public sign-up. Every change is recorded in audit_logs. Runs as
// app_platform, which sees every account and clinic.

export class AdminAccountError extends Error {}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "E-mail inválido." }));

export const passwordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `A senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
  )
  .max(
    MAX_PASSWORD_LENGTH,
    `A senha pode ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.`,
  );

const createAdminSchema = z.object({
  // admin: owner of the clinic in clinicSlug. root: every clinic, no clinicSlug.
  role: z.enum(["admin", "root"]),
  clinicSlug: z.string().trim().toLowerCase().optional(),
  email: emailSchema,
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome.")
    .max(100, "O nome pode ter no máximo 100 caracteres."),
  password: passwordSchema,
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AdminAccountError(
      result.error.issues.map((issue) => issue.message).join(" "),
    );
  }
  return result.data;
}

async function findUserIdByEmail(tx: Tx, email: string) {
  const [user] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (!user) {
    throw new AdminAccountError("Nenhuma conta encontrada com esse e-mail.");
  }
  return user.id;
}

// Also used for client accounts (src/modules/clients/accounts.ts).
export async function hashPassword(password: string) {
  const context = await auth.$context;
  return context.password.hash(password);
}

export async function createAdmin(input: {
  role: "admin" | "root";
  clinicSlug?: string;
  email: string;
  name: string;
  password: string;
}) {
  const { role, clinicSlug, email, name, password } = parse(
    createAdminSchema,
    input,
  );
  if (role === "admin" && !clinicSlug) {
    throw new AdminAccountError("Informe o endereço da clínica.");
  }
  if (role === "root" && clinicSlug) {
    throw new AdminAccountError("A conta root não pertence a uma clínica.");
  }
  const passwordHash = await hashPassword(password);

  return platformDb.transaction(async (tx) => {
    let clinicId: string | null = null;
    if (clinicSlug) {
      const [clinic] = await tx
        .select({ id: clinics.id })
        .from(clinics)
        .where(eq(clinics.slug, clinicSlug));
      if (!clinic) {
        throw new AdminAccountError(
          "Nenhuma clínica encontrada com esse endereço.",
        );
      }
      clinicId = clinic.id;
    }
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    if (existing) {
      throw new AdminAccountError("Já existe uma conta com esse e-mail.");
    }

    const [user] = await tx
      .insert(users)
      .values({ email, name, emailVerified: true, role, clinicId })
      .returning({ id: users.id });
    if (!user) throw new Error("Falha ao criar a conta.");

    await tx.insert(accounts).values({
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: passwordHash,
    });
    await tx.insert(auditLogs).values({
      clinicId,
      actorType: "system",
      action: role === "root" ? "root.created" : "admin.created",
      entityType: "user",
      entityId: user.id,
    });
    return { id: user.id };
  });
}

// Sets a new password and signs the account out everywhere.
export async function resetAdminPassword(input: {
  email: string;
  password: string;
}) {
  const { email, password } = parse(
    z.object({ email: emailSchema, password: passwordSchema }),
    input,
  );
  const passwordHash = await hashPassword(password);

  await platformDb.transaction(async (tx) => {
    const userId = await findUserIdByEmail(tx, email);
    await replacePassword(tx, userId, passwordHash);
    await tx.insert(auditLogs).values({
      actorType: "system",
      action: "admin.password_reset",
      entityType: "user",
      entityId: userId,
    });
  });
}

// Writes the credential password and ends the account's sessions.
async function replacePassword(tx: Tx, userId: string, passwordHash: string) {
  const updated = await tx
    .update(accounts)
    .set({ password: passwordHash })
    .where(
      and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")),
    )
    .returning({ id: accounts.id });
  if (updated.length === 0) {
    await tx.insert(accounts).values({
      userId,
      accountId: userId,
      providerId: "credential",
      password: passwordHash,
    });
  }
  await tx.delete(sessions).where(eq(sessions.userId, userId));
}

// Root's "Mudar senha" screen: the clinic's owner accounts (admin) or the
// client accounts linked to one of its patients.
export type ClinicAccountKind = "owner" | "patient";

export type ClinicAccount = { id: string; name: string; email: string };

// app_platform cannot read patients, so the clinic's links come through the
// panel's clinic-scoped connection.
async function patientUserIds(clinicId: string) {
  const rows = await inClinic(clinicId, (tx) =>
    tx
      .select({ userId: patients.userId })
      .from(patients)
      .where(and(eq(patients.clinicId, clinicId), isNotNull(patients.userId))),
  );
  return rows.flatMap((row) => (row.userId ? [row.userId] : []));
}

export async function listClinicAccounts(
  clinicId: string,
  kind: ClinicAccountKind,
): Promise<ClinicAccount[]> {
  const columns = { id: users.id, name: users.name, email: users.email };
  if (kind === "owner") {
    return platformDb
      .select(columns)
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.clinicId, clinicId)))
      .orderBy(asc(users.name));
  }
  const ids = await patientUserIds(clinicId);
  if (ids.length === 0) return [];
  return platformDb
    .select(columns)
    .from(users)
    .where(and(eq(users.role, "client"), inArray(users.id, ids)))
    .orderBy(asc(users.name));
}

// Root sets a new password for an account of the clinic. The account must be
// of that clinic and of that kind, so a forged id cannot reach root or
// another clinic's owner.
export async function setClinicAccountPassword(input: {
  clinicId: string;
  kind: ClinicAccountKind;
  userId: string;
  password: string;
  actorUserId: string;
}) {
  const password = parse(passwordSchema, input.password);
  const allowed = await listClinicAccounts(input.clinicId, input.kind);
  if (!allowed.some((account) => account.id === input.userId)) {
    throw new AdminAccountError("Essa conta não é dessa clínica.");
  }
  const passwordHash = await hashPassword(password);

  await platformDb.transaction(async (tx) => {
    await replacePassword(tx, input.userId, passwordHash);
    await tx.insert(auditLogs).values({
      clinicId: input.clinicId,
      actorType: "admin",
      actorUserId: input.actorUserId,
      action:
        input.kind === "owner"
          ? "admin.password_reset"
          : "client.password_reset",
      entityType: "user",
      entityId: input.userId,
    });
  });
}

// For a lost authenticator: removes 2FA and signs the account out. The next
// sign-in asks for a new 2FA setup before the panel opens.
export async function resetAdminTwoFactor(input: { email: string }) {
  const { email } = parse(z.object({ email: emailSchema }), input);

  await platformDb.transaction(async (tx) => {
    const userId = await findUserIdByEmail(tx, email);
    await tx.delete(twoFactors).where(eq(twoFactors.userId, userId));
    await tx
      .update(users)
      .set({ twoFactorEnabled: false })
      .where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.insert(auditLogs).values({
      actorType: "system",
      action: "admin.two_factor_reset",
      entityType: "user",
      entityId: userId,
    });
  });
}
