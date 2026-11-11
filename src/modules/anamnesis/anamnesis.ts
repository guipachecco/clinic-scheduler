import "server-only";

import { and, desc, eq, gt, sql } from "drizzle-orm";

import { inClinic, type Tx } from "@/db/client";
import { anamneses, auditLogs, clinics, patients } from "@/db/schema";
import { todayInClinic } from "@/modules/patients/fields";

import {
  ANSWERS_MAX_BYTES,
  answersSchema,
  copyAnswers,
  type Answers,
} from "./fields";
import {
  CURRENT_TEMPLATE_ID,
  getTemplate,
  type AnamnesisTemplate,
} from "./template";

// Data functions for the anamnesis of a patient. Every function takes the
// clinicId from the session. Everything answers null / not_found / { ok: false }
// when the clinic has no anamnesis template, the id is not a UUID, the row is
// missing or the patient was anonymized. The answers are health data: they are
// never logged, put in audit_logs.changes or in an error message.

export type AnamnesisListItem = {
  id: string;
  takenOn: string;
  status: "in_progress" | "completed";
  updatedAt: Date;
};

export type AnamnesisRecord = AnamnesisListItem & {
  patientId: string;
  template: AnamnesisTemplate;
  answers: Answers;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AUDIT_THROTTLE_MINUTES = 30;

// The feature is on for the clinic and the patient exists there, not
// anonymized. Read inside the caller's transaction.
async function patientInScope(
  tx: Tx,
  clinicId: string,
  patientId: string,
  // Writes lock the patient row (share) so they wait behind a concurrent
  // anonymization and then see it committed.
  lock = false,
): Promise<boolean> {
  if (!UUID_PATTERN.test(patientId)) return false;
  const [clinic] = await tx
    .select({ template: clinics.anamnesisTemplate })
    .from(clinics)
    .where(eq(clinics.id, clinicId))
    .limit(1);
  if (!clinic?.template) return false;
  const query = tx
    .select({ anonymizedAt: patients.anonymizedAt })
    .from(patients)
    .where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId)))
    .limit(1);
  const [patient] = await (lock ? query.for("share") : query);
  return !!patient && patient.anonymizedAt === null;
}

const rowOf = (clinicId: string, patientId: string, id: string) =>
  and(
    eq(anamneses.id, id),
    eq(anamneses.clinicId, clinicId),
    eq(anamneses.patientId, patientId),
  );

// A new write time, always later than the stored one so the version check
// tells two quick saves apart (JS dates have millisecond precision).
function nextUpdatedAt(previous: Date): Date {
  const now = Date.now();
  return new Date(Math.max(now, previous.getTime() + 1));
}

function audit(
  tx: Tx,
  clinicId: string,
  actorUserId: string,
  action: string,
  id: string,
  patientId: string,
) {
  return tx.insert(auditLogs).values({
    clinicId,
    actorType: "admin",
    actorUserId,
    action,
    entityType: "anamnesis",
    entityId: id,
    changes: { patientId },
  });
}

export async function listAnamneses(
  clinicId: string,
  patientId: string,
): Promise<AnamnesisListItem[] | null> {
  return inClinic(clinicId, async (tx) => {
    if (!(await patientInScope(tx, clinicId, patientId))) return null;
    return tx
      .select({
        id: anamneses.id,
        takenOn: anamneses.takenOn,
        status: anamneses.status,
        updatedAt: anamneses.updatedAt,
      })
      .from(anamneses)
      .where(
        and(
          eq(anamneses.clinicId, clinicId),
          eq(anamneses.patientId, patientId),
        ),
      )
      .orderBy(desc(anamneses.takenOn), desc(anamneses.updatedAt));
  });
}

export async function getAnamnesis(
  clinicId: string,
  patientId: string,
  id: string,
): Promise<AnamnesisRecord | null> {
  if (!UUID_PATTERN.test(id)) return null;
  return inClinic(clinicId, async (tx) => {
    if (!(await patientInScope(tx, clinicId, patientId))) return null;
    const [row] = await tx
      .select()
      .from(anamneses)
      .where(rowOf(clinicId, patientId, id))
      .limit(1);
    if (!row) return null;
    const template = getTemplate(row.template);
    if (!template) return null;
    return {
      id: row.id,
      patientId: row.patientId,
      takenOn: row.takenOn,
      status: row.status,
      updatedAt: row.updatedAt,
      template,
      answers: row.answers,
    };
  });
}

