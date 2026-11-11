import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { inClinic } from "@/db/client";
import { db, endPools } from "@/db/owner";
import { anamneses, auditLogs, patients, users } from "@/db/schema";
import {
  createAnamnesis,
  deleteAnamnesis,
  getAnamnesis,
  listAnamneses,
  recordPdfGenerated,
  saveAnamnesis,
  setAnamnesisStatus,
} from "@/modules/anamnesis/anamnesis";

import { CLINIC, otherClinic } from "../helpers/clinic";

// Every record is fictitious and exists only during the test.

const TODAY = "2026-11-10";
const EMAIL = "admin-anamnese@fichas.example.test";

let other: string;
let actorId: string;
let patientId: string;
let otherPatientId: string;

async function newPatient(clinicId: string, name: string, phone: string) {
  const [row] = await db
    .insert(patients)
    .values({ clinicId, name, nameNormalized: name.toLowerCase(), phone })
    .returning({ id: patients.id });
  return row!.id;
}

async function create(today = TODAY) {
  const result = await createAnamnesis(CLINIC, patientId, actorId, today);
  if (!result.ok) throw new Error("expected create to succeed");
  return result.id;
}

async function current(id: string) {
  const record = await getAnamnesis(CLINIC, patientId, id);
  if (!record) throw new Error("expected the anamnesis to exist");
  return record;
}

async function save(
  id: string,
  answers: unknown,
  takenOn = TODAY,
  expected?: string,
) {
  const expectedUpdatedAt =
    expected ?? (await current(id)).updatedAt.toISOString();
  return saveAnamnesis(
    CLINIC,
    patientId,
    id,
    { answers, takenOn, expectedUpdatedAt },
    actorId,
    TODAY,
  );
}

async function actions(id: string) {
  const rows = await db
    .select({ action: auditLogs.action })
    .from(auditLogs)
    .where(eq(auditLogs.entityId, id))
    .orderBy(auditLogs.createdAt, auditLogs.id);
  return rows.map((r) => r.action);
}

async function clear() {
  await db
    .delete(anamneses)
    .where(inArray(anamneses.patientId, [patientId, otherPatientId]));
  await db.delete(auditLogs).where(eq(auditLogs.entityType, "anamnesis"));
}

beforeAll(async () => {
  other = await otherClinic();
  await db.delete(users).where(eq(users.email, EMAIL));
  const [user] = await db
    .insert(users)
    .values({
      name: "Admin Anamnese",
      email: EMAIL,
      role: "admin",
      clinicId: CLINIC,
    })
    .returning({ id: users.id });
  actorId = user!.id;
  patientId = await newPatient(CLINIC, "Paciente Ficha Um", "+5511900000301");
  otherPatientId = await newPatient(
    other,
    "Paciente Ficha Outra",
    "+5511900000302",
  );
});

beforeEach(clear);

afterAll(async () => {
  await clear();
  await db
    .delete(patients)
    .where(inArray(patients.id, [patientId, otherPatientId]));
  await db.delete(auditLogs).where(eq(auditLogs.actorUserId, actorId));
  await db.delete(users).where(eq(users.id, actorId));
  await endPools();
});

