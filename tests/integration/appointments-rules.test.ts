import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/owner";
import {
  appointments,
  patients,
  serviceCategories,
  services,
} from "@/db/schema";

import { CLINIC } from "../helpers/clinic";

// Every record here is fictitious and exists only during the test.

type NewAppointment = typeof appointments.$inferInsert;

let patientId: string;
let serviceId: string;

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return String((error as Error).cause ?? error);
  }
  throw new Error("expected the query to fail");
}

function appointment(extra: Partial<NewAppointment> = {}): NewAppointment {
  const startsAt = new Date("2030-03-04T13:00Z");
  const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
  return {
    clinicId: CLINIC,
    patientId,
    serviceId,
    serviceName: "Serviço fictício",
    serviceDurationMinutes: 60,
    startsAt,
    endsAt,
    occupiedFrom: startsAt,
    occupiedUntil: endsAt,
    source: "admin",
    ...extra,
  };
}

function cancelled(reason: string): Partial<NewAppointment> {
  return {
    status: "cancelled",
    cancelledAt: new Date(),
    cancelledBy: "clinic",
    cancellationReason: reason,
  };
}

beforeEach(async () => {
  await db.execute(
    sql`truncate table appointments, patients, services, service_categories cascade`,
  );
  const [category] = await db
    .insert(serviceCategories)
    .values({
      clinicId: CLINIC,
      name: "Categoria fictícia",
      slug: "categoria-ficticia",
    })
    .returning();
  const [service] = await db
    .insert(services)
    .values({
      clinicId: CLINIC,
      categoryId: category!.id,
      name: "Serviço fictício",
      slug: "servico-ficticio",
      durationMinutes: 60,
    })
    .returning();
  const [patient] = await db
    .insert(patients)
    .values({
      clinicId: CLINIC,
      name: "Paciente Fictício",
      nameNormalized: "paciente ficticio",
      phone: "+5500000000000",
    })
    .returning();
  serviceId = service!.id;
  patientId = patient!.id;
});

afterAll(async () => {
  await endPools();
});

describe("appointment label and cancellation reason", () => {
  it("rejects an unknown cancellation reason", async () => {
    expect(
      await failure(
        db.insert(appointments).values(appointment(cancelled("whatever"))),
      ),
    ).toContain("appointments_cancellation_reason_check");
  });

  it("rejects a 61-char label and an empty one", async () => {
    expect(
      await failure(
        db
          .insert(appointments)
          .values(appointment({ customLabel: "a".repeat(61) })),
      ),
    ).toContain("appointments_custom_label_check");
    expect(
      await failure(
        db.insert(appointments).values(appointment({ customLabel: "" })),
      ),
    ).toContain("appointments_custom_label_check");
  });

  it("accepts a null label, a 60-char label and a listed reason", async () => {
    await db.insert(appointments).values(appointment());
    await db.execute(sql`truncate table appointments cascade`);
    await db
      .insert(appointments)
      .values(appointment({ customLabel: "a".repeat(60) }));
    await db.execute(sql`truncate table appointments cascade`);
    await db
      .insert(appointments)
      .values(appointment(cancelled("patient_request")));
    const rows = await db.select().from(appointments);
    expect(rows[0]?.cancellationReason).toBe("patient_request");
  });
});
