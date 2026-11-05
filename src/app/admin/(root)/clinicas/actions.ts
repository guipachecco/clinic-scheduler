"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import * as z from "zod";

import { ACTIVE_CLINIC_COOKIE, requireRoot } from "@/modules/auth/session";
import {
  createClinic,
  getClinic,
  setClinicActive,
} from "@/modules/clinics/clinics";
import {
  clinicFormSchema,
  type ClinicFormInput,
} from "@/modules/clinics/fields";

// Server Actions only root may call: create clinics, switch the clinic the
// panel works on, and activate or deactivate a clinic.

const GENERIC_ERROR = "Não foi possível salvar. Tente novamente.";

export type ClinicSaveResult =
  | { ok: true; id: string }
  | {
      ok: false;
      fieldErrors: Partial<Record<keyof ClinicFormInput, string>>;
      formError?: string;
    };

const idSchema = z.uuid();

export async function createClinicAction(
  input: ClinicFormInput,
): Promise<ClinicSaveResult> {
  const session = await requireRoot();
  const parsed = clinicFormSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof ClinicFormInput, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof ClinicFormInput | undefined;
      if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }
  try {
    return await createClinic(parsed.data, session.user.id);
  } catch {
    return { ok: false, fieldErrors: {}, formError: GENERIC_ERROR };
  }
}

// Opens the panel on the chosen clinic. The cookie only holds an id; every
// request checks again that the user is root and that the clinic exists.
export async function openClinicAction(formData: FormData): Promise<void> {
  await requireRoot();
  const id = formData.get("clinicId");
  if (typeof id !== "string" || !idSchema.safeParse(id).success) return;
  if (!(await getClinic(id))) return;
  (await cookies()).set(ACTIVE_CLINIC_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: 60 * 60 * 12,
  });
  redirect("/admin");
}

export async function toggleClinicAction(formData: FormData): Promise<void> {
  const session = await requireRoot();
  const id = formData.get("clinicId");
  const active = formData.get("active") === "true";
  if (typeof id !== "string" || !idSchema.safeParse(id).success) return;
  await setClinicActive(id, active, session.user.id);
  redirect("/admin/clinicas");
}
