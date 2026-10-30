import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, pool } from "@/db/client";
import {
  appointments,
  auditLogs,
  patients,
  serviceCategories,
  services,
  users,
} from "@/db/schema";
import {
  patientFormSchema,
  type PatientFormValues,
} from "@/modules/patients/fields";
import {
  ANONYMIZED_NAME,
  anonymizePatient,
  createPatient,
  getPatient,
  type PatientCursor,
  searchPatients,
  updatePatient,
} from "@/modules/patients/patients";

// Every record here is fictitious and exists only during the test.

let actorId: string;
let serviceId: string;

function form(overrides: Record<string, string> = {}): PatientFormValues {
  return patientFormSchema.parse({
    name: "Maria Fictícia",
    nickname: "Mari",
    cpf: "529.982.247-25",
    rg: "1234567",
    phone: "(48) 99999-1234",
    landlinePhone: "(48) 3333-1234",
    email: "maria@example.com",
    birthDate: "1990-05-10",
    gender: "female",
    referralSource: "referral",
    referredBy: "Ana Fictícia",
    notes: "Prefere horário da manhã.",
    ...overrides,
  });
}

async function created(overrides: Record<string, string> = {}) {
  const result = await createPatient(form(overrides), actorId);
  if (!result.ok) throw new Error("expected create to succeed");
  return result.id;
}

async function addAppointment(
  patientId: string,
  startsAt: Date,
  status: "requested" | "confirmed" | "cancelled" | "completed",
) {
  const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
  await db.insert(appointments).values({
    patientId,
    serviceId,
    serviceName: "Serviço fictício",
    serviceDurationMinutes: 60,
    startsAt,
    endsAt,
    occupiedFrom: startsAt,
    occupiedUntil: endsAt,
    source: "online",
    status,
    ...(status === "cancelled"
      ? { cancelledAt: new Date(), cancelledBy: "patient" as const }
      : {}),
    ...(status === "confirmed" ? { confirmedAt: new Date() } : {}),
  });
}

beforeEach(async () => {
  await db.execute(
    sql`truncate table audit_logs, appointments, patients, services, service_categories, users cascade`,
  );
  const [user] = await db
    .insert(users)
    .values({
      name: "Admin Fictício",
      email: "admin@example.com",
      role: "admin",
    })
    .returning();
  actorId = user!.id;
  const [category] = await db
    .insert(serviceCategories)
    .values({ name: "Categoria fictícia", slug: "categoria-ficticia" })
    .returning();
  const [service] = await db
    .insert(services)
    .values({
      categoryId: category!.id,
      name: "Serviço fictício",
      slug: "servico-ficticio",
      durationMinutes: 60,
    })
    .returning();
  serviceId = service!.id;
});

afterAll(async () => {
  await pool.end();
});

