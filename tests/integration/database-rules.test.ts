import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/client";
import { clinics, patients, users } from "@/db/schema";

import { CLINIC } from "../helpers/clinic";

afterAll(async () => {
  await endPools();
});

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return String((error as Error).cause ?? error);
  }
  throw new Error("expected the query to fail");
}

describe("clinics", () => {
  it("starts with the first clinic, online booking off and no content", async () => {
    const rows = await db.select().from(clinics).where(eq(clinics.id, CLINIC));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      slug: "grais",
      isActive: true,
      onlineBookingEnabled: false,
      timezone: "America/Sao_Paulo",
      professionalName: null,
      whatsappPhone: null,
      address: null,
    });
  });

  it("does not accept a repeated or malformed address", async () => {
    expect(
      await failure(db.insert(clinics).values({ slug: "grais", name: "X" })),
    ).toContain("clinics_slug_unique");
    expect(
      await failure(
        db.insert(clinics).values({ slug: "Com Espaço", name: "X" }),
      ),
    ).toContain("clinics_slug_check");
  });
});

describe("users", () => {
  it("requires a clinic for admin and none for root", async () => {
    expect(
      await failure(
        db.insert(users).values({
          name: "A",
          email: "sem-clinica@example.com",
          role: "admin",
        }),
      ),
    ).toContain("users_role_clinic_check");
    expect(
      await failure(
        db.insert(users).values({
          name: "R",
          email: "root-com-clinica@example.com",
          role: "root",
          clinicId: CLINIC,
        }),
      ),
    ).toContain("users_role_clinic_check");
  });
});

describe("patients", () => {
  it("accepts only phones in international format", async () => {
    expect(
      await failure(
        db.insert(patients).values({
          clinicId: CLINIC,
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
        clinicId: CLINIC,
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
