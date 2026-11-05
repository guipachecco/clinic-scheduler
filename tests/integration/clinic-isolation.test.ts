import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { currentDbUser, db, endPools, inClinic, type Tx } from "@/db/client";
import { appointments, patients, users } from "@/db/schema";
import {
  createAppointment,
  getAppointment,
  listAppointmentsInRange,
} from "@/modules/appointments/appointments";
import { appointmentFormSchema } from "@/modules/appointments/fields";
import {
  createPatient,
  getPatient,
  searchPatients,
  updatePatient,
} from "@/modules/patients/patients";
import { patientFormSchema } from "@/modules/patients/fields";
import {
  createCategory,
  createService,
  listCatalog,
} from "@/modules/services/services";
import { serviceFormSchema } from "@/modules/services/fields";
import { categoryFormSchema } from "@/modules/services/fields";
import {
  getBusinessHours,
  saveBusinessHours,
} from "@/modules/schedule/schedule";

import { CLINIC, otherClinic } from "../helpers/clinic";

// Every inClinic call the modules make also records the database user its
// transaction runs as.
const seenDbUsers = vi.hoisted(() => [] as string[]);
vi.mock("@/db/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/client")>();
  return {
    ...actual,
    inClinic: <T>(clinicId: string, fn: (tx: Tx) => Promise<T>) =>
      actual.inClinic(clinicId, async (tx) => {
        const result = await tx.execute<{ current_user: string }>(
          sql`select current_user`,
        );
        seenDbUsers.push(result.rows[0]!.current_user);
        return fn(tx);
      }),
  };
});

// Every record here is fictitious and exists only during the test. Two
// clinics, A (the first clinic) and B, share the database; each one must only
// ever see and change its own rows.

const NOW = new Date("2026-11-03T12:00:00Z");

let clinicB: string;
let actorA: string;
let actorB: string;

function patientValues(name: string, phone: string) {
  return patientFormSchema.parse({
    name,
    nickname: "",
    cpf: "",
    rg: "",
    phone,
    landlinePhone: "",
    email: "",
    birthDate: "1990-05-10",
    gender: "",
    referralSource: "",
    referredBy: "",
    notes: "",
  });
}

async function serviceIn(clinicId: string, actor: string, name: string) {
  const category = await createCategory(
    clinicId,
    categoryFormSchema.parse({
      name: `Categoria ${name}`,
      sortOrder: "0",
      isActive: true,
    }),
    actor,
  );
  if (!category.ok) throw new Error("category");
  const service = await createService(
    clinicId,
    serviceFormSchema.parse({
      categoryId: category.id,
      name,
      description: "",
      durationMinutes: "60",
      bufferBeforeMinutes: "0",
      bufferAfterMinutes: "0",
      price: "",
      priceDisplay: "hidden",
      requiresApproval: false,
      onlineBookingEnabled: false,
      preparationInstructions: "",
      isActive: true,
      sortOrder: "0",
    }),
    actor,
  );
  if (!service.ok) throw new Error(JSON.stringify(service));
  return service.id;
}

async function patientIn(clinicId: string, actor: string, name: string) {
  const result = await createPatient(
    clinicId,
    patientValues(name, "(48) 99999-1234"),
    actor,
  );
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.id;
}

function appointmentForm(patientId: string, serviceId: string) {
  return appointmentFormSchema.parse({
    patientId,
    serviceId,
    customLabel: "",
    date: "2026-11-10",
    startTime: "10:00",
    durationMinutes: "60",
    acknowledgeWarnings: true,
    idempotencyKey: crypto.randomUUID(),
  });
}

beforeEach(async () => {
  await db.execute(
    sql`truncate table audit_logs, time_blocks, business_hours, appointments, patients, services, service_categories, users cascade`,
  );
  clinicB = await otherClinic();
  const [a] = await db
    .insert(users)
    .values({
      name: "A",
      email: "a@example.com",
      role: "admin",
      clinicId: CLINIC,
    })
    .returning({ id: users.id });
  const [b] = await db
    .insert(users)
    .values({
      name: "B",
      email: "b@example.com",
      role: "admin",
      clinicId: clinicB,
    })
    .returning({ id: users.id });
  actorA = a!.id;
  actorB = b!.id;
});

afterAll(async () => {
  await endPools();
});

describe("database user", () => {
  it("module calls run as app_panel", async () => {
    expect(await currentDbUser(CLINIC)).toBe("app_panel");

    seenDbUsers.length = 0;
    await patientIn(CLINIC, actorA, "Hana Fictícia");
    await searchPatients(CLINIC, { term: "hana" });
    await listCatalog(CLINIC);
    await getBusinessHours(CLINIC);
    expect(seenDbUsers.length).toBeGreaterThanOrEqual(4);
    expect(new Set(seenDbUsers)).toEqual(new Set(["app_panel"]));
  });

  it("a module cannot read another clinic even with a forged id filter", async () => {
    await patientIn(clinicB, actorB, "Iris Fictícia");
    const rows = await inClinic(CLINIC, (tx) =>
      tx.select().from(patients).where(eq(patients.clinicId, clinicB)),
    );
    expect(rows).toEqual([]);
  });
});

