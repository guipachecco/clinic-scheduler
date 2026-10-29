import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { db, pool } from "@/db/client";
import { clinicSettings, patients } from "@/db/schema";

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

describe("clinic settings", () => {
  it("starts with a single row, online booking off and no content", async () => {
    const rows = await db.select().from(clinicSettings);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 1,
      onlineBookingEnabled: false,
      timezone: "America/Sao_Paulo",
      clinicName: null,
      professionalName: null,
      whatsappPhone: null,
      address: null,
    });
  });

  it("does not accept a second row", async () => {
    expect(
      await failure(db.insert(clinicSettings).values({ id: 2 })),
    ).toContain("clinic_settings_singleton_check");
  });
});

describe("patients", () => {
  it("accepts only phones in international format", async () => {
    expect(
      await failure(
        db.insert(patients).values({
          name: "Paciente Fictício",
          nameNormalized: "paciente ficticio",
          phone: "(11) 0000-0000",
        }),
      ),
    ).toContain("patients_phone_check");
  });

  it("keeps no personal data after anonymization", async () => {
    const [patient] = await db
      .insert(patients)
      .values({
        name: "Paciente Fictício",
        nameNormalized: "paciente ficticio",
        phone: "+5500000000001",
        email: "paciente@example.com",
      })
      .returning();

    expect(
      await failure(
        db
          .update(patients)
          .set({ anonymizedAt: new Date() })
          .where(eq(patients.id, patient!.id)),
      ),
    ).toContain("patients_anonymized_check");

    await db
      .update(patients)
      .set({
        name: "Paciente anonimizado",
        nameNormalized: null,
        phone: null,
        email: null,
        anonymizedAt: sql`now()`,
      })
      .where(eq(patients.id, patient!.id));
  });
});
