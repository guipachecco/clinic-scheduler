import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";

import { eq, like, or, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/owner";
import { findPgError } from "@/db/errors";
import { accounts, rateLimits, sessions, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { createAdmin } from "@/modules/auth/admin-accounts";
import {
  createClientAccount,
  SIGNUP_RATE_LIMITED,
} from "@/modules/clients/accounts";
import { createClinic } from "@/modules/clinics/clinics";
import { readOutbox } from "@/modules/email/send";

// Fictitious accounts only. The e-mails end in @clientes.example.test so the
// cleanup below never touches another test file's accounts.
const DOMAIN = "@clientes.example.test";
const PASSWORD = "senha-de-teste-bem-longa";
const HOUR = 60 * 60 * 1000;

let ipCounter = 0;
// A different address per test, from the documentation range (RFC 5737).
const nextIp = () => `203.0.113.${++ipCounter}`;

function signup(local: string, ip = nextIp()) {
  return createClientAccount({
    name: "Cliente de Teste",
    email: `${local}${DOMAIN}`,
    password: PASSWORD,
    clinicSlug: "grais",
    ip,
  });
}

async function clearOutbox() {
  await rm(env.EMAIL_OUTBOX_DIR, { recursive: true, force: true });
}

async function cleanup() {
  await db.delete(users).where(like(users.email, `%${DOMAIN}`));
  await db.delete(rateLimits).where(like(rateLimits.key, "signup:203.0.113.%"));
}

beforeEach(async () => {
  await cleanup();
  await clearOutbox();
});

afterAll(async () => {
  await cleanup();
  await clearOutbox();
  await endPools();
});

describe("createClientAccount", () => {
  it("creates a client with role client and no clinic", async () => {
    const result = await signup("ana");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, result.userId));
    expect(user).toMatchObject({
      email: `ana${DOMAIN}`,
      role: "client",
      clinicId: null,
      emailVerified: false,
      twoFactorEnabled: false,
    });
    const [account] = await db
      .select({ providerId: accounts.providerId })
      .from(accounts)
      .where(eq(accounts.userId, result.userId));
    expect(account?.providerId).toBe("credential");

    const signedIn = await auth.api.signInEmail({
      body: { email: `ana${DOMAIN}`, password: PASSWORD },
    });
    expect(signedIn.user.id).toBe(result.userId);
  });

  it("refuses a duplicate e-mail", async () => {
    expect((await signup("bia")).ok).toBe(true);
    const again = await signup("BIA");
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.fieldErrors.email).toBeTruthy();
  });

  it("refuses invalid input and an unknown clinic", async () => {
    const result = await createClientAccount({
      name: " ",
      email: "nao-e-email",
      password: "curta",
      clinicSlug: "grais",
      ip: nextIp(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.fieldErrors).sort()).toEqual([
      "email",
      "name",
      "password",
    ]);

    const unknown = await createClientAccount({
      name: "Cliente",
      email: `sem-clinica${DOMAIN}`,
      password: PASSWORD,
      clinicSlug: "clinica-que-nao-existe",
      ip: nextIp(),
    });
    expect(unknown.ok).toBe(false);
  });

  it("sixth signup from one IP is refused", async () => {
    const ip = nextIp();
    for (let i = 1; i <= 5; i++) {
      expect((await signup(`limite${i}`, ip)).ok).toBe(true);
    }
    const sixth = await signup("limite6", ip);
    expect(sixth).toEqual({
      ok: false,
      fieldErrors: { form: SIGNUP_RATE_LIMITED },
    });
    expect(SIGNUP_RATE_LIMITED).toBe(
      "Muitas tentativas. Tente de novo em alguns minutos",
    );
    // Another address is not affected.
    expect((await signup("outro-ip")).ok).toBe(true);
  });
});

