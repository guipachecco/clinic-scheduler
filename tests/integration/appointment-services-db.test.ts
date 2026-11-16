import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asClient, inClinic } from "@/db/client";
import { findPgError } from "@/db/errors";
import { db, endPools } from "@/db/owner";

import { CLINIC, otherClinic } from "../helpers/clinic";

// Migration 0035: appointment_services, the extra procedures of an
// appointment. Every record is fictitious.

let other: string;
let categoryId: string;
let serviceA: string;
let serviceB: string;
let serviceC: string;
let otherService: string;
let otherCategoryId: string;
let patient1: string;
let patient2: string;
let appointment1: string;
let appointment2: string;

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const pg = findPgError(error) as
      (Error & { code: string; constraint?: string }) | undefined;
    return { code: pg?.code, constraint: pg?.constraint };
  }
  throw new Error("expected the query to fail");
}

async function one<T>(query: ReturnType<typeof sql>) {
  const result = await db.execute<T & Record<string, unknown>>(query);
  return result.rows[0]!;
}

function extraSql(e: {
  clinic?: string;
  appointment?: string;
  service?: string;
  position?: number;
}) {
  return sql`insert into appointment_services (clinic_id, appointment_id,
                service_id, service_name, service_duration_minutes, position)
              values (${e.clinic ?? CLINIC}, ${e.appointment ?? appointment1},
                ${e.service ?? serviceA}, 'Extra', 20, ${e.position ?? 1})
              returning id`;
}

async function extra(e: Parameters<typeof extraSql>[0]) {
  return (await one<{ id: string }>(extraSql(e))).id;
}

async function appointment(
  patient: string,
  clinic: string,
  service: string,
  day: number,
) {
  return (
    await one<{ id: string }>(
      sql`insert into appointments (clinic_id, patient_id, service_id, service_name,
            service_duration_minutes, starts_at, ends_at, occupied_from,
            occupied_until, status, source)
          values (${clinic}, ${patient}, ${service}, 'Principal', 30,
            ${`2034-04-${day}T13:00Z`}, ${`2034-04-${day}T13:30Z`},
            ${`2034-04-${day}T13:00Z`}, ${`2034-04-${day}T13:30Z`},
            'confirmed', 'admin')
          returning id`,
    )
  ).id;
}

async function newService(clinic: string, category: string, slug: string) {
  return (
    await one<{ id: string }>(
      sql`insert into services (clinic_id, category_id, name, slug, duration_minutes)
          values (${clinic}, ${category}, ${slug}, ${slug}, 20)
          returning id`,
    )
  ).id;
}

async function newPatient(name: string, phone: string) {
  return (
    await one<{ id: string }>(
      sql`insert into patients (clinic_id, name, name_normalized, phone)
          values (${CLINIC}, ${name}, ${name.toLowerCase()}, ${phone})
          returning id`,
    )
  ).id;
}

beforeAll(async () => {
  other = await otherClinic("clinica-extras-teste");
  const category = async (clinic: string) =>
    (
      await one<{ id: string }>(
        sql`insert into service_categories (clinic_id, name, slug)
            values (${clinic}, 'Categoria Extras', ${`categoria-extras-${clinic.slice(0, 8)}`})
            returning id`,
      )
    ).id;
  categoryId = await category(CLINIC);
  otherCategoryId = await category(other);
  serviceA = await newService(CLINIC, categoryId, "extras-a");
  serviceB = await newService(CLINIC, categoryId, "extras-b");
  serviceC = await newService(CLINIC, categoryId, "extras-c");
  otherService = await newService(other, otherCategoryId, "extras-alheio");
  patient1 = await newPatient("Paciente Extras Um", "+5511900000501");
  patient2 = await newPatient("Paciente Extras Dois", "+5511900000502");
  appointment1 = await appointment(patient1, CLINIC, serviceC, 1);
  appointment2 = await appointment(patient2, CLINIC, serviceC, 2);
});

afterAll(async () => {
  await db.execute(
    sql`delete from appointment_services where appointment_id in (${appointment1}, ${appointment2})`,
  );
  await db.execute(
    sql`delete from appointments where id in (${appointment1}, ${appointment2})`,
  );
  await db.execute(
    sql`delete from patients where id in (${patient1}, ${patient2})`,
  );
  await db.execute(
    sql`delete from services where id in (${serviceA}, ${serviceB}, ${serviceC}, ${otherService})`,
  );
  await db.execute(
    sql`delete from service_categories where id in (${categoryId}, ${otherCategoryId})`,
  );
  await endPools();
});

