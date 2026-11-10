import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inClinic } from "@/db/client";
import { db, endPools } from "@/db/owner";
import { anamneses, patients } from "@/db/schema";
import { getClinic } from "@/modules/clinics/clinics";

import { CLINIC, otherClinic } from "../helpers/clinic";

// The anamnesis table and the clinic flag that turns it on. Every record is
// fictitious.

let other: string;
let patientA: string;
let patientB: string;

async function pgCode(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code;
  }
  return undefined;
}

async function patient(clinicId: string, name: string, phone: string) {
  const [row] = await db
    .insert(patients)
    .values({
      clinicId,
      name,
      nameNormalized: name.toLowerCase(),
      phone,
    })
    .returning({ id: patients.id });
  return row!.id;
}

beforeAll(async () => {
  other = await otherClinic();
  patientA = await patient(CLINIC, "Paciente Anamnese A", "+5511900000201");
  patientB = await patient(other, "Paciente Anamnese B", "+5511900000202");
});

afterAll(async () => {
  await db
    .delete(anamneses)
    .where(inArray(anamneses.patientId, [patientA, patientB]));
  await db.delete(patients).where(inArray(patients.id, [patientA, patientB]));
  await endPools();
});

describe("anamnesis database", () => {
  it("grais has the anamnesis on, other clinics do not", async () => {
    expect((await getClinic(CLINIC))?.anamnesisTemplate).toBe(
      "integrativa-ads-v1",
    );
    expect((await getClinic(other))?.anamnesisTemplate).toBeNull();
  });

  it("panel sees only its clinic's anamneses", async () => {
    await db.insert(anamneses).values([
      {
        clinicId: CLINIC,
        patientId: patientA,
        template: "integrativa-ads-v1",
        takenOn: "2026-11-10",
      },
      {
        clinicId: other,
        patientId: patientB,
        template: "integrativa-ads-v1",
        takenOn: "2026-11-10",
      },
    ]);
    const seen = await inClinic(CLINIC, (tx) => tx.select().from(anamneses));
    expect(seen.map((row) => row.patientId)).toEqual([patientA]);
    expect(seen[0]!.status).toBe("in_progress");
    expect(seen[0]!.answers).toEqual({});
  });

  it("an anamnesis cannot point at another clinic's patient", async () => {
    const code = await pgCode(
      db.insert(anamneses).values({
        clinicId: CLINIC,
        patientId: patientB,
        template: "integrativa-ads-v1",
        takenOn: "2026-11-10",
      }),
    );
    expect(code).toBe("23503");
  });

  it("answers over 200 KB are refused", async () => {
    const code = await pgCode(
      db.insert(anamneses).values({
        clinicId: CLINIC,
        patientId: patientA,
        template: "integrativa-ads-v1",
        takenOn: "2026-11-10",
        answers: { queixa: "x".repeat(250_000) },
      }),
    );
    expect(code).toBe("23514");
  });
});