describe("anamnesis module", () => {
  it("first anamnesis starts blank", async () => {
    const id = await create();
    const record = await current(id);
    expect(record.answers).toEqual({});
    expect(record.status).toBe("in_progress");
    expect(record.takenOn).toBe(TODAY);
    expect(record.template.id).toBe("integrativa-ads-v1");
    expect(await actions(id)).toEqual(["anamnesis.created"]);
  });

  it("new anamnesis copies the latest, without diagnosis and protocols", async () => {
    const first = await create("2026-11-01");
    const saved = await save(
      first,
      { queixas_principais: "Dor", diagnostico_estado_geral: "X" },
      "2026-11-01",
    );
    expect(saved.ok).toBe(true);
    const second = await create();
    expect((await current(second)).answers).toEqual({
      queixas_principais: "Dor",
    });
  });

  it("latest is by date, then by last edit", async () => {
    const newer = await create("2026-11-05");
    await save(newer, { queixas_principais: "Nova" }, "2026-11-05");
    const older = await create("2026-10-01");
    // The older record is edited last.
    await save(older, { queixas_principais: "Antiga" }, "2026-10-01");
    const third = await create();
    expect((await current(third)).answers).toEqual({
      queixas_principais: "Nova",
    });
    const list = await listAnamneses(CLINIC, patientId);
    expect(list?.map((i) => i.takenOn)).toEqual([
      TODAY,
      "2026-11-05",
      "2026-10-01",
    ]);
  });

  it("save refuses a stale version", async () => {
    const id = await create();
    const stale = (await current(id)).updatedAt.toISOString();
    expect((await save(id, { queixas_principais: "Um" })).ok).toBe(true);
    const result = await save(id, { queixas_principais: "Dois" }, TODAY, stale);
    expect(result).toEqual({ ok: false, reason: "conflict" });
    expect((await current(id)).answers).toEqual({ queixas_principais: "Um" });
  });

  it("save chains with the returned updatedAt", async () => {
    const id = await create();
    const first = await save(id, { queixas_principais: "Um" });
    if (!first.ok) throw new Error("first save failed");
    const second = await save(
      id,
      { queixas_principais: "Dois" },
      TODAY,
      first.updatedAt,
    );
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.updatedAt).not.toBe(first.updatedAt);
    expect((await current(id)).answers).toEqual({ queixas_principais: "Dois" });
  });

  it("save rejects invalid answers and future dates", async () => {
    const id = await create();
    const unknown = await save(id, { nao_existe: "x" });
    expect(unknown).toMatchObject({ ok: false, reason: "invalid" });
    const future = await save(id, {}, "2026-11-11");
    expect(future).toMatchObject({ ok: false, reason: "invalid" });
    const fake = await save(id, {}, "2026-02-30");
    expect(fake).toMatchObject({ ok: false, reason: "invalid" });
    const tooLong = await save(id, { queixas_principais: "x".repeat(5001) });
    expect(tooLong).toMatchObject({ ok: false, reason: "invalid" });
    expect((await current(id)).answers).toEqual({});
  });

  it("updated is audited at most every 30 minutes, without content", async () => {
    const id = await create();
    await save(id, { queixas_principais: "Dor" });
    await save(id, { queixas_principais: "Dor forte" });
    const rows = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityId, id),
          eq(auditLogs.action, "anamnesis.updated"),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.changes).toEqual({ patientId });
    const all = JSON.stringify(
      await db.select().from(auditLogs).where(eq(auditLogs.entityId, id)),
    );
    expect(all).not.toContain("Dor");
    expect(all).not.toContain("queixas");
  });

  it("other clinic and disabled clinic see nothing", async () => {
    const id = await create();
    expect(await getAnamnesis(other, patientId, id)).toBeNull();
    expect(await listAnamneses(other, otherPatientId)).toBeNull();
    expect(
      await createAnamnesis(other, otherPatientId, actorId, TODAY),
    ).toEqual({ ok: false });
    expect(
      await setAnamnesisStatus(other, patientId, id, "completed", actorId),
    ).toEqual({ ok: false });
    expect(await deleteAnamnesis(other, patientId, id, actorId)).toEqual({
      ok: false,
    });
    // Her own clinic still has it, and a bad id is just not found.
    expect(await getAnamnesis(CLINIC, patientId, id)).not.toBeNull();
    expect(await getAnamnesis(CLINIC, patientId, "not-a-uuid")).toBeNull();
  });

  it("status and delete are audited", async () => {
    const id = await create();
    expect(
      (await setAnamnesisStatus(CLINIC, patientId, id, "completed", actorId))
        .ok,
    ).toBe(true);
    expect((await current(id)).status).toBe("completed");
    expect(
      (await setAnamnesisStatus(CLINIC, patientId, id, "in_progress", actorId))
        .ok,
    ).toBe(true);
    await recordPdfGenerated(CLINIC, id, actorId);
    expect(await deleteAnamnesis(CLINIC, patientId, id, actorId)).toEqual({
      ok: true,
    });
    expect(await getAnamnesis(CLINIC, patientId, id)).toBeNull();
    expect(await actions(id)).toEqual([
      "anamnesis.created",
      "anamnesis.completed",
      "anamnesis.reopened",
      "anamnesis.pdf_generated",
      "anamnesis.deleted",
    ]);
  });

  it("an anonymized patient has no anamneses", async () => {
    const [anon] = await db
      .insert(patients)
      .values({
        clinicId: CLINIC,
        name: "Paciente anonimizado",
        anonymizedAt: new Date(),
      })
      .returning({ id: patients.id });
    try {
      const [row] = await db
        .insert(anamneses)
        .values({
          clinicId: CLINIC,
          patientId: anon!.id,
          template: "integrativa-ads-v1",
          takenOn: TODAY,
        })
        .returning({ id: anamneses.id });
      expect(await listAnamneses(CLINIC, anon!.id)).toBeNull();
      expect(await getAnamnesis(CLINIC, anon!.id, row!.id)).toBeNull();
      expect(await createAnamnesis(CLINIC, anon!.id, actorId, TODAY)).toEqual({
        ok: false,
      });
    } finally {
      await db.delete(anamneses).where(eq(anamneses.patientId, anon!.id));
      await db.delete(patients).where(eq(patients.id, anon!.id));
    }
  });

  it("the panel cannot insert an anamnesis for another clinic", async () => {
    let code: string | undefined;
    try {
      await inClinic(CLINIC, (tx) =>
        tx.insert(anamneses).values({
          clinicId: other,
          patientId: otherPatientId,
          template: "integrativa-ads-v1",
          takenOn: TODAY,
        }),
      );
    } catch (error) {
      const e = error as { code?: string; cause?: { code?: string } };
      code = e.cause?.code ?? e.code;
    }
    expect(code).toBe("42501");
  });
});
