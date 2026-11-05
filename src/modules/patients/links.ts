import "server-only";

import { aliasedTable, and, asc, eq, isNotNull, isNull } from "drizzle-orm";

import { inClinic, type Tx } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { appointments, auditLogs, patients, quotes, sales } from "@/db/schema";

// The owner's answer to a provisional record: a client who signed up online
// with the phone of a patient the clinic already had (register_client_patient,
// migration 0013). "É a mesma" (confirmLink) merges the provisional record into
// the existing one; "Não é" (rejectLink) turns it into an ordinary record.
// Like the rest of the registry, every function takes the clinicId from the
// session and logs no patient data.

export type PendingLink = {
  provisionalId: string;
  provisionalName: string;
  existingId: string;
  existingName: string;
  // The existing record is already tied to another client account: it cannot
  // take this one too (one account per patient row).
  existingHasAccount: boolean;
  createdAt: Date;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const existing = aliasedTable(patients, "existing");

// Pending provisional records of the clinic, oldest first. An anonymized
// provisional record is no longer a signup to decide on.
export async function listPendingLinks(
  clinicId: string,
): Promise<PendingLink[]> {
  const rows = await inClinic(clinicId, (tx) =>
    tx
      .select({
        provisionalId: patients.id,
        provisionalName: patients.name,
        existingId: existing.id,
        existingName: existing.name,
        existingUserId: existing.userId,
        createdAt: patients.createdAt,
      })
      .from(patients)
      .innerJoin(
        existing,
        and(
          eq(existing.clinicId, patients.clinicId),
          eq(existing.id, patients.pendingLinkPatientId),
        ),
      )
      .where(
        and(
          eq(patients.clinicId, clinicId),
          isNotNull(patients.pendingLinkPatientId),
          isNull(patients.anonymizedAt),
        ),
      )
      .orderBy(asc(patients.createdAt), asc(patients.id)),
  );
  return rows.map(({ existingUserId, ...row }) => ({
    ...row,
    existingHasAccount: existingUserId !== null,
  }));
}

// The provisional record and the patient it matched, locked for the rest of
// the transaction (provisional first, then existing: the same order in every
// call). Null when either is missing in this clinic, the provisional record
// is not pending or was anonymized.
async function lockPair(tx: Tx, clinicId: string, provisionalId: string) {
  const [provisional] = await tx
    .select({
      id: patients.id,
      userId: patients.userId,
      pendingLinkPatientId: patients.pendingLinkPatientId,
      anonymizedAt: patients.anonymizedAt,
    })
    .from(patients)
    .where(and(eq(patients.clinicId, clinicId), eq(patients.id, provisionalId)))
    .for("update");
  if (
    !provisional ||
    provisional.anonymizedAt ||
    !provisional.pendingLinkPatientId
  ) {
    return null;
  }
  const [match] = await tx
    .select({
      id: patients.id,
      userId: patients.userId,
      anonymizedAt: patients.anonymizedAt,
    })
    .from(patients)
    .where(
      and(
        eq(patients.clinicId, clinicId),
        eq(patients.id, provisional.pendingLinkPatientId),
      ),
    )
    .for("update");
  if (!match) return null;
  return { provisional, existing: match };
}

// "É a mesma": in one transaction, the provisional record's appointments,
// quotes, sales and history move to the existing record, which takes the
// client's account; the provisional record is deleted. Refused when the
// existing record already has an account. An anonymized existing record has
// no personal data left to match, so it counts as not found.
export async function confirmLink(
  clinicId: string,
  provisionalId: string,
  actorUserId: string,
): Promise<
  { ok: true } | { ok: false; reason: "not_found" | "existing_has_account" }
> {
  if (!UUID_PATTERN.test(provisionalId)) {
    return { ok: false, reason: "not_found" };
  }
  return inClinic(clinicId, async (tx) => {
    const pair = await lockPair(tx, clinicId, provisionalId);
    if (!pair || pair.existing.anonymizedAt) {
      return { ok: false, reason: "not_found" } as const;
    }
    if (pair.existing.userId !== null) {
      return { ok: false, reason: "existing_has_account" } as const;
    }
    const existingId = pair.existing.id;

    const moved = await tx
      .update(appointments)
      .set({ patientId: existingId })
      .where(
        and(
          eq(appointments.clinicId, clinicId),
          eq(appointments.patientId, provisionalId),
        ),
      )
      .returning({ id: appointments.id });
    // Normally a provisional record has online bookings only; finance rows
    // the owner may have opened for it follow it too, so nothing is lost.
    await tx
      .update(quotes)
      .set({ patientId: existingId })
      .where(
        and(eq(quotes.clinicId, clinicId), eq(quotes.patientId, provisionalId)),
      );
    await tx
      .update(sales)
      .set({ patientId: existingId })
      .where(
        and(eq(sales.clinicId, clinicId), eq(sales.patientId, provisionalId)),
      );
    // Its history (owner edits) now belongs to the existing record. The panel
    // may change only entity_id of audit_logs (migration 0015).
    await tx
      .update(auditLogs)
      .set({ entityId: existingId })
      .where(
        and(
          eq(auditLogs.clinicId, clinicId),
          eq(auditLogs.entityType, "patient"),
          eq(auditLogs.entityId, provisionalId),
        ),
      );

    // Deleted before the account moves: one account per patient row.
    await tx
      .delete(patients)
      .where(
        and(eq(patients.clinicId, clinicId), eq(patients.id, provisionalId)),
      );
    await tx
      .update(patients)
      .set({ userId: pair.provisional.userId })
      .where(and(eq(patients.clinicId, clinicId), eq(patients.id, existingId)));

    await tx.insert(auditLogs).values({
      clinicId,
      actorType: "admin",
      actorUserId,
      action: "patient.link_confirmed",
      entityType: "patient",
      entityId: existingId,
      changes: { mergedPatientId: provisionalId, appointments: moved.length },
    });
    return { ok: true } as const;
  });
}

// "Não é": the provisional record becomes an ordinary one. Refused when it
// has the same name and phone as another record of the clinic (the unique
// rule it was exempt from while pending): the owner changes its name first.
export async function rejectLink(
  clinicId: string,
  provisionalId: string,
  actorUserId: string,
): Promise<
  { ok: true } | { ok: false; reason: "not_found" | "same_name_and_phone" }
> {
  if (!UUID_PATTERN.test(provisionalId)) {
    return { ok: false, reason: "not_found" };
  }
  try {
    return await inClinic(clinicId, async (tx) => {
      const pair = await lockPair(tx, clinicId, provisionalId);
      if (!pair) return { ok: false, reason: "not_found" } as const;

      await tx
        .update(patients)
        .set({ pendingLinkPatientId: null })
        .where(
          and(eq(patients.clinicId, clinicId), eq(patients.id, provisionalId)),
        );
      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: "patient.link_rejected",
        entityType: "patient",
        entityId: provisionalId,
        changes: { existingPatientId: pair.existing.id },
      });
      return { ok: true } as const;
    });
  } catch (error) {
    // The transaction rolled back: nothing changed.
    if (isUniqueViolation(error, "patients_phone_name_idx")) {
      return { ok: false, reason: "same_name_and_phone" };
    }
    throw error;
  }
}
