import { count, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, pool } from "@/db/client";
import { isAppointmentOverlapError, isUniqueViolation } from "@/db/errors";
import {
  appointments,
  patients,
  serviceCategories,
  services,
} from "@/db/schema";

// The database itself must refuse two active appointments in overlapping
// time ranges, even when the requests arrive at the same moment.
// Every record here is fictitious and exists only during the test.

type NewAppointment = typeof appointments.$inferInsert;

let patientId: string;
let serviceId: string;

const MINUTE = 60_000;

function appointmentAt(
  start: string,
  options: {
    minutes?: number;
    bufferBefore?: number;
    bufferAfter?: number;
  } & Partial<NewAppointment> = {},
): NewAppointment {
  const { minutes = 60, bufferBefore = 0, bufferAfter = 0, ...rest } = options;
  const startsAt = new Date(start);
  const endsAt = new Date(startsAt.getTime() + minutes * MINUTE);
  return {
    patientId,
    serviceId,
    serviceName: "Serviço fictício",
    serviceDurationMinutes: minutes,
    startsAt,
    endsAt,
    occupiedFrom: new Date(startsAt.getTime() - bufferBefore * MINUTE),
    occupiedUntil: new Date(endsAt.getTime() + bufferAfter * MINUTE),
    source: "online",
    ...rest,
  };
}

async function insertError(values: NewAppointment) {
  try {
    await db.insert(appointments).values(values);
  } catch (error) {
    return error;
  }
  throw new Error("expected the insert to fail");
}

beforeEach(async () => {
  await db.execute(
    sql`truncate table appointments, patients, services, service_categories cascade`,
  );
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
  const [patient] = await db
    .insert(patients)
    .values({
      name: "Paciente Fictício",
      nameNormalized: "paciente ficticio",
      phone: "+5500000000000",
    })
    .returning();
  serviceId = service!.id;
  patientId = patient!.id;
});

afterAll(async () => {
  await pool.end();
});

describe("appointments_no_overlap constraint", () => {
  it("rejects an active appointment that overlaps another", async () => {
    await db.insert(appointments).values(appointmentAt("2030-03-04T13:00Z"));

    const error = await insertError(appointmentAt("2030-03-04T13:30Z"));
    expect(isAppointmentOverlapError(error)).toBe(true);
  });

  it("treats confirmed and requested appointments as occupying the slot", async () => {
    await db.insert(appointments).values(
      appointmentAt("2030-03-04T13:00Z", {
        status: "confirmed",
        confirmedAt: new Date(),
      }),
    );

    const error = await insertError(appointmentAt("2030-03-04T12:30Z"));
    expect(isAppointmentOverlapError(error)).toBe(true);
  });

  it("allows an appointment to start exactly when the previous one ends", async () => {
    await db.insert(appointments).values(appointmentAt("2030-03-04T13:00Z"));
    await db.insert(appointments).values(appointmentAt("2030-03-04T14:00Z"));

    const [row] = await db.select({ total: count() }).from(appointments);
    expect(row?.total).toBe(2);
  });

  it("includes preparation and cleanup buffers in the occupied time", async () => {
    await db
      .insert(appointments)
      .values(appointmentAt("2030-03-04T13:00Z", { bufferAfter: 15 }));

    const error = await insertError(appointmentAt("2030-03-04T14:00Z"));
    expect(isAppointmentOverlapError(error)).toBe(true);
    await db.insert(appointments).values(appointmentAt("2030-03-04T14:15Z"));
  });

  it("frees the slot when an appointment is cancelled, completed or missed", async () => {
    await db.insert(appointments).values([
      appointmentAt("2030-03-04T13:00Z", {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledBy: "patient",
      }),
      appointmentAt("2030-03-04T13:00Z", { status: "completed" }),
      appointmentAt("2030-03-04T13:00Z", { status: "no_show" }),
    ]);

    await db.insert(appointments).values(appointmentAt("2030-03-04T13:00Z"));
  });

  it("rejects moving an appointment onto an occupied time", async () => {
    await db.insert(appointments).values(appointmentAt("2030-03-04T13:00Z"));
    const [other] = await db
      .insert(appointments)
      .values(appointmentAt("2030-03-04T15:00Z"))
      .returning();

    const moved = appointmentAt("2030-03-04T13:30Z");
    const error = await db
      .update(appointments)
      .set({
        startsAt: moved.startsAt,
        endsAt: moved.endsAt,
        occupiedFrom: moved.occupiedFrom,
        occupiedUntil: moved.occupiedUntil,
      })
      .where(eq(appointments.id, other!.id))
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );
    expect(isAppointmentOverlapError(error)).toBe(true);
  });

  it("accepts only one of many simultaneous requests for the same time", async () => {
    // Each attempt holds its transaction open for a moment, so they overlap in time.
    const attempts = Array.from({ length: 8 }, () =>
      db.transaction(async (tx) => {
        await tx
          .insert(appointments)
          .values(appointmentAt("2030-03-04T13:00Z"));
        await tx.execute(sql`select pg_sleep(0.05)`);
      }),
    );
    const results = await Promise.allSettled(attempts);

    const rejected = results.filter((result) => result.status === "rejected");
    expect(results.length - rejected.length).toBe(1);
    for (const result of rejected) {
      expect(isAppointmentOverlapError(result.reason)).toBe(true);
    }
    const [row] = await db.select({ total: count() }).from(appointments);
    expect(row?.total).toBe(1);
  });

  it("accepts only one of simultaneous requests for staggered overlapping times", async () => {
    const starts = [
      "2030-03-04T13:00Z",
      "2030-03-04T13:10Z",
      "2030-03-04T13:20Z",
      "2030-03-04T12:40Z",
      "2030-03-04T12:50Z",
    ];
    const results = await Promise.allSettled(
      starts.map((start) =>
        db.transaction(async (tx) => {
          await tx.insert(appointments).values(appointmentAt(start));
          await tx.execute(sql`select pg_sleep(0.05)`);
        }),
      ),
    );

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
  });
});

describe("other appointment rules in the database", () => {
  it("rejects a repeated idempotency key", async () => {
    const idempotencyKey = crypto.randomUUID();
    await db
      .insert(appointments)
      .values(appointmentAt("2030-03-04T13:00Z", { idempotencyKey }));

    const error = await insertError(
      appointmentAt("2030-03-05T13:00Z", { idempotencyKey }),
    );
    expect(
      isUniqueViolation(error, "appointments_idempotency_key_unique"),
    ).toBe(true);
  });

  it("requires cancellation data exactly when the status is cancelled", async () => {
    const withoutData = await insertError(
      appointmentAt("2030-03-04T13:00Z", { status: "cancelled" }),
    );
    expect(String((withoutData as Error).cause)).toContain(
      "appointments_cancellation_check",
    );

    const activeWithData = await insertError(
      appointmentAt("2030-03-04T13:00Z", {
        cancelledAt: new Date(),
        cancelledBy: "clinic",
      }),
    );
    expect(String((activeWithData as Error).cause)).toContain(
      "appointments_cancellation_check",
    );
  });
});
