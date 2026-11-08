import { and, eq, isNotNull } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/owner";
import {
  appointments,
  businessHours,
  patients,
  serviceCategories,
  services,
  timeBlocks,
} from "@/db/schema";
import {
  getDayAgenda,
  getPanelHome,
  getWeekMarks,
} from "@/modules/dashboard/dashboard";

import { otherClinic } from "../helpers/clinic";

// The panel's day data, in clinics of their own. Every record is fictitious.

const SLUG = "painel-dia-teste";
const OTHER_SLUG = "painel-dia-outra";
const ZONE = "America/Sao_Paulo";

let clinicId: string;
let otherId: string;
let serviceId: string;
let freeServiceId: string;
let otherServiceId: string;
const ids: Record<string, string> = {};

const at = (date: string, time: string) => new Date(`${date}T${time}:00-03:00`);

async function wipe(clinic: string) {
  await db
    .delete(patients)
    .where(
      and(
        eq(patients.clinicId, clinic),
        isNotNull(patients.pendingLinkPatientId),
      ),
    );
  await db.delete(appointments).where(eq(appointments.clinicId, clinic));
  await db.delete(timeBlocks).where(eq(timeBlocks.clinicId, clinic));
  await db.delete(businessHours).where(eq(businessHours.clinicId, clinic));
  await db.delete(patients).where(eq(patients.clinicId, clinic));
  await db.delete(services).where(eq(services.clinicId, clinic));
  await db
    .delete(serviceCategories)
    .where(eq(serviceCategories.clinicId, clinic));
}

async function seedService(
  clinic: string,
  categoryId: string,
  slug: string,
  priceCents: number | null,
) {
  const [row] = await db
    .insert(services)
    .values({
      clinicId: clinic,
      categoryId,
      name: `Serviço ${slug}`,
      slug,
      durationMinutes: 60,
      isActive: true,
      priceCents,
    })
    .returning({ id: services.id });
  return row!.id;
}

async function seedAppointment(input: {
  clinic: string;
  patientId: string;
  serviceId: string;
  start: string;
  end: string;
  status: "requested" | "confirmed" | "cancelled" | "completed" | "no_show";
  source?: "online" | "admin";
}) {
  const startsAt = new Date(input.start);
  const endsAt = new Date(input.end);
  const cancelled = input.status === "cancelled";
  const [row] = await db
    .insert(appointments)
    .values({
      clinicId: input.clinic,
      patientId: input.patientId,
      serviceId: input.serviceId,
      serviceName: "Serviço fictício",
      serviceDurationMinutes: 60,
      startsAt,
      endsAt,
      occupiedFrom: startsAt,
      occupiedUntil: endsAt,
      status: input.status,
      source: input.source ?? "admin",
      confirmedAt: input.status === "requested" ? null : startsAt,
      cancelledAt: cancelled ? startsAt : null,
      cancelledBy: cancelled ? "clinic" : null,
      cancellationReason: cancelled ? "other" : null,
    })
    .returning({ id: appointments.id });
  return row!.id;
}

beforeAll(async () => {
  clinicId = await otherClinic(SLUG);
  otherId = await otherClinic(OTHER_SLUG);
  await wipe(clinicId);
  await wipe(otherId);

  const [category] = await db
    .insert(serviceCategories)
    .values({ clinicId, name: "Categoria painel", slug: "categoria-painel" })
    .returning({ id: serviceCategories.id });
  const [otherCategory] = await db
    .insert(serviceCategories)
    .values({ clinicId: otherId, name: "Categoria outra", slug: "categoria" })
    .returning({ id: serviceCategories.id });
  serviceId = await seedService(clinicId, category!.id, "priced", 15000);
  freeServiceId = await seedService(clinicId, category!.id, "unpriced", null);
  otherServiceId = await seedService(otherId, otherCategory!.id, "outro", 9900);

  const [maria, ana, existing, provisional, stranger] = await db
    .insert(patients)
    .values([
      {
        clinicId,
        name: "Maria Painel",
        nameNormalized: "maria painel",
        phone: "+5500000007001",
      },
      {
        clinicId,
        name: "Nome Real Anonimizada",
        anonymizedAt: new Date(),
      },
      {
        clinicId,
        name: "Helena Antiga",
        nameNormalized: "helena antiga",
        phone: "+5500000007003",
      },
      {
        clinicId,
        name: "Helena Online",
        nameNormalized: "helena online",
        phone: "+5500000007004",
      },
      {
        clinicId: otherId,
        name: "Outra Clínica Paciente",
        nameNormalized: "outra clinica paciente",
        phone: "+5500000007005",
      },
    ])
    .returning({ id: patients.id });
  await db
    .update(patients)
    .set({ pendingLinkPatientId: existing!.id })
    .where(eq(patients.id, provisional!.id));

  // Tuesday 08:00-12:00 and 14:00-18:00 (lunch between); Wednesday 08:00-18:00.
  await db.insert(businessHours).values([
    { clinicId, weekday: 2, startTime: "08:00", endTime: "12:00" },
    { clinicId, weekday: 2, startTime: "14:00", endTime: "18:00" },
    { clinicId, weekday: 3, startTime: "08:00", endTime: "18:00" },
  ]);
  await db.insert(timeBlocks).values({
    clinicId,
    type: "day_off",
    title: "Reunião fictícia",
    startsAt: at("2026-11-10", "16:30"),
    endsAt: at("2026-11-10", "17:00"),
  });

  // Tuesday 2026-11-10 (São Paulo is UTC-3).
  ids.first = await seedAppointment({
    clinic: clinicId,
    patientId: maria!.id,
    serviceId,
    start: "2026-11-10T09:00:00-03:00",
    end: "2026-11-10T10:00:00-03:00",
    status: "confirmed",
    source: "online",
  });
  ids.cancelled = await seedAppointment({
    clinic: clinicId,
    patientId: maria!.id,
    serviceId: freeServiceId,
    start: "2026-11-10T10:00:00-03:00",
    end: "2026-11-10T10:30:00-03:00",
    status: "cancelled",
  });
  ids.anonymized = await seedAppointment({
    clinic: clinicId,
    patientId: ana!.id,
    serviceId: freeServiceId,
    start: "2026-11-10T15:00:00-03:00",
    end: "2026-11-10T16:00:00-03:00",
    status: "confirmed",
  });
  // Wednesday: a requested one; Thursday: only a cancelled one.
  ids.wednesday = await seedAppointment({
    clinic: clinicId,
    patientId: maria!.id,
    serviceId,
    start: "2026-11-11T10:00:00-03:00",
    end: "2026-11-11T11:00:00-03:00",
    status: "requested",
    source: "online",
  });
  await seedAppointment({
    clinic: clinicId,
    patientId: maria!.id,
    serviceId,
    start: "2026-11-12T10:00:00-03:00",
    end: "2026-11-12T11:00:00-03:00",
    status: "cancelled",
  });
  // Another clinic, same Tuesday.
  ids.stranger = await seedAppointment({
    clinic: otherId,
    patientId: stranger!.id,
    serviceId: otherServiceId,
    start: "2026-11-10T11:00:00-03:00",
    end: "2026-11-10T12:00:00-03:00",
    status: "confirmed",
  });
});