// A new anamnesis for `today`, starting from the patient's latest one (by date,
// then by last edit, any status) in the current template.
export async function createAnamnesis(
  clinicId: string,
  patientId: string,
  actorUserId: string,
  today: string,
): Promise<{ ok: true; id: string } | { ok: false }> {
  const target = getTemplate(CURRENT_TEMPLATE_ID);
  if (!target) return { ok: false };
  return inClinic(clinicId, async (tx) => {
    if (!(await patientInScope(tx, clinicId, patientId, true))) {
      return { ok: false } as const;
    }
    const [latest] = await tx
      .select({ template: anamneses.template, answers: anamneses.answers })
      .from(anamneses)
      .where(
        and(
          eq(anamneses.clinicId, clinicId),
          eq(anamneses.patientId, patientId),
        ),
      )
      .orderBy(desc(anamneses.takenOn), desc(anamneses.updatedAt))
      .limit(1);
    const fromTemplate = latest ? getTemplate(latest.template) : null;
    const answers =
      latest && fromTemplate
        ? keepValid(copyAnswers(latest.answers, fromTemplate, target), target)
        : {};
    const [row] = await tx
      .insert(anamneses)
      .values({
        clinicId,
        patientId,
        template: target.id,
        takenOn: today,
        answers,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
        updatedAt: new Date(),
      })
      .returning({ id: anamneses.id });
    await audit(
      tx,
      clinicId,
      actorUserId,
      "anamnesis.created",
      row!.id,
      patientId,
    );
    return { ok: true, id: row!.id } as const;
  });
}

type SaveResult =
  | { ok: true; updatedAt: string }
  | {
      ok: false;
      reason: "not_found" | "conflict" | "invalid";
      fieldErrors?: Record<string, string>;
    };

// Drops any copied answer the current template would reject, so the stored
// copy always passes its schema.
function keepValid(answers: Answers, template: AnamnesisTemplate): Answers {
  const schema = answersSchema(template);
  const out: Answers = {};
  for (const [id, value] of Object.entries(answers)) {
    const parsed = schema.safeParse({ [id]: value });
    if (parsed.success) Object.assign(out, parsed.data);
  }
  return out;
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

// Saves the answers and the date of an anamnesis. `expectedUpdatedAt` is the
// version the person opened: when someone saved in between, nothing is written
// (conflict). `today` is the day in the clinic's time zone.
export async function saveAnamnesis(
  clinicId: string,
  patientId: string,
  id: string,
  input: { answers: unknown; takenOn: string; expectedUpdatedAt: string },
  actorUserId: string,
  today: string = todayInClinic(),
): Promise<SaveResult> {
  if (!UUID_PATTERN.test(id)) return { ok: false, reason: "not_found" };
  return inClinic(clinicId, async (tx): Promise<SaveResult> => {
    if (!(await patientInScope(tx, clinicId, patientId, true))) {
      return { ok: false, reason: "not_found" };
    }
    const [row] = await tx
      .select()
      .from(anamneses)
      .where(rowOf(clinicId, patientId, id))
      .for("update");
    if (!row) return { ok: false, reason: "not_found" };
    if (row.updatedAt.toISOString() !== input.expectedUpdatedAt) {
      return { ok: false, reason: "conflict" };
    }

    const template = getTemplate(row.template);
    if (!template) return { ok: false, reason: "not_found" };
    const parsed = answersSchema(template).safeParse(input.answers);
    if (!parsed.success) {
      return {
        ok: false,
        reason: "invalid",
        fieldErrors: { answers: "Há respostas inválidas." },
      };
    }
    if (
      Buffer.byteLength(JSON.stringify(parsed.data), "utf8") > ANSWERS_MAX_BYTES
    ) {
      return {
        ok: false,
        reason: "invalid",
        fieldErrors: { answers: "A ficha ficou grande demais." },
      };
    }
    if (!isRealDate(input.takenOn)) {
      return {
        ok: false,
        reason: "invalid",
        fieldErrors: { takenOn: "Informe uma data válida." },
      };
    }
    if (input.takenOn > today) {
      return {
        ok: false,
        reason: "invalid",
        fieldErrors: { takenOn: "A data não pode ser no futuro." },
      };
    }

    const updatedAt = nextUpdatedAt(row.updatedAt);
    await tx
      .update(anamneses)
      .set({
        answers: parsed.data,
        takenOn: input.takenOn,
        updatedByUserId: actorUserId,
        updatedAt,
      })
      .where(rowOf(clinicId, patientId, id));

    // Autosave would flood the history: one entry per half hour is enough.
    const [recent] = await tx
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.clinicId, clinicId),
          eq(auditLogs.action, "anamnesis.updated"),
          eq(auditLogs.entityId, id),
          gt(
            auditLogs.createdAt,
            sql`now() - interval '${sql.raw(String(AUDIT_THROTTLE_MINUTES))} minutes'`,
          ),
        ),
      )
      .limit(1);
    if (!recent) {
      await audit(
        tx,
        clinicId,
        actorUserId,
        "anamnesis.updated",
        id,
        patientId,
      );
    }
    return { ok: true, updatedAt: updatedAt.toISOString() };
  });
}