describe("patients", () => {
  it("lets the same person exist in two clinics", async () => {
    await patientIn(CLINIC, actorA, "Ana Fictícia");
    await expect(
      patientIn(clinicB, actorB, "Ana Fictícia"),
    ).resolves.toBeTruthy();
  });

  it("never reads or updates a patient of another clinic", async () => {
    const id = await patientIn(clinicB, actorB, "Bia Fictícia");

    expect(await getPatient(CLINIC, id)).toBeNull();
    expect((await searchPatients(CLINIC, { term: "bia" })).items).toEqual([]);
    expect((await searchPatients(clinicB, { term: "bia" })).items).toHaveLength(
      1,
    );

    const result = await updatePatient(
      CLINIC,
      id,
      patientValues("Nome trocado", "(48) 99999-1234"),
      actorA,
    );
    expect(result).toEqual({ ok: false, fieldErrors: {} });
    expect((await getPatient(clinicB, id))?.name).toBe("Bia Fictícia");
  });
});

describe("services", () => {
  it("keeps each catalog to its clinic", async () => {
    await serviceIn(CLINIC, actorA, "Massagem");
    await serviceIn(clinicB, actorB, "Massagem");

    const namesA = (await listCatalog(CLINIC)).flatMap((c) =>
      c.services.map((s) => s.name),
    );
    const namesB = (await listCatalog(clinicB)).flatMap((c) =>
      c.services.map((s) => s.name),
    );
    expect(namesA).toEqual(["Massagem"]);
    expect(namesB).toEqual(["Massagem"]);
  });
});

describe("appointments", () => {
  it("refuses a patient or service of another clinic", async () => {
    const serviceA = await serviceIn(CLINIC, actorA, "Serviço A");
    const patientB = await patientIn(clinicB, actorB, "Carla Fictícia");
    const serviceB = await serviceIn(clinicB, actorB, "Serviço B");
    const patientA = await patientIn(CLINIC, actorA, "Dora Fictícia");

    const withOtherPatient = await createAppointment(
      CLINIC,
      appointmentForm(patientB, serviceA),
      actorA,
      NOW,
    );
    expect(withOtherPatient.ok).toBe(false);

    const withOtherService = await createAppointment(
      CLINIC,
      appointmentForm(patientA, serviceB),
      actorA,
      NOW,
    );
    expect(withOtherService.ok).toBe(false);
    expect(await db.select().from(appointments)).toEqual([]);
  });

  it("lets two clinics book the same time, and hides each other's agenda", async () => {
    const serviceA = await serviceIn(CLINIC, actorA, "Serviço A");
    const patientA = await patientIn(CLINIC, actorA, "Eva Fictícia");
    const serviceB = await serviceIn(clinicB, actorB, "Serviço B");
    const patientB = await patientIn(clinicB, actorB, "Fabi Fictícia");

    const a = await createAppointment(
      CLINIC,
      appointmentForm(patientA, serviceA),
      actorA,
      NOW,
    );
    const b = await createAppointment(
      clinicB,
      appointmentForm(patientB, serviceB),
      actorB,
      NOW,
    );
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    expect(await getAppointment(CLINIC, b.id)).toBeNull();
    const range = {
      from: new Date("2026-11-10T00:00:00Z"),
      to: new Date("2026-11-11T00:00:00Z"),
      includeCancelled: true,
    };
    expect(
      (await listAppointmentsInRange(CLINIC, range)).map((e) => e.id),
    ).toEqual([a.id]);
    expect(
      (await listAppointmentsInRange(clinicB, range)).map((e) => e.id),
    ).toEqual([b.id]);
  });

  it("refuses at the database a row that mixes clinics", async () => {
    const serviceA = await serviceIn(CLINIC, actorA, "Serviço A");
    const patientB = await patientIn(clinicB, actorB, "Gabi Fictícia");
    await expect(
      db.insert(appointments).values({
        clinicId: CLINIC,
        patientId: patientB,
        serviceId: serviceA,
        serviceName: "Serviço A",
        serviceDurationMinutes: 60,
        startsAt: new Date("2030-01-01T13:00:00Z"),
        endsAt: new Date("2030-01-01T14:00:00Z"),
        occupiedFrom: new Date("2030-01-01T13:00:00Z"),
        occupiedUntil: new Date("2030-01-01T14:00:00Z"),
        status: "confirmed",
        source: "admin",
      }),
    ).rejects.toThrow();
  });
});

describe("business hours", () => {
  it("saves each clinic's week without touching the other", async () => {
    await saveBusinessHours(
      CLINIC,
      { days: [{ weekday: 1, intervals: [{ start: "08:00", end: "12:00" }] }] },
      actorA,
    );
    await saveBusinessHours(
      clinicB,
      { days: [{ weekday: 2, intervals: [{ start: "13:00", end: "18:00" }] }] },
      actorB,
    );
    const weekA = await getBusinessHours(CLINIC);
    const weekB = await getBusinessHours(clinicB);
    expect(weekA[1]!.intervals).toEqual([{ start: "08:00", end: "12:00" }]);
    expect(weekA[2]!.intervals).toEqual([]);
    expect(weekB[2]!.intervals).toEqual([{ start: "13:00", end: "18:00" }]);
    expect(weekB[1]!.intervals).toEqual([]);
  });
});