afterAll(async () => {
  await wipe(clinicId);
  await wipe(otherId);
  await endPools();
});

const hhmm = (d: Date) =>
  d.toLocaleTimeString("pt-BR", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });

describe("getDayAgenda", () => {
  const NOW = new Date("2026-11-10T09:00:00Z"); // 06:00 local

  it("lists every status in order with the service price", async () => {
    const day = await getDayAgenda(clinicId, "2026-11-10", NOW);
    expect(day.zone).toBe(ZONE);
    expect(day.closed).toBe(false);
    expect(day.items.map((i) => i.id)).toEqual([
      ids.first,
      ids.cancelled,
      ids.anonymized,
    ]);
    expect(day.items[0]).toMatchObject({
      status: "confirmed",
      online: true,
      priceCents: 15000,
      patientName: "Maria Painel",
      patientPhone: "+5500000007001",
      durationMinutes: 60,
    });
    expect(day.items[1]).toMatchObject({
      status: "cancelled",
      priceCents: null,
    });
    expect(day.blocks).toEqual([{ title: "Reunião fictícia", allDay: false }]);
  });

  it("computes free time without appointments, lunch or blocks", async () => {
    const day = await getDayAgenda(clinicId, "2026-11-10", NOW);
    expect(day.free.map((f) => `${hhmm(f.start)}-${hhmm(f.end)}`)).toEqual([
      "08:00-09:00",
      "10:00-12:00",
      "14:00-15:00",
      "16:00-16:30",
      "17:00-18:00",
    ]);
  });

  it("anonymizes the patient name and hides the phone", async () => {
    const day = await getDayAgenda(clinicId, "2026-11-10", NOW);
    const item = day.items.find((i) => i.id === ids.anonymized)!;
    expect(item.patientName).toBe("Paciente anonimizada");
    expect(item.patientPhone).toBeNull();
  });

  it("reports a weekday without hours as closed", async () => {
    const day = await getDayAgenda(clinicId, "2026-11-09", NOW); // Monday
    expect(day.closed).toBe(true);
    expect(day.free).toEqual([]);
  });

  it("never shows another clinic's appointments", async () => {
    const day = await getDayAgenda(clinicId, "2026-11-10", NOW);
    expect(day.items.map((i) => i.id)).not.toContain(ids.stranger);
    const other = await getDayAgenda(otherId, "2026-11-10", NOW);
    expect(other.items.map((i) => i.id)).toEqual([ids.stranger]);
  });
});

describe("getWeekMarks", () => {
  it("marks only days with non-cancelled appointments", async () => {
    expect(await getWeekMarks(clinicId, "2026-11-10", 4)).toEqual([
      "2026-11-10",
      "2026-11-11",
    ]);
  });
});

describe("getPanelHome", () => {
  it("picks the next appointment before the first one", async () => {
    const home = await getPanelHome(clinicId, new Date("2026-11-10T09:00:00Z"));
    expect(home.today.date).toBe("2026-11-10");
    expect(home.next?.id).toBe(ids.first);
    expect(home.nextDayFirst).toBeNull();
    expect(home.summary).toMatchObject({ count: 2, online: 1 });
    // One priced and one unpriced counted: partial.
    expect(home.summary.previsto).toEqual({ cents: 15000, partial: true });
    // One pending link plus one requested appointment from now.
    expect(home.alerts).toBe(2);
  });

  it("falls back to the next day's first once today is over", async () => {
    const home = await getPanelHome(clinicId, new Date("2026-11-10T22:00:00Z"));
    expect(home.next).toBeNull();
    expect(home.nextDayFirst?.id).toBe(ids.wednesday);
  });
});