// Marks an anamnesis completed or in progress. Like saveAnamnesis, it takes
// the version the person holds: when someone saved in between, nothing is
// written (conflict), so the next autosave cannot overwrite their answers.
export async function setAnamnesisStatus(
  clinicId: string,
  patientId: string,
  id: string,
  status: "in_progress" | "completed",
  expectedUpdatedAt: string,
  actorUserId: string,
): Promise<
  { ok: true; updatedAt: string } | { ok: false; reason?: "conflict" }
> {
  if (!UUID_PATTERN.test(id)) return { ok: false };
  return inClinic(clinicId, async (tx) => {
    if (!(await patientInScope(tx, clinicId, patientId, true))) {
      return { ok: false } as const;
    }
    const [row] = await tx
      .select({ status: anamneses.status, updatedAt: anamneses.updatedAt })
      .from(anamneses)
      .where(rowOf(clinicId, patientId, id))
      .for("update");
    if (!row) return { ok: false } as const;
    if (row.updatedAt.toISOString() !== expectedUpdatedAt) {
      return { ok: false, reason: "conflict" } as const;
    }
    if (row.status === status) {
      return { ok: true, updatedAt: row.updatedAt.toISOString() } as const;
    }
    const updatedAt = nextUpdatedAt(row.updatedAt);
    await tx
      .update(anamneses)
      .set({ status, updatedByUserId: actorUserId, updatedAt })
      .where(rowOf(clinicId, patientId, id));
    await audit(
      tx,
      clinicId,
      actorUserId,
      status === "completed" ? "anamnesis.completed" : "anamnesis.reopened",
      id,
      patientId,
    );
    return { ok: true, updatedAt: updatedAt.toISOString() } as const;
  });
}

export async function deleteAnamnesis(
  clinicId: string,
  patientId: string,
  id: string,
  actorUserId: string,
): Promise<{ ok: boolean }> {
  if (!UUID_PATTERN.test(id)) return { ok: false };
  return inClinic(clinicId, async (tx) => {
    if (!(await patientInScope(tx, clinicId, patientId, true)))
      return { ok: false };
    const deleted = await tx
      .delete(anamneses)
      .where(rowOf(clinicId, patientId, id))
      .returning({ id: anamneses.id });
    if (deleted.length === 0) return { ok: false };
    await audit(tx, clinicId, actorUserId, "anamnesis.deleted", id, patientId);
    return { ok: true };
  });
}

// The PDF of an anamnesis was generated (a copy of health data left the app).
// Writes nothing when the anamnesis is out of scope.
export async function recordPdfGenerated(
  clinicId: string,
  patientId: string,
  id: string,
  actorUserId: string,
): Promise<void> {
  if (!UUID_PATTERN.test(id)) return;
  await inClinic(clinicId, async (tx) => {
    if (!(await patientInScope(tx, clinicId, patientId, true))) return;
    const [row] = await tx
      .select({ id: anamneses.id })
      .from(anamneses)
      .where(rowOf(clinicId, patientId, id))
      .limit(1);
    if (!row) return;
    await audit(
      tx,
      clinicId,
      actorUserId,
      "anamnesis.pdf_generated",
      id,
      patientId,
    );
  });
}