describe("createPatient / getPatient", () => {
  it("round-trips every field", async () => {
    const id = await created();
    const record = await getPatient(id);
    expect(record).toMatchObject({
      id,
      name: "Maria Fictícia",
      nickname: "Mari",
      cpf: "52998224725",
      rg: "1234567",
      phone: "+5548999991234",
      landlinePhone: "+554833331234",
      email: "maria@example.com",
      birthDate: "1990-05-10",
      gender: "female",
      referralSource: "referral",
      referredBy: "Ana Fictícia",
      notes: "Prefere horário da manhã.",
    });
  });

  it("returns null for a missing id and a non-UUID id", async () => {
    expect(await getPatient("00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await getPatient("not-a-uuid")).toBeNull();
  });

  it("returns an anonymized patient with anonymizedAt set", async () => {
    const id = await created();
    expect((await getPatient(id))?.anonymizedAt).toBeNull();
    await anonymizePatient(id, actorId);
    const record = await getPatient(id);
    expect(record?.name).toBe(ANONYMIZED_NAME);
    expect(record?.anonymizedAt).toBeInstanceOf(Date);
    expect(record?.cpf).toBeNull();
    expect(record?.phone).toBeNull();
  });

  it("writes one patient.created audit row with no input values", async () => {
    const id = await created();
    const rows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "patient.created",
      entityType: "patient",
      actorType: "admin",
      actorUserId: actorId,
    });
    const serialized = JSON.stringify(rows[0]!.changes ?? {});
    for (const value of [
      "Maria",
      "Mari",
      "52998224725",
      "99999",
      "example.com",
      "1990",
    ]) {
      expect(serialized).not.toContain(value);
    }
  });

  it("reports a duplicate CPF with the existing patient", async () => {
    const existing = await created();
    const result = await createPatient(
      form({ name: "Outra Pessoa", phone: "(48) 98888-0000" }),
      actorId,
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: { cpf: expect.any(String) },
      existingPatientId: existing,
    });
  });

  it("reports a duplicate phone and name with the existing patient", async () => {
    const existing = await created();
    const result = await createPatient(form({ cpf: "" }), actorId);
    expect(result).toEqual({
      ok: false,
      fieldErrors: { phone: expect.any(String) },
      existingPatientId: existing,
    });
  });

  it("lets exactly one of two concurrent creates with the same CPF win", async () => {
    const results = await Promise.all([
      createPatient(
        form({ name: "Primeira Pessoa", phone: "(48) 97777-0001" }),
        actorId,
      ),
      createPatient(
        form({ name: "Segunda Pessoa", phone: "(48) 97777-0002" }),
        actorId,
      ),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const failed = results.find((r) => !r.ok);
    expect(failed).toMatchObject({
      ok: false,
      fieldErrors: { cpf: expect.any(String) },
    });
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(patients);
    expect(row?.total).toBe(1);
  });
});

describe("updatePatient", () => {
  it("audits exactly the changed field names", async () => {
    const id = await created();
    const result = await updatePatient(
      id,
      form({ nickname: "Mara", notes: "Outra observação." }),
      actorId,
    );
    expect(result).toEqual({ ok: true, id });
    const [row] = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityId, id),
          eq(auditLogs.action, "patient.updated"),
        ),
      );
    expect(row).toMatchObject({
      entityType: "patient",
      actorType: "admin",
      actorUserId: actorId,
    });
    expect((row!.changes as { fields: string[] }).fields.sort()).toEqual([
      "nickname",
      "notes",
    ]);
    expect((await getPatient(id))?.nickname).toBe("Mara");
  });

  it("keeps the name search in step with a rename", async () => {
    const id = await created();
    await updatePatient(id, form({ name: "Joana Nova" }), actorId);
    expect(
      (await searchPatients({ term: "joana" })).items.map((i) => i.id),
    ).toEqual([id]);
    expect((await searchPatients({ term: "maria" })).items).toHaveLength(0);
  });

  it("reports a CPF that belongs to another patient", async () => {
    const other = await created();
    const id = await created({
      name: "Terceira Pessoa",
      cpf: "",
      phone: "(48) 96666-0000",
    });
    const result = await updatePatient(
      id,
      form({ name: "Terceira Pessoa", phone: "(48) 96666-0000" }),
      actorId,
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: { cpf: expect.any(String) },
      existingPatientId: other,
    });
  });

  it("refuses a missing or anonymized patient without writing", async () => {
    const missing = await updatePatient(
      "00000000-0000-4000-8000-000000000000",
      form(),
      actorId,
    );
    expect(missing).toEqual({ ok: false, fieldErrors: {} });
    const id = await created();
    await anonymizePatient(id, actorId);
    expect(
      await updatePatient(id, form({ name: "Outro Nome" }), actorId),
    ).toEqual({
      ok: false,
      fieldErrors: {},
    });
    const [row] = await db.select().from(patients).where(eq(patients.id, id));
    expect(row?.name).toBe("Paciente anonimizado");
  });
});

