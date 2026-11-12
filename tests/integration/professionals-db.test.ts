import { and, asc, eq, ne, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { clientDb, panelDb, withClinic } from "@/db/client";
import { findPgError, isAppointmentOverlapError } from "@/db/errors";
import { db, endPools } from "@/db/owner";
import {
  appointments,
  clinics,
  patients,
  professionals,
  serviceCategories,
  services,
  timeBlocks,
} from "@/db/schema";

import { CLINIC, otherClinic } from "../helpers/clinic";

// Migration 0031: professionals, one agenda per professional, the triggers
// that keep every clinic and every appointment with a professional, and the
// busy intervals of one professional. Every record here is fictitious.

type NewAppointment = typeof appointments.$inferInsert;

const MINUTE = 60_000;

let first: string; // the professional migration 0031 gave CLINIC
let clinicB: string;
let patientId: string;
let serviceId: string;

function appointmentAt(
  start: string,
  rest: Partial<NewAppointment> = {},
): NewAppointment {
  const startsAt = new Date(start);
  const endsAt = new Date(startsAt.getTime() + 60 * MINUTE);
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
    status: "confirmed",
    confirmedAt: new Date(),
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

async function addProfessional(clinicId: string, name: string, sortOrder = 1) {
  const [row] = await db
    .insert(professionals)
    .values({ clinicId, name, sortOrder })
    .returning({ id: professionals.id });
  return row!.id;
}

beforeAll(async () => {
  const [row] = await db
    .select({ id: professionals.id })
    .from(professionals)
    .where(eq(professionals.clinicId, CLINIC))
    .orderBy(asc(professionals.createdAt))
    .limit(1);
  first = row!.id;
  clinicB = await otherClinic("profissionais-outra-clinica");
});

beforeEach(async () => {
  await db.execute(
    sql`truncate table appointments, time_blocks, patients, services, service_categories cascade`,
  );
  await db
    .delete(professionals)
    .where(
      and(eq(professionals.clinicId, CLINIC), ne(professionals.id, first)),
    );
  await db
    .update(professionals)
    .set({ isActive: true, sortOrder: 0 })
    .where(eq(professionals.id, first));
  const [category] = await db
    .insert(serviceCategories)
    .values({ clinicId: CLINIC, name: "Categoria", slug: "categoria" })
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
      name: "Paciente Fictícia",
      nameNormalized: "paciente ficticia",
      phone: "+5500000000031",
    })
    .returning();
  serviceId = service!.id;
  patientId = patient!.id;
});

afterAll(async () => {
  await db.execute(sql`truncate table appointments cascade`);
  await db
    .delete(professionals)
    .where(
      and(eq(professionals.clinicId, CLINIC), ne(professionals.id, first)),
    );
  await db
    .update(clinics)
    .set({ onlineBookingChoice: false })
    .where(eq(clinics.id, CLINIC));
  await endPools();
});

