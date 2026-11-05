import { and, eq, inArray, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db, endPools, inClinic } from "@/db/client";
import { findPgError } from "@/db/errors";
import {
  appointments,
  auditLogs,
  patients,
  serviceCategories,
  services,
  users,
} from "@/db/schema";
import { listMyAppointments } from "@/modules/booking/booking";
import {
  getClientContext,
  registerClientPatient,
} from "@/modules/clients/context";
import {
  confirmLink,
  listPendingLinks,
  rejectLink,
} from "@/modules/patients/links";

import { otherClinic } from "../helpers/clinic";

// The owner's answer to a provisional record from an online signup: "É a
// mesma" merges it into the existing patient, "Não é" keeps both. In a clinic
// of its own; every record is fictitious and the e-mails end in
// @fichas-online.example.test.

const DOMAIN = "@fichas-online.example.test";
const SLUG = "clinica-fichas-online";
const PHONE = "+5511900004401";
const EXISTING_NAME = "Helena Ficha Antiga";
const ONLINE_NAME = "Helena Cadastro Online";

let clinicId: string;
let secondClinicId: string;
let serviceId: string;
let ownerId: string;

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

async function createExisting(name = EXISTING_NAME, phone = PHONE) {
  const [row] = await db
    .insert(patients)
    .values({
      clinicId,
      name,
      nameNormalized: name.toLowerCase(),
      phone,
    })
    .returning({ id: patients.id });
  return row!.id;
}

let appointmentDay = 0;
async function createAppointment(patientId: string) {
  // One distinct future day per appointment: no overlap between them.
  appointmentDay += 1;
  const startsAt = new Date(Date.UTC(2034, 0, appointmentDay, 13));
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const [row] = await db
    .insert(appointments)
    .values({
      clinicId,
      patientId,
      serviceId,
      serviceName: "Serviço fictício das fichas",
      serviceDurationMinutes: 60,
      startsAt,
      endsAt,
      occupiedFrom: startsAt,
      occupiedUntil: endsAt,
      status: "confirmed",
      source: "online",
      confirmedAt: startsAt,
    })
    .returning({ id: appointments.id });
  return row!.id;
}

// An existing patient with one old appointment, and a client who signed up
// online with the same phone: her provisional record has one appointment.
async function scenario(onlineName = ONLINE_NAME) {
  const existingId = await createExisting();
  const oldAppointment = await createAppointment(existingId);
  const userId = await createUser(`cliente-${appointmentDay}`);
  const provisionalId = await registerClientPatient({
    clinicId,
    userId,
    name: onlineName,
    phone: PHONE,
    email: null,
  });
  const onlineAppointment = await createAppointment(provisionalId);
  return {
    existingId,
    provisionalId,
    userId,
    oldAppointment,
    onlineAppointment,
  };
}

async function patientRow(id: string) {
  const [row] = await db
    .select({
      id: patients.id,
      userId: patients.userId,
      pendingLinkPatientId: patients.pendingLinkPatientId,
    })
    .from(patients)
    .where(eq(patients.id, id));
  return row ?? null;
}

async function clearClinic(id: string) {
  await db.delete(auditLogs).where(eq(auditLogs.clinicId, id));
  await db.delete(appointments).where(eq(appointments.clinicId, id));
  await db
    .delete(patients)
    .where(
      and(
        eq(patients.clinicId, id),
        sql`${patients.pendingLinkPatientId} is not null`,
      ),
    );
  await db.delete(patients).where(eq(patients.clinicId, id));
}

