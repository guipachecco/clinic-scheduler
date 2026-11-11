"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import * as z from "zod";

import {
  createAnamnesis,
  deleteAnamnesis,
  saveAnamnesis,
  setAnamnesisStatus,
} from "@/modules/anamnesis/anamnesis";
import type { Answers } from "@/modules/anamnesis/fields";
import { getSession, requireAdmin } from "@/modules/auth/session";
import { todayInClinic } from "@/modules/patients/fields";

// Server Actions for the anamnesis of a patient. The answers are health data:
// nothing here logs them, and unexpected errors (whose messages may carry
// them) never reach the client.

export type CreateResult =
  { ok: true; id: string } | { ok: false; message: string };

export type SaveResult =
  | { ok: true; updatedAt: string }
  | {
      ok: false;
      reason: "session" | "conflict" | "invalid" | "error";
      fieldErrors?: Record<string, string>;
    };

export type StatusResult =
  | { ok: true; updatedAt: string }
  | { ok: false; reason: "session" | "conflict" | "error" };

export type DeleteResult = { ok: false; reason: "session" | "error" };

const idSchema = z.uuid();

const saveSchema = z.object({
  // Checked against the template by saveAnamnesis.
  answers: z.record(z.string(), z.unknown()),
  takenOn: z.string().max(10),
  expectedUpdatedAt: z.string().max(40),
});

const statusSchema = z.enum(["in_progress", "completed"]);

const validIds = (...ids: unknown[]) =>
  ids.every((id) => idSchema.safeParse(id).success);

export async function createAnamnesisAction(
  patientId: string,
): Promise<CreateResult> {
  const session = await requireAdmin();
  const failure = {
    ok: false,
    message: "Não foi possível criar a anamnese. Tente novamente.",
  } as const;
  if (!validIds(patientId)) return failure;
  try {
    const result = await createAnamnesis(
      session.clinicId,
      patientId,
      session.user.id,
      todayInClinic(),
    );
    return result.ok ? result : failure;
  } catch {
    return failure;
  }
}

// Never redirects: the form keeps what was typed when the session is gone,
// and the person signs in again in another tab.
export async function saveAnamnesisAction(
  patientId: string,
  id: string,
  input: { answers: Answers; takenOn: string; expectedUpdatedAt: string },
): Promise<SaveResult> {
  if (!(await getSession())) return { ok: false, reason: "session" };
  const session = await requireAdmin();
  const parsed = saveSchema.safeParse(input);
  if (!validIds(patientId, id) || !parsed.success) {
    return { ok: false, reason: "invalid" };
  }
  try {
    const result = await saveAnamnesis(
      session.clinicId,
      patientId,
      id,
      parsed.data,
      session.user.id,
      todayInClinic(),
    );
    if (result.ok) return result;
    if (result.reason === "not_found") return { ok: false, reason: "error" };
    return {
      ok: false,
      reason: result.reason,
      fieldErrors: result.fieldErrors,
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function setStatusAction(
  patientId: string,
  id: string,
  status: "in_progress" | "completed",
  expectedUpdatedAt: string,
): Promise<StatusResult> {
  if (!(await getSession())) return { ok: false, reason: "session" };
  const session = await requireAdmin();
  const parsed = statusSchema.safeParse(status);
  const version = z.string().max(40).safeParse(expectedUpdatedAt);
  if (!validIds(patientId, id) || !parsed.success || !version.success) {
    return { ok: false, reason: "error" };
  }
  try {
    const result = await setAnamnesisStatus(
      session.clinicId,
      patientId,
      id,
      parsed.data,
      version.data,
      session.user.id,
    );
    if (result.ok) return result;
    return { ok: false, reason: result.reason ?? "error" };
  } catch {
    return { ok: false, reason: "error" };
  }
}

// Goes back to the patient's record on success.
export async function deleteAnamnesisAction(
  patientId: string,
  id: string,
): Promise<DeleteResult> {
  if (!(await getSession())) return { ok: false, reason: "session" };
  const session = await requireAdmin();
  if (!validIds(patientId, id)) return { ok: false, reason: "error" };
  let deleted = false;
  try {
    const result = await deleteAnamnesis(
      session.clinicId,
      patientId,
      id,
      session.user.id,
    );
    deleted = result.ok;
  } catch {
    return { ok: false, reason: "error" };
  }
  if (!deleted) return { ok: false, reason: "error" };
  redirect(`/admin/pacientes/${patientId}` as Route);
}
