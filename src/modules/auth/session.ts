import "server-only";

import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";
import { getClinic, type ClinicSummary } from "@/modules/clinics/clinics";
import { hasModule, type ClinicModule } from "@/modules/clinics/modules";

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

// The clinic a panel session works on: admins have theirs, root picks one
// (cookie). Null when there is none or it is closed to this session: a
// deactivated clinic closes its panel, but root can still open it.
async function panelClinic(
  session: PanelSession,
): Promise<ClinicSummary | null> {
  const isRoot = session.user.role === "root";
  const clinicId = isRoot
    ? (await cookies()).get(ACTIVE_CLINIC_COOKIE)?.value
    : session.user.clinicId;
  const clinic = clinicId ? await getClinic(clinicId) : null;
  if (!clinic || (!clinic.isActive && !isRoot)) return null;
  return clinic;
}

// Call at the top of every clinic page, Server Action and Route Handler, next
// to the data it protects, and pass `clinicId` to every module function. The
// proxy check is only a shortcut, and not for every request: it lets the
// anamnesis form's action POSTs through without a session (so a save can
// answer "session expired" instead of redirecting), so every panel Server
// Action must check the session itself.
export const requireAdmin = cache(async (): Promise<PanelContext> => {
  const session = await requireSignedIn();
  const isRoot = session.user.role === "root";
  const clinic = await panelClinic(session);
  if (!clinic) {
    if (isRoot) redirect("/admin/clinicas");
    notFound();
  }
  return { ...session, clinicId: clinic.id, clinic, isRoot };
});

// Like requireAdmin, but never redirects nor answers 404: null when there is
// no valid panel session (signed out, not admin or root, 2FA not set up, no
// open clinic). For Server Actions that must answer instead of navigating
// away, such as the anamnesis autosave, which would lose the typed text.
export const getPanelContext = cache(async (): Promise<PanelContext | null> => {
  const session = await getSession();
  if (!session || !isPanelRole(session.user.role)) return null;
  if (!session.user.twoFactorEnabled) return null;
  const clinic = await panelClinic(session);
  if (!clinic) return null;
  return {
    ...session,
    clinicId: clinic.id,
    clinic,
    isRoot: session.user.role === "root",
  };
});

// Like requireAdmin, for the pages of an optional module: 404 while the
// clinic has it off. Server Actions answer instead (see moduleActive).
export async function requireModule(key: ClinicModule): Promise<PanelContext> {
  const ctx = await requireAdmin();
  if (!hasModule(ctx.clinic, key)) notFound();
  return ctx;
}

// Whether the clinic of this panel request has the module on. For Server
// Actions (which refuse with MODULE_OFF_ERROR) and for pages that hide a
// block of an optional module.
export function moduleActive(ctx: PanelContext, key: ClinicModule): boolean {
  return hasModule(ctx.clinic, key);
}

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
