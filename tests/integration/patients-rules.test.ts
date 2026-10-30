import { afterAll, describe, expect, it } from "vitest";

import { db, pool } from "@/db/client";
import { patients } from "@/db/schema";

afterAll(async () => {
  await pool.end();
});

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return String((error as Error).cause ?? error);
  }
  throw new Error("expected the query to fail");
}

describe("patient registry rules", () => {
  it("rejects a CPF that is not 11 digits", async () => {
    expect(
      await failure(
        db.insert(patients).values({
          name: "Paciente Fictício",
          nameNormalized: "paciente ficticio cpf",
          phone: "+5500000000101",
          cpf: "123",
        }),
      ),
    ).toContain("patients_cpf_check");
  });

  it("rejects two patients with the same CPF", async () => {
    await db.insert(patients).values({
      name: "Paciente Um",
      nameNormalized: "paciente um",
      phone: "+5500000000102",
      cpf: "12345678901",
    });
    expect(
      await failure(
        db.insert(patients).values({
          name: "Paciente Dois",
          nameNormalized: "paciente dois",
          phone: "+5500000000103",
          cpf: "12345678901",
        }),
      ),
    ).toContain("patients_cpf_idx");
  });

  it("rejects referred_by without the referral source", async () => {
    expect(
      await failure(
        db.insert(patients).values({
          name: "Paciente Fictício",
          nameNormalized: "paciente ficticio ref",
          phone: "+5500000000104",
          referralSource: "google",
          referredBy: "Fulano",
        }),
      ),
    ).toContain("patients_referred_by_check");
  });

  it("rejects an anonymized patient that keeps a birth date", async () => {
    expect(
      await failure(
        db.insert(patients).values({
          name: "Paciente anonimizado",
          anonymizedAt: new Date(),
          birthDate: "1990-01-31",
        }),
      ),
    ).toContain("patients_anonymized_check");
  });

  it("accepts a patient with only name, phone and normalized name", async () => {
    const [patient] = await db
      .insert(patients)
      .values({
        name: "Paciente Simples",
        nameNormalized: "paciente simples",
        phone: "+5500000000105",
      })
      .returning();
    expect(patient).toMatchObject({
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
  });
});
