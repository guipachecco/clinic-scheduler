import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db, endPools } from "@/db/owner";
import {
  appointments,
  auditLogs,
  patients,
  serviceCategories,
  services,
  users,
} from "@/db/schema";
import { listDayReminders, markReminded } from "@/modules/reminders/manual";
import { sendDueReminders } from "@/modules/reminders/reminders";

import { CLINIC } from "../helpers/clinic";

// Every record here is fictitious and exists only during the test.

const MINUTE = 60_000;
// Wednesday 2026-11-18, 10:00 in São Paulo.
const NOW = new Date("2026-11-18T13:00:00Z");
// Thursday 19/11 at 14:30 in São Paulo.
const TOMORROW = new Date("2026-11-19T17:30:00Z");

let actorId: string;
let patientId: string;
let serviceId: string;

async function insertAppointment(
  values: Partial<typeof appointments.$inferInsert> = {},
) {
  const startsAt = values.startsAt ?? TOMORROW;
  const endsAt = new Date(startsAt.getTime() + 60 * MINUTE);
  const [row] = await db
    .insert(appointments)
    .values({
      clinicId: CLINIC,
      patientId,
      serviceId,
      serviceName: "Limpeza fictícia",
      serviceDurationMinutes: 60,
      startsAt,
      endsAt,
      occupiedFrom: startsAt,
      occupiedUntil: endsAt,
      status: "confirmed",
      source: "admin",
      confirmedAt: NOW,
      ...values,
    })
    .returning({ id: appointments.id });
  return row!.id;
}

beforeEach(async () => {
  await db.execute(
    sql`truncate table audit_logs, appointments, patients, services, service_categories, users, whatsapp_daily_sends, whatsapp_pending, whatsapp_opt_in_codes cascade`,
  );
  const [user] = await db
    .insert(users)
    .values({
      name: "Admin",
      email: "admin@example.com",
      role: "admin",
      clinicId: CLINIC,
    })
    .returning();
  actorId = user!.id;
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
      name: "Limpeza fictícia",
      slug: "limpeza-ficticia",
      durationMinutes: 60,
      isActive: true,
    })
    .returning();
  serviceId = service!.id;
  const [patient] = await db
    .insert(patients)
    .values({
      clinicId: CLINIC,
      name: "Maria Fictícia da Silva",
      nameNormalized: "maria ficticia da silva",
      phone: "+5500000000001",
    })
    .returning();
  patientId = patient!.id;
});

afterAll(async () => {
  await endPools();
});

describe("listDayReminders", () => {
  it("lists the day's confirmed appointments with the WhatsApp link", async () => {
    const id = await insertAppointment();
    await insertAppointment({
      status: "requested",
      confirmedAt: null,
      startsAt: new Date(TOMORROW.getTime() + 2 * 60 * MINUTE),
    });
    await insertAppointment({ startsAt: new Date("2026-11-20T17:30:00Z") });

    const day = await listDayReminders(CLINIC, "2026-11-19", NOW);
    expect(day?.items.map((item) => item.id)).toEqual([id]);
    const [item] = day!.items;
    expect(item!.reminded).toBe(false);
    expect(item!.link).toMatch(
      /^https:\/\/api\.whatsapp\.com\/send\?phone=5500000000001&text=/,
    );
    expect(decodeURIComponent(item!.link!.split("text=")[1]!)).toContain(
      "seu horário amanhã, quinta-feira (19/11), às 14:30 — Limpeza fictícia",
    );
  });

  it("refuses a malformed date", async () => {
    expect(await listDayReminders(CLINIC, "19/11/2026", NOW)).toBeNull();
  });
});

describe("markReminded", () => {
  it("marks once, logs who did it and the daily run skips it", async () => {
    const id = await insertAppointment({ whatsappReminder: true });

    expect(await markReminded(CLINIC, id, actorId)).toBe(true);
    expect(await markReminded(CLINIC, id, actorId)).toBe(true);

    const day = await listDayReminders(CLINIC, "2026-11-19", NOW);
    expect(day!.items[0]!.reminded).toBe(true);
    const audit = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityId, id),
          eq(auditLogs.action, "appointment.reminder_sent"),
        ),
      );
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actorType).toBe("admin");
    expect(audit[0]!.actorUserId).toBe(actorId);

    const send = vi.fn(async () => {});
    expect(await sendDueReminders(NOW, send)).toEqual({
      sent: 0,
      failed: 0,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("does nothing for a cancelled appointment", async () => {
    const id = await insertAppointment({
      status: "cancelled",
      cancelledAt: NOW,
      cancelledBy: "patient",
      cancellationReason: "patient_request",
    });
    expect(await markReminded(CLINIC, id, actorId)).toBe(false);
  });
});
