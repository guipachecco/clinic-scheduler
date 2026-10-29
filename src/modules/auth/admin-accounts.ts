import { and, eq } from "drizzle-orm";
import * as z from "zod";

import { db } from "@/db/client";
import { accounts, auditLogs, sessions, twoFactors, users } from "@/db/schema";
import { auth } from "@/lib/auth";

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password-policy";

// Panel accounts are managed from the terminal (scripts/admin.ts) because the
// site has no public sign-up. Every change is recorded in audit_logs.

export class AdminAccountError extends Error {}

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "E-mail inválido." }));

const passwordSchema = z
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

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function findUserIdByEmail(tx: Transaction, email: string) {
  const [user] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  if (!user) {
    throw new AdminAccountError("Nenhuma conta encontrada com esse e-mail.");
  }
  return user.id;
}

async function hashPassword(password: string) {
  const context = await auth.$context;
  return context.password.hash(password);
}

export async function createAdmin(input: {
  email: string;
  name: string;
  password: string;
}) {
  const { email, name, password } = parse(createAdminSchema, input);
  const passwordHash = await hashPassword(password);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    if (existing) {
      throw new AdminAccountError("Já existe uma conta com esse e-mail.");
    }

    const [user] = await tx
      .insert(users)
      .values({ email, name, emailVerified: true, role: "admin" })
      .returning({ id: users.id });
    if (!user) throw new Error("Falha ao criar a conta.");

    await tx.insert(accounts).values({
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: passwordHash,
    });
    await tx.insert(auditLogs).values({
      actorType: "system",
      action: "admin.created",
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

  await db.transaction(async (tx) => {
    const userId = await findUserIdByEmail(tx, email);
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
    await tx.insert(auditLogs).values({
      actorType: "system",
      action: "admin.password_reset",
      entityType: "user",
      entityId: userId,
    });
  });
}

// For a lost authenticator: removes 2FA and signs the account out. The next
// sign-in asks for a new 2FA setup before the panel opens.
export async function resetAdminTwoFactor(input: { email: string }) {
  const { email } = parse(z.object({ email: emailSchema }), input);

  await db.transaction(async (tx) => {
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
