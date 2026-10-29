import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";

import { db } from "@/db/client";
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

// Name shown in the authenticator app next to the account.
const APP_NAME = "Painel da clínica";

export const auth = betterAuth({
  appName: APP_NAME,
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
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
  // No public sign-up: accounts are created with `pnpm admin create`.
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: MAX_PASSWORD_LENGTH,
    revokeSessionsOnPasswordReset: true,
  },
  user: {
    additionalFields: {
      role: { type: "string", required: true, input: false },
    },
  },
  // Sessions end 12 hours after sign-in, whatever the activity.
  session: {
    expiresIn: 60 * 60 * 12,
    disableSessionRefresh: true,
  },
  // Enabled in production. Counters live in PostgreSQL so they hold across
  // serverless instances.
  rateLimit: {
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
    },
  },
  // Endpoints the panel does not use. Fewer endpoints, less to attack.
  disabledPaths: [
    "/sign-up/email",
    "/sign-in/social",
    "/link-social",
    "/unlink-account",
    "/list-accounts",
    "/account-info",
    "/get-access-token",
    "/refresh-token",
    "/request-password-reset",
    "/reset-password",
    "/verify-email",
    "/send-verification-email",
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
