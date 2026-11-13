import { and, eq, inArray, like, sql } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { db, endPools } from "@/db/owner";
import { asClient } from "@/db/client";
import {
  appointmentServices,
  appointments,
  auditLogs,
  businessHours,
  clinics,
  patients,
  professionals,
  serviceCategories,
  services,
  timeBlocks,
  users,
} from "@/db/schema";
import {
  getAppointment,
  listAppointmentsInRange,
  updateAppointment,
} from "@/modules/appointments/appointments";
import {
  bookOnline,
  type BookingContext,
  listBookableServices,
  listDaysWithSlots,
  listFreeSlots,
  listMyAppointments,
} from "@/modules/booking/booking";
import { registerClientPatient } from "@/modules/clients/context";
import { getAppointmentBilling } from "@/modules/finance/receipts";

import { defaultProfessional, otherClinic } from "../helpers/clinic";

// A hook that runs, on the owner connection, right after bookOnline has read
// the busy intervals (its last read before the insert): a way to change the
// agenda between the checks and the insert, like a concurrent owner edit.
const hooks = vi.hoisted(() => ({
  afterBusyRead: null as null | (() => Promise<void>),
}));

vi.mock("@/db/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/db/client")>();
  const sqlText = (query: unknown) =>
    ((query as { queryChunks?: { value?: string[] }[] })?.queryChunks ?? [])
      .map((chunk) => chunk?.value?.join?.("") ?? "")
      .join("");
  return {
    ...original,
    asClient: ((ctx, fn) =>
      original.asClient(ctx, (tx) =>
        fn(
          new Proxy(tx, {
            get(target, key, receiver) {
              if (key === "execute") {
                return async (query: Parameters<typeof target.execute>[0]) => {
                  const result = await target.execute(query);
                  const hook = hooks.afterBusyRead;
                  if (
                    hook &&
                    sqlText(query).includes("client_busy_intervals")
                  ) {
                    hooks.afterBusyRead = null;
                    await hook();
                  }
                  return result;
                };
              }
              const value = Reflect.get(target, key, receiver);
              return typeof value === "function" ? value.bind(target) : value;
            },
          }),
        ),
      )) as typeof original.asClient,
  };
});

// Online booking by clients, in a clinic of its own so that its hours and
// settings never touch other test files. Every record is fictitious. The
// e-mails end in @agendamento-online.example.test.

const DOMAIN = "@agendamento-online.example.test";
const SLUG = "clinica-agendamento-online";
// 2033-03-01 is a Tuesday. The clinic opens Monday to Friday, 09:00-12:00
// (São Paulo, -03:00).
const NOW = new Date("2033-03-01T12:00:00Z");
const MONDAY = "2033-03-07";
const TUESDAY = "2033-03-08";
const WEDNESDAY = "2033-03-09";

let clinicId: string;
let categoryId: string;
let serviceId: string;
let flexibleId: string;
const user: Record<"ana" | "bia" | "cris" | "duda", string> = {
  ana: "",
  bia: "",
  cris: "",
  duda: "",
};
const patient: Record<keyof typeof user, string> = {
  ana: "",
  bia: "",
  cris: "",
  duda: "",
};

const local = (date: string, time: string) => `${date}T${time}:00.000-03:00`;

const ctx = (
  who: keyof typeof user,
  extra: Partial<BookingContext> = {},
): BookingContext => ({
  clinicId,
  patientId: patient[who],
  userId: user[who],
  emailVerified: true,
  ...extra,
});

async function createUser(local: string) {
  const [row] = await db
    .insert(users)
    .values({
      name: `Cliente ${local}`,
      email: `${local}${DOMAIN}`,
      role: "client",
      clinicId: null,
      emailVerified: true,
    })
    .returning({ id: users.id });
  return row!.id;
}

async function setClinic(values: Partial<typeof clinics.$inferInsert>) {
  await db.update(clinics).set(values).where(eq(clinics.id, clinicId));
}

async function setService(values: Partial<typeof services.$inferInsert>) {
  await db.update(services).set(values).where(eq(services.id, serviceId));
}