describe("sessions and e-mails", () => {
  it("client sessions last 30 days, admin 12 hours", async () => {
    const client = await signup("sessao");
    if (!client.ok) throw new Error("signup failed");
    const admin = await createAdmin({
      role: "admin",
      clinicSlug: "grais",
      email: `dona${DOMAIN}`,
      name: "Dona de Teste",
      password: PASSWORD,
    });

    const before = Date.now();
    await auth.api.signInEmail({
      body: { email: `sessao${DOMAIN}`, password: PASSWORD },
    });
    await auth.api.signInEmail({
      body: { email: `dona${DOMAIN}`, password: PASSWORD },
    });

    const rows = await db
      .select({ userId: sessions.userId, expiresAt: sessions.expiresAt })
      .from(sessions)
      .where(
        or(eq(sessions.userId, client.userId), eq(sessions.userId, admin.id)),
      );
    const lifetime = (userId: string) =>
      rows.find((row) => row.userId === userId)!.expiresAt.getTime() - before;

    expect(lifetime(client.userId)).toBeGreaterThan(30 * 24 * HOUR - HOUR);
    expect(lifetime(client.userId)).toBeLessThanOrEqual(30 * 24 * HOUR + HOUR);
    expect(lifetime(admin.id)).toBeGreaterThan(11 * HOUR);
    expect(lifetime(admin.id)).toBeLessThanOrEqual(12 * HOUR + HOUR);
  });

  it("reset e-mail goes only to clients", async () => {
    await createAdmin({
      role: "admin",
      clinicSlug: "grais",
      email: `dona-reset${DOMAIN}`,
      name: "Dona de Teste",
      password: PASSWORD,
    });
    expect((await signup("reset")).ok).toBe(true);

    await auth.api.requestPasswordReset({
      body: { email: `dona-reset${DOMAIN}`, redirectTo: "/grais/nova-senha" },
    });
    expect(await readOutbox()).toEqual([]);

    // The Zemana reset page is for clients too: a panel account gets nothing.
    await auth.api.requestPasswordReset({
      body: { email: `dona-reset${DOMAIN}`, redirectTo: "/nova-senha" },
    });
    expect(await readOutbox()).toEqual([]);

    await auth.api.requestPasswordReset({
      body: { email: `reset${DOMAIN}`, redirectTo: "/grais/nova-senha" },
    });
    const messages = await readOutbox();
    expect(messages).toHaveLength(1);
    expect(messages[0]!.to).toBe(`reset${DOMAIN}`);
    expect(messages[0]!.text).toContain("/nova-senha");
    expect(messages[0]!.text).toContain(
      `${env.BETTER_AUTH_URL}/grais/nova-senha?token=`,
    );
    expect(messages[0]!.html).toContain(
      `${env.BETTER_AUTH_URL}/marca/zemana-horizontal.png`,
    );
  });

  it("the reset link resets the password", async () => {
    expect((await signup("troca")).ok).toBe(true);
    await auth.api.requestPasswordReset({
      body: { email: `troca${DOMAIN}`, redirectTo: "/grais/nova-senha" },
    });
    const [message] = await readOutbox();
    const token = new URL(
      message!.text.match(/https?:\/\/\S+nova-senha\S*/)![0],
    ).searchParams.get("token")!;

    const newPassword = "outra-senha-de-teste-longa";
    await auth.api.resetPassword({ body: { token, newPassword } });
    const signedIn = await auth.api.signInEmail({
      body: { email: `troca${DOMAIN}`, password: newPassword },
    });
    expect(signedIn.user.email).toBe(`troca${DOMAIN}`);
  });

  it("verification e-mail links to the clinic's confirmation page", async () => {
    const client = await signup("confirma");
    if (!client.ok) throw new Error("signup failed");

    await auth.api.sendVerificationEmail({
      body: {
        email: `confirma${DOMAIN}`,
        callbackURL: "/grais/confirmar-email",
      },
    });
    const [message] = await readOutbox();
    expect(message!.to).toBe(`confirma${DOMAIN}`);
    expect(message!.subject).toContain("Confirme seu e-mail");
    const link = message!.text.match(/https?:\/\/\S+confirmar-email\S*/)![0];
    expect(
      link.startsWith(`${env.BETTER_AUTH_URL}/grais/confirmar-email?token=`),
    ).toBe(true);

    const token = new URL(link).searchParams.get("token")!;
    await auth.api.verifyEmail({ query: { token } });
    const [user] = await db
      .select({ emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, client.userId));
    expect(user?.emailVerified).toBe(true);
  });

  it("a callback that is not a clinic page never shapes the link", async () => {
    expect((await signup("estranho")).ok).toBe(true);

    for (const callbackURL of [
      "https://evil.example.test/grais/confirmar-email",
      "//evil.example.test/grais",
      "/clinica-que-nao-existe/confirmar-email",
      "/admin/confirmar-email",
    ]) {
      await clearOutbox();
      await auth.api.sendVerificationEmail({
        body: { email: `estranho${DOMAIN}`, callbackURL },
      });
      const [message] = await readOutbox();
      expect(message!.text).not.toContain("evil.example");
      expect(message!.text).not.toContain("/confirmar-email?token=");
      // The generic link: confirms, then opens the home page.
      expect(message!.text).toContain(
        `${env.BETTER_AUTH_URL}/api/auth/verify-email?token=`,
      );
    }

    // A reset link only makes sense on a clinic page: nothing is sent.
    await clearOutbox();
    await auth.api.requestPasswordReset({
      body: { email: `estranho${DOMAIN}`, redirectTo: "/admin/nova-senha" },
    });
    expect(await readOutbox()).toEqual([]);
  });
});