describe("appointment_services database", () => {
  it("a clinic reads and adds its own extras, never another clinic's", async () => {
    const mine = await inClinic(CLINIC, (tx) =>
      tx.execute(extraSql({ service: serviceA, position: 1 })),
    );
    const id = mine.rows[0]!.id as string;

    const seen = await inClinic(CLINIC, (tx) =>
      tx.execute(sql`select id from appointment_services where id = ${id}`),
    );
    expect(seen.rows).toEqual([{ id }]);
    const hidden = await inClinic(other, (tx) =>
      tx.execute(sql`select id from appointment_services where id = ${id}`),
    );
    expect(hidden.rows).toEqual([]);

    // Not into another clinic.
    expect(
      (
        await failure(
          inClinic(other, (tx) =>
            tx.execute(extraSql({ service: serviceB, position: 2 })),
          ),
        )
      ).code,
    ).toBe("42501");

    // The panel may delete, not update.
    expect(
      (
        await failure(
          inClinic(CLINIC, (tx) =>
            tx.execute(
              sql`update appointment_services set position = 5 where id = ${id}`,
            ),
          ),
        )
      ).code,
    ).toBe("42501");
    await inClinic(CLINIC, (tx) =>
      tx.execute(sql`delete from appointment_services where id = ${id}`),
    );
    const gone = await db.execute(
      sql`select id from appointment_services where id = ${id}`,
    );
    expect(gone.rows).toEqual([]);
  });

  it("a client reads the extras of her own appointments and nothing else", async () => {
    await extra({ appointment: appointment1, service: serviceA, position: 1 });
    await extra({ appointment: appointment2, service: serviceB, position: 1 });
    const scope = (patientId: string) => ({
      clinicId: CLINIC,
      patientId,
      userId: randomUUID(),
    });

    const mine = await asClient(scope(patient1), (tx) =>
      tx.execute(sql`select appointment_id from appointment_services`),
    );
    expect(mine.rows).toEqual([{ appointment_id: appointment1 }]);
    const theirs = await asClient(scope(patient2), (tx) =>
      tx.execute(sql`select appointment_id from appointment_services`),
    );
    expect(theirs.rows).toEqual([{ appointment_id: appointment2 }]);

    // Another clinic's page sees none.
    const elsewhere = await asClient(
      { ...scope(patient1), clinicId: other },
      (tx) => tx.execute(sql`select id from appointment_services`),
    );
    expect(elsewhere.rows).toEqual([]);

    // She neither adds nor deletes.
    expect(
      (
        await failure(
          asClient(scope(patient1), (tx) =>
            tx.execute(extraSql({ service: serviceB, position: 2 })),
          ),
        )
      ).code,
    ).toBe("42501");
    expect(
      (
        await failure(
          asClient(scope(patient1), (tx) =>
            tx.execute(sql`delete from appointment_services`),
          ),
        )
      ).code,
    ).toBe("42501");
  });

  it("refuses a repeated service or position in the same appointment", async () => {
    await extra({ appointment: appointment1, service: serviceB, position: 3 });
    expect(
      await failure(db.execute(extraSql({ service: serviceB, position: 4 }))),
    ).toEqual({
      code: "23505",
      constraint: "appointment_services_service_unique",
    });
    expect(
      await failure(db.execute(extraSql({ service: serviceC, position: 3 }))),
    ).toEqual({
      code: "23505",
      constraint: "appointment_services_position_unique",
    });
  });

  it("position is between 1 and 9", async () => {
    for (const position of [0, 10, -1]) {
      expect(
        await failure(
          db.execute(extraSql({ appointment: appointment2, position })),
        ),
      ).toEqual({
        code: "23514",
        constraint: "appointment_services_position_check",
      });
    }
    await extra({ appointment: appointment2, service: serviceC, position: 9 });
  });

  it("refuses a service or appointment of another clinic", async () => {
    expect(
      (
        await failure(
          db.execute(extraSql({ service: otherService, position: 7 })),
        )
      ).code,
    ).toBe("23503");
    expect(
      (
        await failure(
          db.execute(
            extraSql({ clinic: other, service: otherService, position: 7 }),
          ),
        )
      ).code,
    ).toBe("23503");
  });

  it("a service in use is never deleted, and deleting the appointment deletes its extras", async () => {
    // serviceA is an extra of appointment1 (added above).
    expect(
      (
        await failure(
          db.execute(sql`delete from services where id = ${serviceA}`),
        )
      ).code,
    ).toBe("23503");

    const temp = await appointment(patient1, CLINIC, serviceC, 3);
    await extra({ appointment: temp, service: serviceB, position: 1 });
    await db.execute(sql`delete from appointments where id = ${temp}`);
    const left = await db.execute(
      sql`select id from appointment_services where appointment_id = ${temp}`,
    );
    expect(left.rows).toEqual([]);
  });
});
