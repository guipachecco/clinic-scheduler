import "server-only";

import { and, asc, count, eq, gt, inArray, ne, sql } from "drizzle-orm";

import { inClinic, type Tx } from "@/db/client";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  appointments,
  auditLogs,
  professionals,
} from "@/db/schema";
import { lockAgenda } from "@/modules/appointments/appointments";

import type { ProfessionalFormInput, ProfessionalFormValues } from "./fields";

// The clinic's team, as app_panel inside the clinic (inClinic). Every clinic
// has at least one active professional; the first active one by order is the
// default, who gets the online bookings for now (migration 0032). Names go
// neither to audit_logs nor into error messages.

export type Professional = {
  id: string;
  name: string;
  registration: string | null;
  isActive: boolean;
  sortOrder: number;
  // The first active one by order: online bookings go to her.
  isDefault: boolean;
};

export type ProfessionalOption = { id: string; name: string };

export type ProfessionalResult =
  | { ok: true; id: string }
  | {
      ok: false;
      formError?: string;
      fieldErrors: Partial<Record<keyof ProfessionalFormInput, string>>;
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LAST_ACTIVE =
  "A equipe precisa de pelo menos uma profissional ativa.";
export const HAS_UPCOMING =
  "Ela tem atendimentos marcados daqui para a frente. Remarque ou cancele esses atendimentos antes de desativá-la.";
const NOT_FOUND = "Profissional não encontrada.";

function unexpected(error: unknown): Error {
  return new Error("Não foi possível salvar a equipe.", { cause: error });
}

// Same order as default_professional (migration 0032).
const teamOrder = [
  asc(professionals.sortOrder),
  asc(professionals.createdAt),
  asc(professionals.id),
] as const;

export async function listProfessionals(
  clinicId: string,
): Promise<Professional[]> {
  const rows = await inClinic(clinicId, (tx) =>
    tx
      .select({
        id: professionals.id,
        name: professionals.name,
        registration: professionals.registration,
        isActive: professionals.isActive,
        sortOrder: professionals.sortOrder,
      })
      .from(professionals)
      .where(eq(professionals.clinicId, clinicId))
      .orderBy(...teamOrder),
  );
  const defaultId = rows.find((row) => row.isActive)?.id;
  return rows.map((row) => ({ ...row, isDefault: row.id === defaultId }));
}

// The active ones, in order, for the agenda's selector. The first is the
// default.
export async function listActiveProfessionals(
  clinicId: string,
): Promise<ProfessionalOption[]> {
  return inClinic(clinicId, (tx) =>
    tx
      .select({ id: professionals.id, name: professionals.name })
      .from(professionals)
      .where(
        and(
          eq(professionals.clinicId, clinicId),
          eq(professionals.isActive, true),
        ),
      )
      .orderBy(...teamOrder),
  );
}

export async function createProfessional(
  clinicId: string,
  values: ProfessionalFormValues,
  actorUserId: string,
): Promise<ProfessionalResult> {
  try {
    return await inClinic(clinicId, async (tx) => {
      const [row] = await tx
        .insert(professionals)
        .values({ clinicId, ...values })
        .returning({ id: professionals.id });
      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: "professional.created",
        entityType: "professional",
        entityId: row!.id,
        changes: { isActive: values.isActive, sortOrder: values.sortOrder },
      });
      return { ok: true, id: row!.id };
    });
  } catch (error) {
    throw unexpected(error);
  }
}

// Refuses to deactivate the last active professional, or one with active
// appointments that have not ended yet. Under the agenda lock, so that no
// appointment is booked for her while she is being deactivated.
async function deactivationRefusal(
  tx: Tx,
  clinicId: string,
  id: string,
): Promise<string | null> {
  const [others] = await tx
    .select({ count: count() })
    .from(professionals)
    .where(
      and(
        eq(professionals.clinicId, clinicId),
        eq(professionals.isActive, true),
        ne(professionals.id, id),
      ),
    );
  if ((others?.count ?? 0) === 0) return LAST_ACTIVE;
  const [upcoming] = await tx
    .select({ count: count() })
    .from(appointments)
    .where(
      and(
        eq(appointments.clinicId, clinicId),
        eq(appointments.professionalId, id),
        inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
        gt(appointments.endsAt, sql`now()`),
      ),
    );
  return (upcoming?.count ?? 0) > 0 ? HAS_UPCOMING : null;
}

export async function updateProfessional(
  clinicId: string,
  id: string,
  values: ProfessionalFormValues,
  actorUserId: string,
): Promise<ProfessionalResult> {
  if (!UUID_PATTERN.test(id)) {
    return { ok: false, formError: NOT_FOUND, fieldErrors: {} };
  }
  try {
    return await inClinic(clinicId, async (tx): Promise<ProfessionalResult> => {
      await lockAgenda(tx, clinicId);
      const [current] = await tx
        .select()
        .from(professionals)
        .where(
          and(eq(professionals.id, id), eq(professionals.clinicId, clinicId)),
        )
        .for("update");
      if (!current) {
        return { ok: false, formError: NOT_FOUND, fieldErrors: {} };
      }
      if (current.isActive && !values.isActive) {
        const refusal = await deactivationRefusal(tx, clinicId, id);
        if (refusal) {
          return { ok: false, fieldErrors: { isActive: refusal } };
        }
      }
      const fields = (
        ["name", "registration", "sortOrder", "isActive"] as const
      ).filter((field) => current[field] !== values[field]);
      if (fields.length === 0) return { ok: true, id };

      await tx
        .update(professionals)
        .set({ ...values, updatedAt: new Date() })
        .where(
          and(eq(professionals.id, id), eq(professionals.clinicId, clinicId)),
        );
      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: "professional.updated",
        entityType: "professional",
        entityId: id,
        changes: { fields, isActive: values.isActive },
      });
      return { ok: true, id };
    });
  } catch (error) {
    throw unexpected(error);
  }
}
