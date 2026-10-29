import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, pool } from "@/db/client";
import { auditLogs, sessions, twoFactors, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  AdminAccountError,
  createAdmin,
  resetAdminPassword,
  resetAdminTwoFactor,
} from "@/modules/auth/admin-accounts";

// Fictitious account used only by these tests.
const EMAIL = "admin@example.test";
const PASSWORD = "senha-de-teste-bem-longa";

async function signIn(email: string, password: string) {
  return auth.api.signInEmail({ body: { email, password } }).then(
    (result) => result,
    () => null,
  );
}

beforeEach(async () => {
  await db.execute(sql`truncate table users, audit_logs cascade`);
});

afterAll(async () => {
  await pool.end();
});

describe("createAdmin", () => {
  it("creates an account that can sign in with Better Auth", async () => {
    const { id } = await createAdmin({
      email: "  Admin@Example.TEST ",
      name: "Administradora de Teste",
      password: PASSWORD,
    });

    const [user] = await db.select().from(users).where(eq(users.id, id));
    expect(user).toMatchObject({
      email: EMAIL,
      role: "admin",
      emailVerified: true,
      twoFactorEnabled: false,
    });

    const result = await signIn(EMAIL, PASSWORD);
    expect(result?.user.id).toBe(id);
    expect(await signIn(EMAIL, "senha-errada-de-teste")).toBeNull();

    const audit = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, id));
    expect(audit.map((entry) => entry.action)).toEqual(["admin.created"]);
  });

  it("refuses a duplicate email or a short password", async () => {
    await createAdmin({ email: EMAIL, name: "Teste", password: PASSWORD });

    await expect(
      createAdmin({ email: EMAIL, name: "Teste", password: PASSWORD }),
    ).rejects.toThrow(AdminAccountError);
    await expect(
      createAdmin({
        email: "outra@example.test",
        name: "Teste",
        password: "curta",
      }),
    ).rejects.toThrow(/pelo menos 12/);
  });

  it("does not allow public sign-up", async () => {
    await expect(
      auth.api.signUpEmail({
        body: { email: "novo@example.test", password: PASSWORD, name: "Novo" },
      }),
    ).rejects.toThrow();
    expect(await db.select().from(users)).toHaveLength(0);
  });
});

describe("resetAdminPassword", () => {
  it("replaces the password and ends existing sessions", async () => {
    const { id } = await createAdmin({
      email: EMAIL,
      name: "Teste",
      password: PASSWORD,
    });
    await signIn(EMAIL, PASSWORD);
    expect(
      await db.select().from(sessions).where(eq(sessions.userId, id)),
    ).toHaveLength(1);

    await resetAdminPassword({
      email: EMAIL,
      password: "nova-senha-de-teste-longa",
    });

    expect(
      await db.select().from(sessions).where(eq(sessions.userId, id)),
    ).toHaveLength(0);
    expect(await signIn(EMAIL, PASSWORD)).toBeNull();
    expect(await signIn(EMAIL, "nova-senha-de-teste-longa")).not.toBeNull();
  });

  it("reports an unknown email", async () => {
    await expect(
      resetAdminPassword({ email: "ninguem@example.test", password: PASSWORD }),
    ).rejects.toThrow(AdminAccountError);
  });
});

describe("resetAdminTwoFactor", () => {
  it("removes the authenticator and ends existing sessions", async () => {
    const { id } = await createAdmin({
      email: EMAIL,
      name: "Teste",
      password: PASSWORD,
    });
    await db
      .update(users)
      .set({ twoFactorEnabled: true })
      .where(eq(users.id, id));
    await db.insert(twoFactors).values({
      userId: id,
      secret: "valor-criptografado-ficticio",
      backupCodes: "valor-criptografado-ficticio",
      verified: true,
    });
    await db.insert(sessions).values({
      userId: id,
      token: "token-ficticio",
      expiresAt: new Date(Date.now() + 60_000),
    });

    await resetAdminTwoFactor({ email: EMAIL });

    const [user] = await db.select().from(users).where(eq(users.id, id));
    expect(user?.twoFactorEnabled).toBe(false);
    expect(
      await db.select().from(twoFactors).where(eq(twoFactors.userId, id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(sessions).where(eq(sessions.userId, id)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityId, id),
            eq(auditLogs.action, "admin.two_factor_reset"),
          ),
        ),
    ).toHaveLength(1);
  });
});