describe("searchPatients", () => {
  it("finds by an accent-insensitive name substring", async () => {
    const id = await created({
      name: "Márcia da Silva",
      nickname: "",
      cpf: "",
    });
    await created({
      name: "Outro Nome",
      nickname: "",
      cpf: "",
      phone: "(48) 98888-0000",
    });
    const { items } = await searchPatients({ term: "MARCIA" });
    expect(items.map((i) => i.id)).toEqual([id]);
    expect(items[0]).toEqual({
      id,
      name: "Márcia da Silva",
      nickname: null,
      phone: "+5548999991234",
      birthDate: "1990-05-10",
      anonymizedAt: null,
    });
  });

  it("finds by nickname, ignoring accents", async () => {
    const id = await created({ nickname: "Zezé" });
    expect(
      (await searchPatients({ term: "zeze" })).items.map((i) => i.id),
    ).toEqual([id]);
  });

  it("finds a nickname with repeated inner spaces", async () => {
    const id = await created({ nickname: "Zé  Maria" });
    expect(
      (await searchPatients({ term: "ze maria" })).items.map((i) => i.id),
    ).toEqual([id]);
  });

  it("finds by phone when the term starts with +", async () => {
    const id = await created();
    expect(
      (await searchPatients({ term: "+55 48 9" })).items.map((i) => i.id),
    ).toEqual([id]);
  });

  it("finds by the last 4 phone digits and by a CPF prefix", async () => {
    const id = await created();
    expect(
      (await searchPatients({ term: "1234" })).items.map((i) => i.id),
    ).toEqual([id]);
    expect(
      (await searchPatients({ term: "529.982" })).items.map((i) => i.id),
    ).toEqual([id]);
  });

  it("treats % and _ as plain characters", async () => {
    await created();
    expect((await searchPatients({ term: "%" })).items).toHaveLength(0);
    expect((await searchPatients({ term: "m_ria" })).items).toHaveLength(0);
  });

  it("lists anonymized patients, sorted among the other names", async () => {
    const ana = await created({ name: "Ana", cpf: "" });
    const pedro = await created({
      name: "Pedro",
      cpf: "",
      phone: "(48) 98888-0001",
    });
    const zelia = await created({
      name: "Zélia",
      cpf: "",
      phone: "(48) 98888-0002",
    });
    const anon = await created({
      name: "Qualquer Nome",
      cpf: "",
      phone: "(48) 98888-0003",
    });
    await anonymizePatient(anon, actorId);
    const { items } = await searchPatients({ term: "" });
    expect(items.map((i) => i.id)).toEqual([ana, anon, pedro, zelia]);
    const row = items.find((i) => i.id === anon);
    expect(row).toMatchObject({
      name: ANONYMIZED_NAME,
      phone: null,
      birthDate: null,
    });
    expect(row?.anonymizedAt).toBeInstanceOf(Date);
  });

  it("finds anonymized patients by the name search only", async () => {
    const id = await created();
    await anonymizePatient(id, actorId);
    expect(
      (await searchPatients({ term: "anonimizado" })).items.map((i) => i.id),
    ).toEqual([id]);
    expect(
      (await searchPatients({ term: "Paciente Anonimizado" })).items,
    ).toHaveLength(1);
    expect((await searchPatients({ term: "529982" })).items).toHaveLength(0);
  });

  it("pages across the anonymized sort key with no overlap and no gaps", async () => {
    const anonymizedKey = "paciente anonimizado";
    await db.insert(patients).values(
      Array.from({ length: 60 }, (_, i) => {
        const n = String(i).padStart(2, "0");
        return {
          name: `Paciente ${n}`,
          nameNormalized: `paciente ${n}`,
          phone: `+55489000000${n}`,
        };
      }),
    );
    await db.insert(patients).values(
      Array.from({ length: 8 }, () => ({
        name: ANONYMIZED_NAME,
        nameNormalized: null,
        phone: null,
        anonymizedAt: new Date(),
      })),
    );
    const expected = await db.execute<{ id: string }>(
      sql`select id from patients order by coalesce(name_normalized, ${anonymizedKey}), id`,
    );
    const seen: string[] = [];
    let after: PatientCursor | undefined;
    let pages = 0;
    do {
      const page = await searchPatients({ term: "", after });
      seen.push(...page.items.map((i) => i.id));
      after = page.next;
      pages += 1;
    } while (after);
    expect(pages).toBe(2);
    expect(seen).toEqual(expected.rows.map((r) => r.id));
    expect(new Set(seen).size).toBe(68);
  });

  it("continues correctly when the cursor is the anonymized sort key", async () => {
    await db.insert(patients).values(
      Array.from({ length: 49 }, (_, i) => {
        const n = String(i).padStart(2, "0");
        return {
          name: `Aaa ${n}`,
          nameNormalized: `aaa ${n}`,
          phone: `+55489100000${n}`,
        };
      }),
    );
    await db.insert(patients).values(
      Array.from({ length: 5 }, () => ({
        name: ANONYMIZED_NAME,
        nameNormalized: null,
        phone: null,
        anonymizedAt: new Date(),
      })),
    );
    const first = await searchPatients({ term: "" });
    expect(first.items).toHaveLength(50);
    expect(first.next?.nameNormalized).toBe("paciente anonimizado");
    const second = await searchPatients({ term: "", after: first.next });
    expect(second.items).toHaveLength(4);
    expect(second.next).toBeUndefined();
    const ids = new Set([...first.items, ...second.items].map((i) => i.id));
    expect(ids.size).toBe(54);
  });

  it("pages by cursor, 50 at a time, with no overlap", async () => {
    const values = Array.from({ length: 55 }, (_, i) => {
      const n = String(i).padStart(2, "0");
      return {
        name: `Paciente ${n}`,
        nameNormalized: `paciente ${n}`,
        phone: `+55489000000${n}`,
      };
    });
    await db.insert(patients).values(values);
    const first = await searchPatients({ term: "paciente" });
    expect(first.items).toHaveLength(50);
    expect(first.next).toBeDefined();
    const second = await searchPatients({
      term: "paciente",
      after: first.next,
    });
    expect(second.items).toHaveLength(5);
    expect(second.next).toBeUndefined();
    const ids = new Set([...first.items, ...second.items].map((i) => i.id));
    expect(ids.size).toBe(55);
  });
});