describe("professionals of a clinic", () => {
  it("a new clinic starts with one professional, named after it", async () => {
    const [clinic] = await db
      .insert(clinics)
      .values({
        slug: "clinica-com-equipe",
        name: "Clínica Fictícia da Equipe",
        displayName: "Ana",
      })
      .returning({ id: clinics.id });
    const team = await db
      .select({ name: professionals.name, isActive: professionals.isActive })
      .from(professionals)
      .where(eq(professionals.clinicId, clinic!.id));
    expect(team).toEqual([{ name: "Ana", isActive: true }]);
  });

  it("an appointment without a professional goes to the default one", async () => {
    // A second professional, earlier in the order, becomes the default.
    const second = await addProfessional(CLINIC, "Bia", 0);
    await db
      .update(professionals)
      .set({ sortOrder: 5 })
      .where(eq(professionals.id, first));
    const [row] = await db
      .insert(appointments)
      .values(appointmentAt("2031-05-06T13:00Z"))
      .returning({ professionalId: appointments.professionalId });
    expect(row!.professionalId).toBe(second);
  });

  it("the default skips inactive professionals", async () => {
    const second = await addProfessional(CLINIC, "Bia", 9);
    await db
      .update(professionals)
      .set({ isActive: false })
      .where(eq(professionals.id, first));
    const result = await db.execute<{ id: string }>(
      sql`select default_professional(${CLINIC}::uuid) as id`,
    );
    expect(result.rows[0]!.id).toBe(second);
  });

  it("two professionals may see patients at the same time", async () => {
    const second = await addProfessional(CLINIC, "Bia");
    await db
      .insert(appointments)
      .values(appointmentAt("2031-05-06T13:00Z", { professionalId: first }));
    await db
      .insert(appointments)
      .values(appointmentAt("2031-05-06T13:00Z", { professionalId: second }));

    const error = await insertError(
      appointmentAt("2031-05-06T13:30Z", { professionalId: second }),
    );
    expect(isAppointmentOverlapError(error)).toBe(true);
  });

  it("an appointment cannot use another clinic's professional", async () => {
    const [foreign] = await db
      .select({ id: professionals.id })
      .from(professionals)
      .where(eq(professionals.clinicId, clinicB))
      .limit(1);
    const error = await insertError(
      appointmentAt("2031-05-06T13:00Z", { professionalId: foreign!.id }),
    );
    expect(findPgError(error)?.constraint).toBe("appointments_professional_fk");
  });

  it("the panel sees and changes only its own clinic's team", async () => {
    const own = await withClinic(panelDb, CLINIC, (tx) =>
      tx.select({ clinicId: professionals.clinicId }).from(professionals),
    );
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((row) => row.clinicId === CLINIC)).toBe(true);

    await expect(
      withClinic(panelDb, CLINIC, (tx) =>
        tx.insert(professionals).values({ clinicId: clinicB, name: "Intrusa" }),
      ),
    ).rejects.toThrow();
    await expect(
      withClinic(panelDb, CLINIC, (tx) =>
        tx.delete(professionals).where(eq(professionals.id, first)),
      ),
    ).rejects.toThrow();
  });

  it("a client reads only the active professionals of her clinic, without the registration", async () => {
    const hidden = await addProfessional(CLINIC, "Inativa");
    await db
      .update(professionals)
      .set({ isActive: false })
      .where(eq(professionals.id, hidden));
    const visible = await withClinic(clientDb, CLINIC, (tx) =>
      tx
        .select({ id: professionals.id, clinicId: professionals.clinicId })
        .from(professionals),
    );
    expect(visible.map((row) => row.id)).toEqual([first]);

    await expect(
      withClinic(clientDb, CLINIC, (tx) =>
        tx
          .select({ registration: professionals.registration })
          .from(professionals),
      ),
    ).rejects.toThrow();
  });

  it("busy intervals of one professional leave out the others' appointments", async () => {
    await db
      .update(clinics)
      .set({ onlineBookingChoice: true })
      .where(eq(clinics.id, CLINIC));
    const second = await addProfessional(CLINIC, "Bia");
    await db
      .insert(appointments)
      .values(appointmentAt("2031-05-06T13:00Z", { professionalId: first }));
    await db
      .insert(appointments)
      .values(appointmentAt("2031-05-06T15:00Z", { professionalId: second }));
    await db.insert(timeBlocks).values({
      clinicId: CLINIC,
      type: "other",
      startsAt: new Date("2031-05-06T18:00Z"),
      endsAt: new Date("2031-05-06T19:00Z"),
    });

    const busy = async (professionalId: string) => {
      const result = await clientDb.execute<{
        starts_at: string;
        ends_at: string;
      }>(
        sql`select * from client_busy_intervals(${CLINIC}::uuid, ${professionalId}::uuid, ${"2031-05-06T00:00:00Z"}::timestamptz, ${"2031-05-07T00:00:00Z"}::timestamptz)`,
      );
      return result.rows.map((row) => new Date(row.starts_at).toISOString());
    };
    expect(await busy(first)).toEqual([
      "2031-05-06T13:00:00.000Z",
      "2031-05-06T18:00:00.000Z",
    ]);
    expect(await busy(second)).toEqual([
      "2031-05-06T15:00:00.000Z",
      "2031-05-06T18:00:00.000Z",
    ]);
  });
});