async function cleanup() {
  for (const id of [clinicId, secondClinicId].filter(Boolean)) {
    await clearClinic(id);
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
  clinicId = await otherClinic(SLUG);
  secondClinicId = await otherClinic("clinica-fichas-online-2");
  await cleanup();
  await db.delete(services).where(eq(services.clinicId, clinicId));
  await db
    .delete(serviceCategories)
    .where(eq(serviceCategories.clinicId, clinicId));
  const [category] = await db
    .insert(serviceCategories)
    .values({ clinicId, name: "Categoria fichas", slug: "categoria-fichas" })
    .returning({ id: serviceCategories.id });
  const [service] = await db
    .insert(services)
    .values({
      clinicId,
      categoryId: category!.id,
      name: "Serviço fictício das fichas",
      slug: "servico-fichas",
      durationMinutes: 60,
      isActive: true,
      onlineBookingEnabled: true,
    })
    .returning({ id: services.id });
  serviceId = service!.id;
  // The owner who answers: an admin of the clinic.
  const [owner] = await db
    .insert(users)
    .values({
      name: "Dona das Fichas",
      email: `dona${DOMAIN}`,
      role: "admin",
      clinicId,
      emailVerified: true,
    })
    .returning({ id: users.id });
  ownerId = owner!.id;
});

beforeEach(async () => {
  await clearClinic(clinicId);
  await clearClinic(secondClinicId);
});

afterAll(async () => {
  await cleanup();
  await db.delete(services).where(eq(services.clinicId, clinicId));
  await db
    .delete(serviceCategories)
    .where(eq(serviceCategories.clinicId, clinicId));
  await endPools();
});

