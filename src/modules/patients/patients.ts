import "server-only";

import { and, asc, eq, gt, inArray, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/db/client";
import { findPgError, isUniqueViolation } from "@/db/errors";
import { appointments, auditLogs, patients } from "@/db/schema";

import {
  normalizeName,
  type PatientFormInput,
  type PatientFormValues,
} from "./fields";

// Data functions for the patient registry. No patient data is ever logged,
// written to audit_logs.changes or put in an error message.

export type ActionResult =
  | { ok: true; id: string }
  | {
      ok: false;
      fieldErrors: Partial<Record<keyof PatientFormInput, string>>;
      existingPatientId?: string;
    };

export type PatientRecord = {
  id: string;
  name: string;
  nickname: string | null;
  cpf: string | null;
  rg: string | null;
  phone: string | null;
  landlinePhone: string | null;
  email: string | null;
  birthDate: string | null;
  gender: PatientFormValues["gender"];
  referralSource: PatientFormValues["referralSource"];
  referredBy: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  anonymizedAt: Date | null;
};

export type PatientListItem = {
  id: string;
  name: string;
  nickname: string | null;
  phone: string | null;
  birthDate: string | null;
  anonymizedAt: Date | null;
};

// nameNormalized carries the sort-key value (see SORT_KEY), which for an
// anonymized patient is the normalized label rather than a column value.
export type PatientCursor = { nameNormalized: string; id: string };

export const PAGE_SIZE = 50;
export const ANONYMIZED_NAME = "Paciente anonimizado";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CPF_TAKEN = "Já existe um paciente com este CPF.";
const PHONE_TAKEN = "Já existe um paciente com este WhatsApp e nome.";

const FORM_KEYS = [
  "name",
  "nickname",
  "cpf",
  "rg",
  "phone",
  "landlinePhone",
  "email",
  "birthDate",
  "gender",
  "referralSource",
  "referredBy",
  "notes",
] as const satisfies readonly (keyof PatientFormValues)[];

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function rowValues(values: PatientFormValues) {
  return { ...values, nameNormalized: normalizeName(values.name) };
}

// Looks for another patient that would clash with these values.
async function findConflict(
  tx: Pick<Tx, "select">,
  values: PatientFormValues,
  excludeId?: string,
): Promise<ActionResult | null> {
  const notSelf = excludeId ? sql`${patients.id} <> ${excludeId}` : undefined;
  if (values.cpf) {
    const [row] = await tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(eq(patients.cpf, values.cpf), notSelf))
      .limit(1);
    if (row) {
      return {
        ok: false,
        fieldErrors: { cpf: CPF_TAKEN },
        existingPatientId: row.id,
      };
    }
  }
  const [row] = await tx
    .select({ id: patients.id })
    .from(patients)
    .where(
      and(
        eq(patients.phone, values.phone),
        eq(patients.nameNormalized, normalizeName(values.name)),
        notSelf,
      ),
    )
    .limit(1);
  if (row) {
    return {
      ok: false,
      fieldErrors: { phone: PHONE_TAKEN },
      existingPatientId: row.id,
    };
  }
  return null;
}

// Turns a unique-index violation from a concurrent write into the same answer
// the pre-check gives.
async function conflictFromError(
  error: unknown,
  values: PatientFormValues,
  excludeId?: string,
): Promise<ActionResult | null> {
  if (
    !isUniqueViolation(error, "patients_cpf_idx") &&
    !isUniqueViolation(error, "patients_phone_name_idx")
  ) {
    return null;
  }
  const conflict = await findConflict(db, values, excludeId);
  if (conflict) return conflict;
  const constraint = findPgError(error)?.constraint;
  return {
    ok: false,
    fieldErrors:
      constraint === "patients_cpf_idx"
        ? { cpf: CPF_TAKEN }
        : { phone: PHONE_TAKEN },
  };
}

export async function createPatient(
  values: PatientFormValues,
  actorUserId: string,
): Promise<ActionResult> {
  try {
    return await db.transaction(async (tx): Promise<ActionResult> => {
      const conflict = await findConflict(tx, values);
      if (conflict) return conflict;
      const [row] = await tx
        .insert(patients)
        .values(rowValues(values))
        .returning({ id: patients.id });
      await tx.insert(auditLogs).values({
        actorType: "admin",
        actorUserId,
        action: "patient.created",
        entityType: "patient",
        entityId: row!.id,
      });
      return { ok: true, id: row!.id };
    });
  } catch (error) {
    const conflict = await conflictFromError(error, values);
    if (conflict) return conflict;
    throw error;
  }
}

// An update of a missing or anonymized patient returns
// { ok: false, fieldErrors: {} } and writes nothing.
export async function updatePatient(
  id: string,
  values: PatientFormValues,
  actorUserId: string,
): Promise<ActionResult> {
  if (!UUID_PATTERN.test(id)) return { ok: false, fieldErrors: {} };
  try {
    return await db.transaction(async (tx): Promise<ActionResult> => {
      const [current] = await tx
        .select()
        .from(patients)
        .where(eq(patients.id, id))
        .for("update");
      if (!current || current.anonymizedAt) {
        return { ok: false, fieldErrors: {} };
      }
      const conflict = await findConflict(tx, values, id);
      if (conflict) return conflict;

      const fields = FORM_KEYS.filter((key) => current[key] !== values[key]);
      if (fields.length === 0) return { ok: true, id };

      await tx
        .update(patients)
        .set(rowValues(values))
        .where(eq(patients.id, id));
      await tx.insert(auditLogs).values({
        actorType: "admin",
        actorUserId,
        action: "patient.updated",
        entityType: "patient",
        entityId: id,
        changes: { fields },
      });
      return { ok: true, id };
    });
  } catch (error) {
    const conflict = await conflictFromError(error, values, id);
    if (conflict) return conflict;
    throw error;
  }
}