describe("two-factor authentication", () => {
  // The session cookie of a fresh sign-in, as a request Cookie header.
  async function sessionHeaders(email: string) {
    const { headers } = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
      returnHeaders: true,
    });
    const cookie = (headers.getSetCookie?.() ?? [headers.get("set-cookie")!])
      .map((value) => value.split(";")[0])
      .join("; ");
    return new Headers({ cookie });
  }

  it("a client cannot turn on 2FA", async () => {
    const client = await signup("dois-fatores");
    if (!client.ok) throw new Error("signup failed");
    const headers = await sessionHeaders(`dois-fatores${DOMAIN}`);

    await expect(
      auth.api.enableTwoFactor({ body: { password: PASSWORD }, headers }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      auth.api.verifyTOTP({ body: { code: "123456" }, headers }),
    ).rejects.toMatchObject({ statusCode: 404 });

    const [user] = await db
      .select({ twoFactorEnabled: users.twoFactorEnabled })
      .from(users)
      .where(eq(users.id, client.userId));
    expect(user?.twoFactorEnabled).toBe(false);
  });

  it("an admin still sets up 2FA", async () => {
    await createAdmin({
      role: "admin",
      clinicSlug: "grais",
      email: `dona-2fa${DOMAIN}`,
      name: "Dona de Teste",
      password: PASSWORD,
    });
    const headers = await sessionHeaders(`dona-2fa${DOMAIN}`);
    const result = await auth.api.enableTwoFactor({
      body: { password: PASSWORD },
      headers,
    });
    expect(result).toMatchObject({
      method: "totp",
      totpURI: expect.stringContaining("otpauth://"),
    });
  });
});

describe("database rules", () => {
  it("users check rejects client with clinic", async () => {
    let code: string | undefined;
    try {
      await db.execute(sql`
        insert into users (name, email, role, clinic_id)
        select 'Cliente', ${`com-clinica${DOMAIN}`}, 'client', id
        from clinics where slug = 'grais'
      `);
    } catch (error) {
      code = findPgError(error)?.code;
    }
    expect(code).toBe("23514");
  });

  it("generated image routes are reserved slugs", async () => {
    for (const slug of ["opengraph-image", "twitter-image"]) {
      const result = await createClinic(
        { name: "Clínica Imagem", slug },
        randomUUID(),
      );
      expect(result).toMatchObject({ ok: false });
    }
  });

  it("reserved slug is refused", async () => {
    const result = await createClinic(
      { name: "Clínica Reservada", slug: "admin" },
      randomUUID(),
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: { slug: "Esse endereço é reservado pelo sistema" },
    });
  });
});