describe("pending links", () => {
  it("lists the provisional record and the patient it matched", async () => {
    const { existingId, provisionalId } = await scenario();
    const list = await listPendingLinks(clinicId);
    expect(list).toEqual([
      {
        provisionalId,
        provisionalName: ONLINE_NAME,
        existingId,
        existingName: EXISTING_NAME,
        existingHasAccount: false,
        createdAt: expect.any(Date),
      },
    ]);
    expect(await listPendingLinks(secondClinicId)).toEqual([]);
  });

  it("confirm merges appointments and links the account", async () => {
    const s = await scenario();
    // Before the owner decides, the client sees only her online booking.
    const before = await getClientContext(SLUG, s.userId);
    expect(before).toMatchObject({
      patientId: s.provisionalId,
      pending: true,
    });

    // An owner edit of the provisional record: its history moves too.
    await db.insert(auditLogs).values({
      clinicId,
      actorType: "admin",
      actorUserId: ownerId,
      action: "patient.updated",
      entityType: "patient",
      entityId: s.provisionalId,
    });

    expect(await confirmLink(clinicId, s.provisionalId, ownerId)).toEqual({
      ok: true,
    });

    expect(await patientRow(s.provisionalId)).toBeNull();
    expect(await patientRow(s.existingId)).toEqual({
      id: s.existingId,
      userId: s.userId,
      pendingLinkPatientId: null,
    });
    const moved = await db
      .select({ id: appointments.id, patientId: appointments.patientId })
      .from(appointments)
      .where(eq(appointments.clinicId, clinicId));
    expect(moved).toHaveLength(2);
    expect(moved.every((row) => row.patientId === s.existingId)).toBe(true);

    const history = await db
      .select({ action: auditLogs.action, entityId: auditLogs.entityId })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.clinicId, clinicId),
          eq(auditLogs.entityType, "patient"),
        ),
      );
    expect(history).toEqual(
      expect.arrayContaining([
        { action: "patient.updated", entityId: s.existingId },
        { action: "patient.link_confirmed", entityId: s.existingId },
      ]),
    );
    expect(history.some((row) => row.entityId === s.provisionalId)).toBe(false);

    // The client now books as the existing patient and sees both bookings.
    const after = await getClientContext(SLUG, s.userId);
    expect(after).toMatchObject({ patientId: s.existingId, pending: false });
    const mine = await listMyAppointments({
      clinicId,
      patientId: s.existingId,
      userId: s.userId,
      emailVerified: true,
    });
    expect(mine.upcoming.map((row) => row.id).sort()).toEqual(
      [s.oldAppointment, s.onlineAppointment].sort(),
    );
    expect(await listPendingLinks(clinicId)).toEqual([]);
  });

  it("reject keeps both records", async () => {
    const s = await scenario();
    expect(await rejectLink(clinicId, s.provisionalId, ownerId)).toEqual({
      ok: true,
    });

    expect(await patientRow(s.provisionalId)).toEqual({
      id: s.provisionalId,
      userId: s.userId,
      pendingLinkPatientId: null,
    });
    expect(await patientRow(s.existingId)).toEqual({
      id: s.existingId,
      userId: null,
      pendingLinkPatientId: null,
    });
    const [old] = await db
      .select({ patientId: appointments.patientId })
      .from(appointments)
      .where(eq(appointments.id, s.oldAppointment));
    expect(old!.patientId).toBe(s.existingId);

    const context = await getClientContext(SLUG, s.userId);
    expect(context).toMatchObject({
      patientId: s.provisionalId,
      pending: false,
    });
    const mine = await listMyAppointments({
      clinicId,
      patientId: s.provisionalId,
      userId: s.userId,
      emailVerified: true,
    });
    expect(mine.upcoming.map((row) => row.id)).toEqual([s.onlineAppointment]);

    const [audit] = await db
      .select({ action: auditLogs.action, entityId: auditLogs.entityId })
      .from(auditLogs)
      .where(eq(auditLogs.action, "patient.link_rejected"));
    expect(audit).toEqual({
      action: "patient.link_rejected",
      entityId: s.provisionalId,
    });
    expect(await listPendingLinks(clinicId)).toEqual([]);
  });

  it("reject with same name and phone asks for a new name", async () => {
    const s = await scenario(EXISTING_NAME);
    expect(await rejectLink(clinicId, s.provisionalId, ownerId)).toEqual({
      ok: false,
      reason: "same_name_and_phone",
    });
    // Nothing changed: still pending.
    expect(await patientRow(s.provisionalId)).toMatchObject({
      pendingLinkPatientId: s.existingId,
    });
    expect(await listPendingLinks(clinicId)).toHaveLength(1);
  });

  it("confirm onto a record that already has an account is refused", async () => {
    const s = await scenario();
    const otherUser = await createUser("ja-tem-conta");
    await db
      .update(patients)
      .set({ userId: otherUser })
      .where(eq(patients.id, s.existingId));
    expect((await listPendingLinks(clinicId))[0]).toMatchObject({
      existingHasAccount: true,
    });

    expect(await confirmLink(clinicId, s.provisionalId, ownerId)).toEqual({
      ok: false,
      reason: "existing_has_account",
    });
    expect(await patientRow(s.provisionalId)).toMatchObject({
      userId: s.userId,
      pendingLinkPatientId: s.existingId,
    });
    expect(await patientRow(s.existingId)).toMatchObject({
      userId: otherUser,
    });
    const [online] = await db
      .select({ patientId: appointments.patientId })
      .from(appointments)
      .where(eq(appointments.id, s.onlineAppointment));
    expect(online!.patientId).toBe(s.provisionalId);
  });

  it("another clinic cannot confirm", async () => {
    const s = await scenario();
    expect(await confirmLink(secondClinicId, s.provisionalId, ownerId)).toEqual(
      { ok: false, reason: "not_found" },
    );
    expect(await rejectLink(secondClinicId, s.provisionalId, ownerId)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await patientRow(s.provisionalId)).toMatchObject({
      userId: s.userId,
      pendingLinkPatientId: s.existingId,
    });
    expect(await patientRow(s.existingId)).toMatchObject({ userId: null });
    // A record that is not provisional, or not a UUID: not found either.
    expect(await confirmLink(clinicId, s.existingId, ownerId)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await confirmLink(clinicId, "nao-e-uuid", ownerId)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("the panel may move audit refs but not rewrite the history", async () => {
    const [row] = await db
      .insert(auditLogs)
      .values({
        clinicId,
        actorType: "admin",
        actorUserId: ownerId,
        action: "patient.created",
        entityType: "patient",
        entityId: null,
      })
      .returning({ id: auditLogs.id });
    const error = await inClinic(clinicId, (tx) =>
      tx
        .update(auditLogs)
        .set({ action: "patient.forged" })
        .where(eq(auditLogs.id, row!.id)),
    ).catch((caught: unknown) => caught);
    expect(findPgError(error)?.code).toBe("42501");
  });
});
