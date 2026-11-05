import "server-only";

import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";
import { getClinic, type ClinicSummary } from "@/modules/clinics/clinics";

// Session of the current request, read once per render.
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

// Root picks the clinic it works on; the choice lives in this cookie. Admins
// ignore it: their clinic comes from their account.
export const ACTIVE_CLINIC_COOKIE = "painel_clinica";

export type PanelSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export type PanelContext = PanelSession & {
  // The clinic every read and write of this request is scoped to.
  clinicId: string;
  clinic: ClinicSummary;
  isRoot: boolean;
};

const isPanelRole = (role: unknown) => role === "admin" || role === "root";

async function requireSignedIn(): Promise<PanelSession> {
  const session = await getSession();
  if (!session) redirect("/admin/entrar");
  if (!isPanelRole(session.user.role)) notFound();
  if (!session.user.twoFactorEnabled) redirect("/admin/configurar-2fa");
  return session;
}

// Call at the top of every clinic page, Server Action and Route Handler, next
// to the data it protects, and pass `clinicId` to every module function. The
// proxy check is only a shortcut.
export const requireAdmin = cache(async (): Promise<PanelContext> => {
  const session = await requireSignedIn();
  const isRoot = session.user.role === "root";

  const clinicId = isRoot
    ? (await cookies()).get(ACTIVE_CLINIC_COOKIE)?.value
    : session.user.clinicId;
  const clinic = clinicId ? await getClinic(clinicId) : null;

  if (!clinic) {
    if (isRoot) redirect("/admin/clinicas");
    notFound();
  }
  // A deactivated clinic closes its panel; root can still open it.
  if (!clinic.isActive && !isRoot) notFound();

  return { ...session, clinicId: clinic.id, clinic, isRoot };
});

// Pages and actions that only root may use (managing clinics).
export async function requireRoot(): Promise<PanelSession> {
  const session = await requireSignedIn();
  if (session.user.role !== "root") notFound();
  return session;
}

// Only for the 2FA setup page: signed in with the password, 2FA not yet set up.
export async function requireSessionPendingTwoFactor() {
  const session = await getSession();
  if (!session) redirect("/admin/entrar");
  if (!isPanelRole(session.user.role)) notFound();
  if (session.user.twoFactorEnabled) redirect("/admin");
  return session;
}