// Returns anonymized patients too (anonymizedAt set). Null for a missing
// patient and for an id that is not a UUID.
export async function getPatient(id: string): Promise<PatientRecord | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const [row] = await db
    .select({
      id: patients.id,
      name: patients.name,
      nickname: patients.nickname,
      cpf: patients.cpf,
      rg: patients.rg,
      phone: patients.phone,
      landlinePhone: patients.landlinePhone,
      email: patients.email,
      birthDate: patients.birthDate,
      gender: patients.gender,
      referralSource: patients.referralSource,
      referredBy: patients.referredBy,
      notes: patients.notes,
      createdAt: patients.createdAt,
      updatedAt: patients.updatedAt,
      anonymizedAt: patients.anonymizedAt,
    })
    .from(patients)
    .where(eq(patients.id, id))
    .limit(1);
  return row ?? null;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

const ACCENTED = "áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ";
const PLAIN = "aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN";

// Approximates normalizeName in SQL for the nickname column: removes accents
// from the fixed list above (not every Unicode diacritic), lowercases, and
// collapses inner whitespace.
const nicknameNormalized = sql`btrim(regexp_replace(lower(translate(${patients.nickname}, ${ACCENTED}, ${PLAIN})), '\\s+', ' ', 'g'))`;

// Anonymized patients have no normalized name, so they sort and match by the
// normalized label instead.
const SORT_KEY = sql`coalesce(${patients.nameNormalized}, ${normalizeName(ANONYMIZED_NAME)})`;

// Never logs the term. Digit terms (3+ digits, ignoring . - ( ) + and spaces)
// match CPF and phones; anything else matches name and nickname.
export async function searchPatients(input: {
  term: string;
  after?: PatientCursor;
}): Promise<{ items: PatientListItem[]; next?: PatientCursor }> {
  const term = input.term.trim();
  const digits = term.replace(/[.\-()+\s]/g, "");
  const conditions: SQL[] = [];

  if (/^\d{3,}$/.test(digits)) {
    const pattern = `%${digits}%`;
    conditions.push(
      or(
        sql`${patients.cpf} like ${pattern}`,
        sql`${patients.phone} like ${pattern}`,
        sql`${patients.landlinePhone} like ${pattern}`,
      )!,
    );
  } else if (term !== "") {
    const pattern = `%${escapeLike(normalizeName(term))}%`;
    conditions.push(
      or(
        sql`${SORT_KEY} like ${pattern}`,
        sql`${nicknameNormalized} like ${pattern}`,
      )!,
    );
  }

  if (input.after) {
    conditions.push(
      sql`(${SORT_KEY}, ${patients.id}) > (${input.after.nameNormalized}, ${input.after.id}::uuid)`,
    );
  }

  const rows = await db
    .select({
      id: patients.id,
      name: patients.name,
      sortKey: sql<string>`${SORT_KEY}`,
      nickname: patients.nickname,
      phone: patients.phone,
      birthDate: patients.birthDate,
      anonymizedAt: patients.anonymizedAt,
    })
    .from(patients)
    .where(and(...conditions))
    .orderBy(asc(SORT_KEY), asc(patients.id))
    .limit(PAGE_SIZE + 1);

  const page = rows.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  const hasMore = rows.length > PAGE_SIZE;
  return {
    items: page.map((row) => ({
      id: row.id,
      name: row.name,
      nickname: row.nickname,
      phone: row.phone,
      birthDate: row.birthDate,
      anonymizedAt: row.anonymizedAt,
    })),
    ...(hasMore && last
      ? { next: { nameNormalized: last.sortKey, id: last.id } }
      : {}),
  };
}

export async function anonymizePatient(
  id: string,
  actorUserId: string,
): Promise<
  { ok: true } | { ok: false; reason: "not_found" | "has_future_appointments" }
> {
  if (!UUID_PATTERN.test(id)) return { ok: false, reason: "not_found" };
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: patients.id, anonymizedAt: patients.anonymizedAt })
      .from(patients)
      .where(eq(patients.id, id))
      .for("update");
    if (!current || current.anonymizedAt) {
      return { ok: false, reason: "not_found" } as const;
    }
    const [future] = await tx
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.patientId, id),
          inArray(appointments.status, ["requested", "confirmed"]),
          gt(appointments.startsAt, new Date()),
        ),
      )
      .limit(1);
    if (future)
      return { ok: false, reason: "has_future_appointments" } as const;

    await tx
      .update(patients)
      .set({
        name: ANONYMIZED_NAME,
        nameNormalized: null,
        phone: null,
        email: null,
        nickname: null,
        cpf: null,
        rg: null,
        landlinePhone: null,
        birthDate: null,
        gender: null,
        referralSource: null,
        referredBy: null,
        notes: null,
        anonymizedAt: new Date(),
      })
      .where(eq(patients.id, id));
    await tx.insert(auditLogs).values({
      actorType: "admin",
      actorUserId,
      action: "patient.anonymized",
      entityType: "patient",
      entityId: id,
    });
    return { ok: true } as const;
  });
}
