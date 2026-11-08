import { and, eq } from "drizzle-orm";

import { platformDb } from "@/db/client";
import { clinics } from "@/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { RESERVED_SLUGS, SLUG_PATTERN } from "@/modules/clinics/fields";
import { sendEmail } from "@/modules/email/send";
import {
  resetPasswordEmail,
  verificationEmail,
} from "@/modules/email/templates";

// The e-mails Better Auth asks for (src/lib/auth.ts). The client page passes
// a callback such as "/<slug>/confirmar-email"; the link in the e-mail opens
// that clinic's page with the token. Only a relative path whose first segment
// is an active clinic counts: the address is always built on BETTER_AUTH_URL,
// never on what the request sent. No import of "server-only": scripts/admin.ts
// loads this through src/lib/auth.ts.

type AuthEmailInput = {
  user: { email: string; name: string; role?: unknown };
  // Better Auth's own link; only its callbackURL is read.
  url: string;
  token: string;
};

type ClinicPage = { slug: string; name: string };

// The callbackURL the Zemana "Esqueci minha senha" page asks for.
const ZEMANA_RESET_CALLBACK = "/nova-senha";

const baseUrl = () => env.BETTER_AUTH_URL.replace(/\/+$/, "");

function callbackOf(url: string): string | null {
  try {
    return new URL(url).searchParams.get("callbackURL");
  } catch {
    return null;
  }
}

export async function clinicPageFromCallback(
  callback: string | null,
): Promise<ClinicPage | null> {
  if (!callback || !callback.startsWith("/")) return null;
  // "//host" and "/\host" are other sites to a browser.
  if (callback.startsWith("//") || callback.startsWith("/\\")) return null;
  const slug = callback.slice(1).split(/[/?#]/, 1)[0] ?? "";
  if (!SLUG_PATTERN.test(slug) || RESERVED_SLUGS.has(slug)) return null;

  // The slug is all there is before the clinic is known: app_platform.
  const [clinic] = await platformDb
    .select({
      slug: clinics.slug,
      name: clinics.name,
      displayName: clinics.displayName,
    })
    .from(clinics)
    .where(and(eq(clinics.slug, slug), eq(clinics.isActive, true)))
    .limit(1);
  if (!clinic) return null;
  return { slug: clinic.slug, name: clinic.displayName ?? clinic.name };
}

export async function sendVerificationEmail({
  user,
  url,
  token,
}: AuthEmailInput) {
  const clinic = await clinicPageFromCallback(callbackOf(url));
  const encoded = encodeURIComponent(token);
  // Without a clinic page: Better Auth's endpoint confirms and opens the home
  // page.
  const link = clinic
    ? `${baseUrl()}/${clinic.slug}/confirmar-email?token=${encoded}`
    : `${baseUrl()}/api/auth/verify-email?token=${encoded}&callbackURL=%2F`;
  await sendEmail({
    to: user.email,
    ...verificationEmail({
      baseUrl: baseUrl(),
      url: link,
      userName: user.name,
      clinicName: clinic?.name ?? null,
    }),
  });
}

// Better Auth awaits this before it answers, so the answer would take longer
// when an e-mail really goes out (the clinic lookup and the MailerSend call) than
// for an unknown address. Inside a request the work runs after the response
// instead; outside one (scripts, tests) it is awaited as before. next/server
// is loaded lazily: plain Node (scripts/admin.ts, the e2e setup) cannot
// resolve it, and there it is not needed.
export async function sendResetPasswordEmail(input: AuthEmailInput) {
  const task = () =>
    deliverResetPasswordEmail(input).catch((error: unknown) => {
      logger.error("password reset e-mail failed", { error });
    });
  try {
    const { after } = await import("next/server");
    // Throws outside a request.
    after(task);
  } catch {
    await task();
  }
}

async function deliverResetPasswordEmail({ user, url, token }: AuthEmailInput) {
  // Panel accounts change their password with `pnpm admin`, never by e-mail.
  if (user.role !== "client") return;
  const callback = callbackOf(url);
  // The Zemana pages (no clinic): the same e-mail without a clinic name.
  if (callback === ZEMANA_RESET_CALLBACK) {
    await sendEmail({
      to: user.email,
      ...resetPasswordEmail({
        baseUrl: baseUrl(),
        url: `${baseUrl()}${ZEMANA_RESET_CALLBACK}?token=${encodeURIComponent(token)}`,
        userName: user.name,
        clinicName: null,
      }),
    });
    return;
  }
  const clinic = await clinicPageFromCallback(callback);
  // The new password is typed on a clinic page; without one there is no page
  // to send the client to.
  if (!clinic) {
    logger.warn("password reset requested without a clinic page");
    return;
  }
  const link = `${baseUrl()}/${clinic.slug}/nova-senha?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: user.email,
    ...resetPasswordEmail({
      baseUrl: baseUrl(),
      url: link,
      userName: user.name,
      clinicName: clinic.name,
    }),
  });
}
