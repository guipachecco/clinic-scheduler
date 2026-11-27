import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/owner";
import {
  accounts,
  auditLogs,
  patients,
  sessions,
  twoFactors,
  users,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  AdminAccountError,
  createAdmin,
  hashPassword,
  listClinicAccounts,
  resetAdminPassword,
  resetAdminTwoFactor,
  setClinicAccountPassword,
} from "@/modules/auth/admin-accounts";

import { CLINIC, otherClinic } from "../helpers/clinic";

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
  await endPools();
});

describe("createAdmin", () => {
  it("creates an account that can sign in with Better Auth", async () => {
    const { id } = await createAdmin({
      role: "admin",
      clinicSlug: "grais",
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
    await createAdmin({
      role: "admin",
      clinicSlug: "grais",
      email: EMAIL,
      name: "Teste",
      password: PASSWORD,
    });

    await expect(
      createAdmin({
        role: "admin",
        clinicSlug: "grais",
        email: EMAIL,
        name: "Teste",
        password: PASSWORD,
      }),
    ).rejects.toThrow(AdminAccountError);
    await expect(
      createAdmin({
        role: "admin",
        clinicSlug: "grais",
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
      role: "admin",
      clinicSlug: "grais",
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
      role: "admin",
      clinicSlug: "grais",
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

describe("setClinicAccountPassword", () => {
  const NEW_PASSWORD = "senha-nova-dada-pelo-root";

  async function clientOfClinic(email: string) {
    const [user] = await db
      .insert(users)
      .values({ email, name: "Cliente de Teste", role: "client" })
      .returning({ id: users.id });
    await db.insert(accounts).values({
      userId: user!.id,
      accountId: user!.id,
      providerId: "credential",
      password: await hashPassword(PASSWORD),
    });
    await db.insert(patients).values({
      clinicId: CLINIC,
      name: "Cliente de Teste",
      nameNormalized: "cliente de teste",
      phone: "+5511900000404",
      userId: user!.id,
    });
    return user!.id;
  }

  it("lists and resets the clinic's owner and patient accounts", async () => {
    const root = await createAdmin({
      role: "root",
      email: "root@example.test",
      name: "Root",
      password: PASSWORD,
    });
    const owner = await createAdmin({
      role: "admin",
      clinicSlug: "grais",
      email: EMAIL,
      name: "Dona",
      password: PASSWORD,
    });
    const clientId = await clientOfClinic("cliente@example.test");

    expect(
      (await listClinicAccounts(CLINIC, "owner")).map((a) => a.id),
    ).toEqual([owner.id]);
    expect(
      (await listClinicAccounts(CLINIC, "patient")).map((a) => a.id),
    ).toEqual([clientId]);

    for (const [kind, userId, email] of [
      ["owner", owner.id, EMAIL],
      ["patient", clientId, "cliente@example.test"],
    ] as const) {
      await setClinicAccountPassword({
        clinicId: CLINIC,
        kind,
        userId,
        password: NEW_PASSWORD,
        actorUserId: root.id,
      });
      expect(await signIn(email, PASSWORD)).toBeNull();
      expect((await signIn(email, NEW_PASSWORD))?.user.id).toBe(userId);
    }
    const audit = await db
      .select({ action: auditLogs.action, actor: auditLogs.actorUserId })
      .from(auditLogs)
      .where(eq(auditLogs.actorUserId, root.id));
    expect(audit.map((entry) => entry.action).sort()).toEqual([
      "admin.password_reset",
      "client.password_reset",
    ]);
  });

  it("refuses an account of another clinic or kind, and root", async () => {
    const root = await createAdmin({
      role: "root",
      email: "root@example.test",
      name: "Root",
      password: PASSWORD,
    });
    const owner = await createAdmin({
      role: "admin",
      clinicSlug: "grais",
      email: EMAIL,
      name: "Dona",
      password: PASSWORD,
    });
    const other = await otherClinic();
    const attempt = (
      clinicId: string,
      kind: "owner" | "patient",
      userId: string,
    ) =>
      setClinicAccountPassword({
        clinicId,
        kind,
        userId,
        password: NEW_PASSWORD,
        actorUserId: root.id,
      });

    await expect(attempt(other, "owner", owner.id)).rejects.toThrow(
      AdminAccountError,
    );
    await expect(attempt(CLINIC, "patient", owner.id)).rejects.toThrow(
      AdminAccountError,
    );
    await expect(attempt(CLINIC, "owner", root.id)).rejects.toThrow(
      AdminAccountError,
    );
    await expect(
      setClinicAccountPassword({
        clinicId: CLINIC,
        kind: "owner",
        userId: owner.id,
        password: "curta",
        actorUserId: root.id,
      }),
    ).rejects.toThrow(/pelo menos 12/);
    expect(await signIn(EMAIL, PASSWORD)).not.toBeNull();
  });
});