describe("anonymizePatient", () => {
  it("clears every personal field and sets the label", async () => {
    const id = await created();
    expect(await anonymizePatient(id, actorId)).toEqual({ ok: true });
    const [row] = await db.select().from(patients).where(eq(patients.id, id));
    expect(row).toMatchObject({
      name: "Paciente anonimizado",
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
    });
    expect(row?.anonymizedAt).toBeInstanceOf(Date);
    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityId, id),
          eq(auditLogs.action, "patient.anonymized"),
        ),
      );
    expect(audit).toMatchObject({
      entityType: "patient",
      actorType: "admin",
      actorUserId: actorId,
    });
  });

  it("is refused with a future requested or confirmed appointment", async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    const a = await created();
    await addAppointment(a, future, "confirmed");
    expect(await anonymizePatient(a, actorId)).toEqual({
      ok: false,
      reason: "has_future_appointments",
    });
    const b = await created({
      name: "Outra Pessoa",
      cpf: "",
      phone: "(48) 98888-0000",
    });
    await addAppointment(
      b,
      new Date(future.getTime() + 3 * 60 * 60_000),
      "requested",
    );
    expect(await anonymizePatient(b, actorId)).toEqual({
      ok: false,
      reason: "has_future_appointments",
    });
    expect((await getPatient(a))?.name).toBe("Maria Fictícia");
  });

  it("is allowed with a past or cancelled appointment", async () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    const future = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    const a = await created();
    await addAppointment(a, past, "completed");
    await addAppointment(a, future, "cancelled");
    expect(await anonymizePatient(a, actorId)).toEqual({ ok: true });
  });

  it("returns not_found for a missing patient", async () => {
    expect(
      await anonymizePatient("00000000-0000-4000-8000-000000000000", actorId),
    ).toEqual({ ok: false, reason: "not_found" });
  });
});
