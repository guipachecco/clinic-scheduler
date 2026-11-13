import { betterAuth } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import { eq } from "drizzle-orm";

import { authDb } from "@/db/client";
import {
  accounts,
  rateLimits,
  sessions,
  twoFactors,
  users,
  verifications,
} from "@/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/modules/auth/password-policy";
import {
  sendResetPasswordEmail,
  sendVerificationEmail,
} from "@/modules/clients/auth-emails";
import { SIGNUP_LIMIT } from "@/modules/clients/signup-limit";

// Name shown in the authenticator app next to the account.
const APP_NAME = "Painel da clínica";

// Session length by role, counted from sign-in whatever the activity. The
// cookie lasts as long as the longest one; the database row decides.
const CLIENT_SESSION_SECONDS = 60 * 60 * 24 * 30;
const PANEL_SESSION_SECONDS = 60 * 60 * 12;

async function sessionSecondsFor(userId: string) {
  const [user] = await authDb
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.role === "client"
    ? CLIENT_SESSION_SECONDS
    : PANEL_SESSION_SECONDS;
}

// Only root uses two-factor authentication. Any other session (clinic owner,
// client) gets not-found on every /two-factor/* path, so it can never turn it
// on. Signing in with a code has no session yet (only the two-factor cookie)
// and passes through; admins have no 2FA (migration 0033), so it never asks
// them for one.
const blockTwoFactorOutsideRoot = createAuthMiddleware(async (ctx) => {
  if (!ctx.path.startsWith("/two-factor/")) return;
  const session = await getSessionFromCtx(ctx);
  if (!session) return;
  const role = (session.user as { role?: unknown }).role;
  if (role !== "root") throw new APIError("NOT_FOUND");
});

// Better Auth paths for the e-mail links: 3 requests per minute per IP.
const EMAIL_LINK_LIMIT = { window: 60, max: 3 };

export const auth = betterAuth({
  appName: APP_NAME,
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(authDb, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
      twoFactor: twoFactors,
      rateLimit: rateLimits,
    },
  }),
  advanced: {
    database: { generateId: "uuid" },
  },
  // No public sign-up: panel accounts are created with `pnpm admin create`,
  // client accounts by the signup page (src/modules/clients/accounts.ts).
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: MAX_PASSWORD_LENGTH,
    revokeSessionsOnPasswordReset: true,
    // Clients only; links to /<slug>/nova-senha.
    sendResetPassword: sendResetPasswordEmail,
  },
  // Links to /<slug>/confirmar-email. A client may sign in before confirming;
  // booking checks emailVerified.
  emailVerification: {
    sendVerificationEmail,
  },
  user: {
    additionalFields: {
      role: { type: "string", required: true, input: false },
      // The admin's clinic; empty for root (see src/modules/auth/session.ts).
      clinicId: { type: "string", required: false, input: false },
    },
  },
  session: {
    expiresIn: CLIENT_SESSION_SECONDS,
    disableSessionRefresh: true,
  },
  hooks: { before: blockTwoFactorOutsideRoot },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const seconds = await sessionSecondsFor(session.userId);
          return {
            data: { expiresAt: new Date(Date.now() + seconds * 1000) },
          };
        },
      },
    },
  },
  // Enabled in production. Counters live in PostgreSQL so they hold across
  // serverless instances.
  rateLimit: {
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/request-password-reset": EMAIL_LINK_LIMIT,
      "/reset-password": EMAIL_LINK_LIMIT,
      "/verify-email": EMAIL_LINK_LIMIT,
      "/send-verification-email": EMAIL_LINK_LIMIT,
      // A disabled path. Registering the signup limit here, whose counters
      // share this table (src/modules/clients/accounts.ts), makes Better Auth
      // keep rows for at least that window when it prunes.
      "/sign-up/email": SIGNUP_LIMIT,
    },
  },
  // Endpoints the site does not use. Fewer endpoints, less to attack.
  disabledPaths: [
    "/sign-up/email",
    "/sign-in/social",
    "/link-social",
    "/unlink-account",
    "/list-accounts",
    "/account-info",
    "/get-access-token",
    "/refresh-token",
    "/change-email",
    "/update-user",
    "/delete-user",
    "/delete-user/callback",
    "/two-factor/disable",
    "/two-factor/get-totp-uri",
    "/two-factor/send-otp",
    "/two-factor/verify-otp",
  ],
  telemetry: { enabled: false },
  logger: {
    log: (level, message, ...args) =>
      logger[level](`[auth] ${message}`, args.length ? { args } : undefined),
  },
  plugins: [
    twoFactor({ issuer: APP_NAME }),
    // Must stay last: applies cookies set by auth.api calls in Server Actions.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
