import "server-only";

import { isIP } from "node:net";

import type { Route } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { logger } from "@/lib/logger";
import { getSession } from "@/modules/auth/session";
import type { BookingContext } from "@/modules/booking/booking";
import { RESERVED_SLUGS, SLUG_PATTERN } from "@/modules/clinics/fields";

import {
  getClientContext,
  getPublicClinic,
  type PublicClinic,
} from "./context";

// The client side of a clinic link (/<slug>/...). Every read goes through the
// client modules (app_client, definer functions); the user id always comes
// from the Better Auth session on the server, never from the browser.

export type ClientUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
};

export type ClientPage = {
  ctx: BookingContext;
  clinic: PublicClinic;
  user: ClientUser;
  // Her record waits for the owner to say whether it is an existing patient.
  pending: boolean;
};

// The active clinic of a link, once per request. Null for an unknown,
// deactivated or reserved slug.
export const findClinic = cache(
  async (slug: string): Promise<PublicClinic | null> => {
    if (!SLUG_PATTERN.test(slug) || RESERVED_SLUGS.has(slug)) return null;
    return getPublicClinic(slug);
  },
);

// The clinic of a link, or the not-found page.
export async function requireClinic(slug: string): Promise<PublicClinic> {
  const clinic = await findClinic(slug);
  if (!clinic) notFound();
  return clinic;
}

// The signed-in client, or null (signed out, or a panel account).
export async function getClientUser(): Promise<ClientUser | null> {
  const session = await getSession();
  if (!session || session.user.role !== "client") return null;
  const { id, name, email, emailVerified } = session.user;
  return { id, name, email, emailVerified };
}

// A path on this clinic's pages, safe to send her back to after signing in.
export function safeNext(slug: string, next: unknown): Route | null {
  if (typeof next !== "string") return null;
  const base = `/${slug}`;
  if (next !== base && !next.startsWith(`${base}/`)) return null;
  // Only plain path characters: no "//", backslashes or schemes.
  if (!/^\/[a-z0-9\-/]*$/.test(next) || next.includes("//")) return null;
  return next as Route;
}

// Call at the top of every client page and Server Action that reads or
// writes her data. `next` is the page to come back to after signing in.
//   - signed out: redirect to /<slug>/entrar?next=...;
//   - a panel account: not found;
//   - no record in this clinic yet: redirect to /<slug>/cadastro?completar=1.
export async function requireClient(
  slug: string,
  next: string = `/${slug}`,
): Promise<ClientPage> {
  const clinic = await requireClinic(slug);
  const session = await getSession();
  const back = encodeURIComponent(safeNext(slug, next) ?? `/${slug}`);
  if (!session) redirect(`/${slug}/entrar?next=${back}`);
  if (session.user.role !== "client") notFound();

  const context = await getClientContext(slug, session.user.id);
  if (!context) notFound();
  if (!context.patientId) {
    redirect(`/${slug}/cadastro?completar=1&next=${back}`);
  }
  const { id, name, email, emailVerified } = session.user;
  return {
    ctx: {
      clinicId: clinic.id,
      patientId: context.patientId,
      userId: id,
      emailVerified,
    },
    clinic: context.clinic,
    user: { id, name, email, emailVerified },
    pending: context.pending,
  };
}

// The visitor's address for the signup limit, from the header the host sets
// (on Vercel, x-forwarded-for holds the client address and x-real-ip the
// same). It is the same header Better Auth's rate limit reads (its default,
// x-forwarded-for). Null when there is none; then every such visitor shares
// one counter, so a warning is logged in production.
export async function requestIp(): Promise<string | null> {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidates = [forwarded, list.get("x-real-ip")?.trim()];
  const ip = candidates.find((value) => value && isIP(value) !== 0) ?? null;
  if (!ip && process.env.NODE_ENV === "production") {
    logger.warn("signup without a client address: shared rate limit");
  }
  return ip;
}
