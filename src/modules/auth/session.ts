import "server-only";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";

// Session of the current request, read once per render.
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

// Call at the top of every panel page, Server Action and Route Handler,
// next to the data it protects. The proxy check is only a shortcut.
export async function requireAdmin() {
  const session = await getSession();
  if (!session) redirect("/admin/entrar");
  if (session.user.role !== "admin") notFound();
  return session;
}

// Only for the 2FA setup page: signed in, 2FA not set up yet. 2FA is optional;
// the panel home recommends it while it is off.
export async function requireSessionPendingTwoFactor() {
  const session = await getSession();
  if (!session) redirect("/admin/entrar");
  if (session.user.role !== "admin") notFound();
  if (session.user.twoFactorEnabled) redirect("/admin");
  return session;
}