const defaultClinic = {
  isActive: true,
  onlineBookingChoice: true,
  minAdvanceMinutes: 120,
  maxAdvanceDays: 60,
  slotStepMinutes: 30,
  maxActiveAppointmentsPerPhone: 2,
  timezone: "America/Sao_Paulo",
};

async function clearAgenda() {
  await db.delete(auditLogs).where(eq(auditLogs.clinicId, clinicId));
  await db.delete(appointments).where(eq(appointments.clinicId, clinicId));
  await db.delete(timeBlocks).where(eq(timeBlocks.clinicId, clinicId));
}

async function cleanup() {
  const [existing] = await db
    .select({ id: clinics.id })
    .from(clinics)
    .where(eq(clinics.slug, SLUG));
  if (existing) {
    const id = existing.id;
    await db.delete(auditLogs).where(eq(auditLogs.clinicId, id));
    await db.delete(appointments).where(eq(appointments.clinicId, id));
    await db.delete(timeBlocks).where(eq(timeBlocks.clinicId, id));
    await db.delete(businessHours).where(eq(businessHours.clinicId, id));
    await db
      .delete(patients)
      .where(
        and(
          eq(patients.clinicId, id),
          sql`${patients.pendingLinkPatientId} is not null`,
        ),
      );
    await db.delete(patients).where(eq(patients.clinicId, id));
    await db.delete(services).where(eq(services.clinicId, id));
    await db
      .delete(serviceCategories)
      .where(eq(serviceCategories.clinicId, id));
  }
  const ids = (
    await db
      .select({ id: users.id })
      .from(users)
      .where(like(users.email, `%${DOMAIN}`))
  ).map((row) => row.id);
  if (ids.length > 0) {
    await db.delete(auditLogs).where(inArray(auditLogs.actorUserId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }
}

beforeAll(async () => {
  await cleanup();
  clinicId = await otherClinic(SLUG);
  await setClinic(defaultClinic);
  await db.insert(businessHours).values(
    [1, 2, 3, 4, 5].map((weekday) => ({
      clinicId,
      weekday,
      startTime: "09:00",
      endTime: "12:00",
    })),
  );

  const [category] = await db
    .insert(serviceCategories)
    .values({
      clinicId,
      name: "Categoria agendamento online",
      slug: "categoria-agendamento-online",
    })
    .returning({ id: serviceCategories.id });
  categoryId = category!.id;
  const [service] = await db
    .insert(services)
    .values({
      clinicId,
      categoryId,
      name: "Serviço fictício agendável",
      slug: "servico-agendavel",
      durationMinutes: 60,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      priceCents: 12_000,
      priceDisplay: "fixed",
      requiresApproval: true,
      isActive: true,
      onlineBookingEnabled: true,
      preparationInstructions: "Venha sem maquiagem.",
    })
    .returning({ id: services.id });
  serviceId = service!.id;
  const [flexible] = await db
    .insert(services)
    .values({
      clinicId,
      categoryId,
      name: "Atendimento flexível fictício",
      slug: "servico-flexivel",
      durationMinutes: 60,
      isActive: true,
      isFlexible: true,
      onlineBookingEnabled: true,
    })
    .returning({ id: services.id });
  flexibleId = flexible!.id;

  for (const who of Object.keys(user) as (keyof typeof user)[]) {
    user[who] = await createUser(who);
  }
  patient.ana = await registerClientPatient({
    clinicId,
    userId: user.ana,
    name: "Ana Agendamento Online",
    phone: "+5511900003301",
    email: `ana${DOMAIN}`,
  });
  patient.bia = await registerClientPatient({
    clinicId,
    userId: user.bia,
    name: "Bia Agendamento Online",
    phone: "+5511900003302",
    email: null,
  });
  patient.cris = await registerClientPatient({
    clinicId,
    userId: user.cris,
    name: "Cris Agendamento Online",
    phone: "+5511900003303",
    email: null,
  });

  // Duda signs up with the phone of a patient the clinic already has: her
  // row is a provisional record until the owner decides.
  await db.insert(patients).values({
    clinicId,
    name: "Duda Ficha Antiga Agendamento Online",
    nameNormalized: "duda ficha antiga agendamento online",
    phone: "+5511900003304",
  });
  patient.duda = await registerClientPatient({
    clinicId,
    userId: user.duda,
    name: "Duda Agendamento Online",
    phone: "+5511900003304",
    email: null,
  });
});

beforeEach(async () => {
  hooks.afterBusyRead = null;
  // The booking functions read the server clock; only Date is faked, so the
  // database driver keeps its real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await clearAgenda();
  await setClinic(defaultClinic);
  await setService({
    isActive: true,
    onlineBookingEnabled: true,
    isFlexible: false,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
  });
});

afterAll(async () => {
  vi.useRealTimers();
  await cleanup();
  await endPools();
});

describe("online booking", () => {
  it("lists only the bookable services, with public fields", async () => {
    const list = await listBookableServices(ctx("ana"));
    expect(list).toEqual([
      {
        id: serviceId,
        name: "Serviço fictício agendável",
        description: null,
        durationMinutes: 60,
        priceCents: 12_000,
        priceDisplay: "fixed",
        preparationInstructions: "Venha sem maquiagem.",
      },
    ]);
    expect(list.map((s) => s.id)).not.toContain(flexibleId);

    await setClinic({ onlineBookingChoice: false });
    expect(await listBookableServices(ctx("ana"))).toEqual([]);
  });

  it("lists free slots and days with slots", async () => {
    expect(await listFreeSlots(ctx("ana"), [serviceId], MONDAY)).toEqual([
      local(MONDAY, "09:00"),
      local(MONDAY, "09:30"),
      local(MONDAY, "10:00"),
      local(MONDAY, "10:30"),
      local(MONDAY, "11:00"),
    ]);
    // Saturday is closed; the flexible service is never offered.
    expect(await listFreeSlots(ctx("ana"), [serviceId], "2033-03-05")).toEqual(
      [],
    );
    expect(await listFreeSlots(ctx("ana"), [flexibleId], MONDAY)).toEqual([]);

    await setClinic({ maxAdvanceDays: 9 });
    const days = await listDaysWithSlots(ctx("ana"), [serviceId], "2033-03");
    // Today 2033-03-01 (it is 09:00 local: 11:00 is still two hours ahead)
    // to 2033-03-10, weekdays only.
    expect(days).toEqual([
      "2033-03-01",
      "2033-03-02",
      "2033-03-03",
      "2033-03-04",
      "2033-03-07",
      "2033-03-08",
      "2033-03-09",
      "2033-03-10",
    ]);
    expect(await listDaysWithSlots(ctx("ana"), [serviceId], "2033-04")).toEqual(
      [],
    );
  });

  it("booking lands confirmed and online", async () => {
    const result = await bookOnline(ctx("ana"), {
      serviceIds: [serviceId],
      startsAt: local(MONDAY, "09:00"),
    });
    expect(result).toMatchObject({ ok: true });
    const id = (result as { appointmentId: string }).appointmentId;

    const events = await listAppointmentsInRange(clinicId, {
      from: new Date(local(MONDAY, "00:00")),
      to: new Date(local(TUESDAY, "00:00")),
      includeCancelled: false,
    });
    expect(events.map((e) => e.id)).toEqual([id]);
    const record = await getAppointment(clinicId, id, NOW);
    expect(record).toMatchObject({
      patientId: patient.ana,
      serviceId,
      status: "confirmed",
      source: "online",
      durationMinutes: 60,
    });
    expect(record!.startsAt.toISOString()).toBe("2033-03-07T12:00:00.000Z");

    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, id));
    expect(audit).toMatchObject({
      clinicId,
      actorType: "patient",
      actorUserId: user.ana,
      action: "appointment.created",
      entityType: "appointment",
    });

    // The slot is gone for everyone.
    expect(await listFreeSlots(ctx("bia"), [serviceId], MONDAY)).not.toContain(
      local(MONDAY, "09:00"),
    );
  });

  it("another professional's appointment leaves the default one's slot free", async () => {
    const first = await defaultProfessional(clinicId);
    const [second] = await db
      .insert(professionals)
      .values({ clinicId, name: "Segunda Profissional", sortOrder: 5 })
      .returning({ id: professionals.id });
    try {
      await db.insert(appointments).values({
        clinicId,
        patientId: patient.bia,
        professionalId: second!.id,
        serviceId,
        serviceName: "Serviço fictício",
        serviceDurationMinutes: 60,
        startsAt: new Date(local(MONDAY, "09:00")),
        endsAt: new Date(local(MONDAY, "10:00")),
        occupiedFrom: new Date(local(MONDAY, "09:00")),
        occupiedUntil: new Date(local(MONDAY, "10:00")),
        status: "confirmed",
        source: "admin",
        confirmedAt: NOW,
      });
      expect(await listFreeSlots(ctx("ana"), [serviceId], MONDAY)).toContain(
        local(MONDAY, "09:00"),
      );
      const result = await bookOnline(ctx("ana"), {
        serviceIds: [serviceId],
        startsAt: local(MONDAY, "09:00"),
      });
      expect(result).toMatchObject({ ok: true });
      const id = (result as { appointmentId: string }).appointmentId;
      expect(await getAppointment(clinicId, id, NOW)).toMatchObject({
        professionalId: first.id,
      });
    } finally {
      await clearAgenda();
      await db.delete(professionals).where(eq(professionals.id, second!.id));
    }
  });

  it("the service's own buffers apply to the new booking", async () => {
    await setService({ bufferBeforeMinutes: 10, bufferAfterMinutes: 15 });
    const first = await bookOnline(ctx("ana"), {
      serviceIds: [serviceId],
      startsAt: local(MONDAY, "10:00"),
    });
    expect(first.ok).toBe(true);
    const [row] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.clinicId, clinicId));
    expect(row!.occupiedFrom.toISOString()).toBe("2033-03-07T12:50:00.000Z");
    expect(row!.occupiedUntil.toISOString()).toBe("2033-03-07T14:15:00.000Z");

    // 09:00 would end at 10:00 plus 15 minutes; 11:00 starts 10 minutes early.
    const free = await listFreeSlots(ctx("bia"), [serviceId], MONDAY);
    expect(free).toEqual([]);
    expect(
      await bookOnline(ctx("bia"), {
        serviceIds: [serviceId],
        startsAt: local(MONDAY, "11:00"),
      }),
    ).toEqual({ ok: false, reason: "taken" });
  });

  it("two simultaneous bookings: one taken", async () => {
    const slot = { serviceIds: [serviceId], startsAt: local(TUESDAY, "10:00") };
    const results = await Promise.all([
      bookOnline(ctx("ana"), slot),
      bookOnline(ctx("bia"), slot),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, reason: "taken" },
    ]);
    const rows = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(eq(appointments.clinicId, clinicId));
    expect(rows).toHaveLength(1);
  });

  it("limit of active appointments", async () => {
    await setClinic({ maxActiveAppointmentsPerPhone: 2 });
    for (const time of ["09:00", "10:00"]) {
      const result = await bookOnline(ctx("cris"), {
        serviceIds: [serviceId],
        startsAt: local(WEDNESDAY, time),
      });
      expect(result.ok).toBe(true);
    }
    expect(
      await bookOnline(ctx("cris"), {
        serviceIds: [serviceId],
        startsAt: local(WEDNESDAY, "11:00"),
      }),
    ).toEqual({ ok: false, reason: "limit" });

    // Another client is counted on her own record.
    expect(
      (
        await bookOnline(ctx("ana"), {
          serviceIds: [serviceId],
          startsAt: local(WEDNESDAY, "11:00"),
        })
      ).ok,
    ).toBe(true);

    // A cancelled appointment no longer counts.
    await db
      .update(appointments)
      .set({
        status: "cancelled",
        cancelledAt: NOW,
        cancelledBy: "clinic",
      })
      .where(
        and(
          eq(appointments.patientId, patient.cris),
          eq(appointments.startsAt, new Date(local(WEDNESDAY, "09:00"))),
        ),
      );
    expect(
      (
        await bookOnline(ctx("cris"), {
          serviceIds: [serviceId],
          startsAt: local(TUESDAY, "09:00"),
        })
      ).ok,
    ).toBe(true);
  });

  it("online off for clinic or service", async () => {
    const slot = { serviceIds: [serviceId], startsAt: local(MONDAY, "09:00") };

    await setClinic({ onlineBookingChoice: false });
    expect(await bookOnline(ctx("ana"), slot)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(await listFreeSlots(ctx("ana"), [serviceId], MONDAY)).toEqual([]);
    expect(await listDaysWithSlots(ctx("ana"), [serviceId], "2033-03")).toEqual(
      [],
    );

    await setClinic({ onlineBookingChoice: true, isActive: false });
    expect(await bookOnline(ctx("ana"), slot)).toEqual({
      ok: false,
      reason: "unavailable",
    });

    await setClinic({ isActive: true });
    await setService({ onlineBookingEnabled: false });
    expect(await bookOnline(ctx("ana"), slot)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(await listFreeSlots(ctx("ana"), [serviceId], MONDAY)).toEqual([]);

    await setService({ onlineBookingEnabled: true, isActive: false });
    expect(await bookOnline(ctx("ana"), slot)).toEqual({
      ok: false,
      reason: "unavailable",
    });

    await setService({ isActive: true });
    expect(
      await bookOnline(ctx("ana"), { ...slot, serviceIds: [flexibleId] }),
    ).toEqual({ ok: false, reason: "unavailable" });
    expect(
      await bookOnline(ctx("ana"), { ...slot, serviceIds: ["nao-e-um-id"] }),
    ).toEqual({ ok: false, reason: "unavailable" });

    await db
      .update(serviceCategories)
      .set({ isActive: false })
      .where(eq(serviceCategories.id, categoryId));
    try {
      expect(await bookOnline(ctx("ana"), slot)).toEqual({
        ok: false,
        reason: "unavailable",
      });
    } finally {
      await db
        .update(serviceCategories)
        .set({ isActive: true })
        .where(eq(serviceCategories.id, categoryId));
    }

    const rows = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(eq(appointments.clinicId, clinicId));
    expect(rows).toEqual([]);
  });

  it("service switched off between the checks and the insert", async () => {
    hooks.afterBusyRead = () => setService({ onlineBookingEnabled: false });
    expect(
      await bookOnline(ctx("ana"), {
        serviceIds: [serviceId],
        startsAt: local(MONDAY, "09:00"),
      }),
    ).toEqual({ ok: false, reason: "unavailable" });
    expect(hooks.afterBusyRead).toBe(null);

    await setService({ onlineBookingEnabled: true });
    hooks.afterBusyRead = async () => {
      await db
        .update(serviceCategories)
        .set({ isActive: false })
        .where(eq(serviceCategories.id, categoryId));
    };
    try {
      expect(
        await bookOnline(ctx("ana"), {
          serviceIds: [serviceId],
          startsAt: local(MONDAY, "09:00"),
        }),
      ).toEqual({ ok: false, reason: "unavailable" });
      expect(hooks.afterBusyRead).toBe(null);
    } finally {
      await db
        .update(serviceCategories)
        .set({ isActive: true })
        .where(eq(serviceCategories.id, categoryId));
    }

    const rows = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(eq(appointments.clinicId, clinicId));
    expect(rows).toEqual([]);
  });

  it("unverified e-mail", async () => {
    expect(
      await bookOnline(ctx("ana", { emailVerified: false }), {
        serviceIds: [serviceId],
        startsAt: local(MONDAY, "09:00"),
      }),
    ).toEqual({ ok: false, reason: "unverified" });
  });

  it("a patient id that is not hers books nothing", async () => {
    expect(
      await bookOnline(ctx("ana", { patientId: patient.bia }), {
        serviceIds: [serviceId],
        startsAt: local(MONDAY, "09:00"),
      }),
    ).toEqual({ ok: false, reason: "unavailable" });
  });

  it("block added after listing makes confirm fail", async () => {
    const slots = await listFreeSlots(ctx("ana"), [serviceId], MONDAY);
    expect(slots).toContain(local(MONDAY, "10:00"));
    await db.insert(timeBlocks).values({
      clinicId,
      type: "other",
      title: "Bloqueio agendamento online",
      startsAt: new Date(local(MONDAY, "10:30")),
      endsAt: new Date(local(MONDAY, "11:00")),
    });
    expect(
      await bookOnline(ctx("ana"), {
        serviceIds: [serviceId],
        startsAt: local(MONDAY, "10:00"),
      }),
    ).toEqual({ ok: false, reason: "taken" });
  });

  it("hours, advance and step are checked again on confirm", async () => {
    // Off the step grid, outside hours, too soon and too far ahead.
    for (const startsAt of [
      local(MONDAY, "09:10"),
      local(MONDAY, "11:30"),
      local(MONDAY, "08:00"),
      local("2033-03-01", "10:00"),
      local("2033-05-02", "09:00"),
      "não é uma data",
    ]) {
      expect(
        await bookOnline(ctx("ana"), { serviceIds: [serviceId], startsAt }),
        startsAt,
      ).toEqual({ ok: false, reason: "taken" });
    }

    // The owner shortens the hours after the list was shown.
    expect(await listFreeSlots(ctx("ana"), [serviceId], MONDAY)).toContain(
      local(MONDAY, "11:00"),
    );
    await db
      .update(businessHours)
      .set({ endTime: "11:00" })
      .where(
        and(eq(businessHours.clinicId, clinicId), eq(businessHours.weekday, 1)),
      );
    try {
      expect(
        await bookOnline(ctx("ana"), {
          serviceIds: [serviceId],
          startsAt: local(MONDAY, "11:00"),
        }),
      ).toEqual({ ok: false, reason: "taken" });
    } finally {
      await db
        .update(businessHours)
        .set({ endTime: "12:00" })
        .where(
          and(
            eq(businessHours.clinicId, clinicId),
            eq(businessHours.weekday, 1),
          ),
        );
    }
  });

  it("requiresApproval true still books confirmed", async () => {
    const [row] = await db
      .select({ requiresApproval: services.requiresApproval })
      .from(services)
      .where(eq(services.id, serviceId));
    expect(row!.requiresApproval).toBe(true);
    const result = await bookOnline(ctx("bia"), {
      serviceIds: [serviceId],
      startsAt: local(MONDAY, "11:00"),
    });
    expect(result.ok).toBe(true);
    const [booked] = await db
      .select({
        status: appointments.status,
        confirmedAt: appointments.confirmedAt,
      })
      .from(appointments)
      .where(eq(appointments.patientId, patient.bia));
    expect(booked).toEqual({ status: "confirmed", confirmedAt: NOW });
  });

  it("a provisional record books through itself", async () => {
    const result = await bookOnline(ctx("duda"), {
      serviceIds: [serviceId],
      startsAt: local(MONDAY, "09:00"),
    });
    expect(result.ok).toBe(true);
    const [row] = await db
      .select({ patientId: appointments.patientId })
      .from(appointments)
      .where(eq(appointments.clinicId, clinicId));
    expect(row!.patientId).toBe(patient.duda);
  });

  it("my appointments: only hers, upcoming first", async () => {
    for (const [who, startsAt] of [
      ["ana", local(TUESDAY, "09:00")],
      ["ana", local(MONDAY, "09:00")],
      ["bia", local(MONDAY, "10:00")],
    ] as const) {
      expect(
        (await bookOnline(ctx(who), { serviceIds: [serviceId], startsAt })).ok,
      ).toBe(true);
    }
    const later = new Date("2033-03-07T14:00:00Z");
    vi.setSystemTime(later);
    const mine = await listMyAppointments(ctx("ana"));
    expect(mine.upcoming.map((a) => a.startsAt.toISOString())).toEqual([
      "2033-03-08T12:00:00.000Z",
    ]);
    expect(mine.past.map((a) => a.startsAt.toISOString())).toEqual([
      "2033-03-07T12:00:00.000Z",
    ]);
    expect(Object.keys(mine.upcoming[0]!).sort()).toEqual(
      ["endsAt", "id", "serviceName", "startsAt", "status"].sort(),
    );
    expect(mine.upcoming[0]).toMatchObject({
      serviceName: "Serviço fictício agendável",
      status: "confirmed",
    });
  });

  describe("several services in one visit", () => {
    let secondId: string;
    const SECOND = "Segundo serviço fictício";
    const BOTH = `Serviço fictício agendável + ${SECOND}`;

    beforeAll(async () => {
      const [second] = await db
        .insert(services)
        .values({
          clinicId,
          categoryId,
          name: SECOND,
          slug: "segundo-servico",
          durationMinutes: 30,
          bufferBeforeMinutes: 0,
          bufferAfterMinutes: 15,
          priceCents: 5_000,
          priceDisplay: "fixed",
          sortOrder: 1,
          isActive: true,
          onlineBookingEnabled: true,
        })
        .returning({ id: services.id });
      secondId = second!.id;
    });

    afterAll(async () => {
      await clearAgenda();
      await db.delete(services).where(eq(services.id, secondId));
    });

    const visitRows = (appointmentId: string) =>
      db
        .select({
          serviceId: appointmentServices.serviceId,
          serviceName: appointmentServices.serviceName,
          durationMinutes: appointmentServices.durationMinutes,
          position: appointmentServices.position,
        })
        .from(appointmentServices)
        .where(eq(appointmentServices.appointmentId, appointmentId))
        .orderBy(appointmentServices.position);

    it("free slots fit the services together", async () => {
      // 60 + 30 minutes inside 09:00-12:00: the last start is 10:30.
      expect(
        await listFreeSlots(ctx("ana"), [secondId, serviceId], MONDAY),
      ).toEqual([
        local(MONDAY, "09:00"),
        local(MONDAY, "09:30"),
        local(MONDAY, "10:00"),
        local(MONDAY, "10:30"),
      ]);
      expect(
        await listDaysWithSlots(ctx("ana"), [serviceId, secondId], "2033-03"),
      ).toContain(MONDAY);
      // One that is not bookable, the same one twice, none: no slots.
      for (const ids of [[serviceId, flexibleId], [serviceId, serviceId], []]) {
        expect(await listFreeSlots(ctx("ana"), ids, MONDAY)).toEqual([]);
      }
    });

    it("books one appointment for the whole visit", async () => {
      const result = await bookOnline(ctx("ana"), {
        // Whatever the order asked for, the clinic's order is kept.
        serviceIds: [secondId, serviceId],
        startsAt: local(MONDAY, "09:00"),
      });
      expect(result).toMatchObject({ ok: true });
      const id = (result as { appointmentId: string }).appointmentId;

      const rows = await db
        .select()
        .from(appointments)
        .where(eq(appointments.clinicId, clinicId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id,
        serviceId,
        serviceName: BOTH,
        serviceDurationMinutes: 90,
        status: "confirmed",
        source: "online",
      });
      expect(rows[0]!.endsAt.toISOString()).toBe("2033-03-07T13:30:00.000Z");
      // The widest buffer of the two after the visit.
      expect(rows[0]!.occupiedUntil.toISOString()).toBe(
        "2033-03-07T13:45:00.000Z",
      );
      expect(await visitRows(id)).toEqual([
        {
          serviceId,
          serviceName: "Serviço fictício agendável",
          durationMinutes: 60,
          position: 0,
        },
        {
          serviceId: secondId,
          serviceName: SECOND,
          durationMinutes: 30,
          position: 1,
        },
      ]);

      const [audit] = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.entityId, id));
      expect(audit!.changes).toMatchObject({
        serviceId,
        serviceIds: [serviceId, secondId],
        durationMinutes: 90,
      });

      // It counts once towards her limit and shows as one appointment.
      const mine = await listMyAppointments(ctx("ana"));
      expect(mine.upcoming).toHaveLength(1);
      expect(mine.upcoming[0]).toMatchObject({ serviceName: BOTH });
      // 10:30 plus the 15-minute buffer: the next free start is 11:00.
      expect(await listFreeSlots(ctx("bia"), [serviceId], MONDAY)).toEqual([
        local(MONDAY, "11:00"),
      ]);
      // "Receber" starts from the sum of the two prices.
      expect(await getAppointmentBilling(clinicId, id)).toMatchObject({
        servicePriceCents: 17_000,
      });
    });

    it("a single service leaves no visit rows", async () => {
      const result = await bookOnline(ctx("ana"), {
        serviceIds: [serviceId],
        startsAt: local(MONDAY, "09:00"),
      });
      const id = (result as { appointmentId: string }).appointmentId;
      expect(await visitRows(id)).toEqual([]);
      expect(await getAppointmentBilling(clinicId, id)).toMatchObject({
        servicePriceCents: 12_000,
      });
    });

    it("refuses the visit when one service cannot be booked", async () => {
      const startsAt = local(MONDAY, "09:00");
      for (const serviceIds of [
        [serviceId, flexibleId],
        [serviceId, serviceId],
        [serviceId, "nao-e-um-id"],
        [],
      ]) {
        expect(await bookOnline(ctx("ana"), { serviceIds, startsAt })).toEqual({
          ok: false,
          reason: "unavailable",
        });
      }
      // The two do not fit before closing at 12:00.
      expect(
        await bookOnline(ctx("ana"), {
          serviceIds: [serviceId, secondId],
          startsAt: local(MONDAY, "11:00"),
        }),
      ).toEqual({ ok: false, reason: "taken" });
      expect(
        await db
          .select({ id: appointments.id })
          .from(appointments)
          .where(eq(appointments.clinicId, clinicId)),
      ).toEqual([]);
    });

    it("she cannot add services to an appointment afterwards", async () => {
      const result = await bookOnline(ctx("ana"), {
        serviceIds: [serviceId],
        startsAt: local(MONDAY, "09:00"),
      });
      const id = (result as { appointmentId: string }).appointmentId;
      const { clinicId: clinic, patientId, userId } = ctx("ana");
      await expect(
        asClient({ clinicId: clinic, patientId, userId }, (tx) =>
          tx.insert(appointmentServices).values({
            clinicId,
            appointmentId: id,
            serviceId: secondId,
            serviceName: SECOND,
            durationMinutes: 30,
            position: 1,
          }),
        ),
      ).rejects.toThrow();
      expect(await visitRows(id)).toEqual([]);
    });

    it("the panel changing the service makes it a single-service one", async () => {
      const result = await bookOnline(ctx("ana"), {
        serviceIds: [serviceId, secondId],
        startsAt: local(MONDAY, "09:00"),
      });
      const id = (result as { appointmentId: string }).appointmentId;
      const record = (await getAppointment(clinicId, id, NOW))!;
      const values = {
        patientId: record.patientId,
        serviceId: record.serviceId,
        professionalId: null,
        customLabel: null,
        startsAt: new Date(local(MONDAY, "09:30")),
        endsAt: new Date(local(MONDAY, "11:00")),
        durationMinutes: 90,
        idempotencyKey: id,
        acknowledgeWarnings: true,
      };
      // Moving it keeps the visit as it was booked.
      expect(
        await updateAppointment(clinicId, id, values, user.ana, NOW),
      ).toEqual({ ok: true, id });
      expect(await visitRows(id)).toHaveLength(2);
      expect((await getAppointment(clinicId, id, NOW))!.serviceName).toBe(BOTH);

      expect(
        await updateAppointment(
          clinicId,
          id,
          { ...values, serviceId: secondId },
          user.ana,
          NOW,
        ),
      ).toEqual({ ok: true, id });
      expect(await visitRows(id)).toEqual([]);
      expect((await getAppointment(clinicId, id, NOW))!.serviceName).toBe(
        SECOND,
      );
    });
  });
});
