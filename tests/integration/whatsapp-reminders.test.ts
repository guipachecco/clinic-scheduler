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
  whatsappDailySends,
  whatsappOptInCodes,
} from "@/db/schema";
import {
  createAppointment,
  getAppointment,
  updateAppointment,
} from "@/modules/appointments/appointments";
import { appointmentFormSchema } from "@/modules/appointments/fields";
import { handleIncoming } from "@/modules/reminders/opt-in";
import { sendDueReminders } from "@/modules/reminders/reminders";
import type { WhatsAppTemplate } from "@/modules/reminders/whatsapp";

import { CLINIC } from "../helpers/clinic";

// No real pauses between messages in the tests.
const FAST = { sleep: async () => {}, random: () => 0, elapsedMs: () => 0 };

// Every record here is fictitious and exists only during the test.

const MINUTE = 60_000;
// Thursday 19/11 at 14:30 in São Paulo.
const TOMORROW = new Date("2026-11-19T17:30:00Z");
// Exactly one day before it: a 1-day reminder is now due.
const NOW = new Date("2026-11-18T17:30:00Z");

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
      source: "online",
      confirmedAt: NOW,
      whatsappReminder: true,
      ...values,
    })
    .returning({ id: appointments.id });
  return row!.id;
}

async function sentFor(id: string) {
  const [row] = await db
    .select({ reminderSentFor: appointments.reminderSentFor })
    .from(appointments)
    .where(eq(appointments.id, id));
  return row!.reminderSentFor;
}

function recorder() {
  const sent: WhatsAppTemplate[] = [];
  const send = vi.fn(async (message: WhatsAppTemplate) => {
    sent.push(message);
  });
  return { sent, send };
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
      whatsappOptInAt: new Date("2026-11-01T12:00:00Z"),
      whatsappSenderId: "sender-ficticio-1",
    })
    .returning();
  patientId = patient!.id;
});

afterAll(async () => {
  await endPools();
});

describe("sendDueReminders", () => {
  it("sends tomorrow's reminder once, with the template variables", async () => {
    const id = await insertAppointment();
    const { sent, send } = recorder();

    expect(await sendDueReminders(NOW, send, FAST)).toEqual({
      sent: 1,
      failed: 0,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("5500000000001");
    expect(sent[0]!.params[0]).toBe("Maria");
    expect(sent[0]!.params.slice(2, 5)).toEqual([
      "quinta-feira, 19/11",
      "14:30",
      "Limpeza fictícia",
    ]);
    expect((await sentFor(id))?.getTime()).toBe(TOMORROW.getTime());
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
    expect(audit[0]!.actorType).toBe("system");

    // A second run the same day sends nothing.
    expect(await sendDueReminders(NOW, send, FAST)).toEqual({
      sent: 0,
      failed: 0,
    });
    expect(sent).toHaveLength(1);
  });

  it("skips appointments without the opt-in, not confirmed or not tomorrow", async () => {
    await insertAppointment({ whatsappReminder: false });
    await insertAppointment({
      status: "requested",
      confirmedAt: null,
      startsAt: new Date(TOMORROW.getTime() + 2 * 60 * MINUTE),
    });
    await insertAppointment({
      startsAt: new Date("2026-11-20T17:30:00Z"),
    });
    await insertAppointment({
      startsAt: new Date("2026-11-18T17:30:00Z"),
    });
    const { sent, send } = recorder();

    expect(await sendDueReminders(NOW, send, FAST)).toEqual({
      sent: 0,
      failed: 0,
    });
    expect(sent).toEqual([]);
  });

  it("sends again after the appointment moves to another time", async () => {
    const id = await insertAppointment();
    const { sent, send } = recorder();
    await sendDueReminders(NOW, send, FAST);

    const moved = new Date(TOMORROW.getTime() + 2 * 60 * MINUTE);
    await db
      .update(appointments)
      .set({
        startsAt: moved,
        endsAt: new Date(moved.getTime() + 60 * MINUTE),
        occupiedFrom: moved,
        occupiedUntil: new Date(moved.getTime() + 60 * MINUTE),
      })
      .where(eq(appointments.id, id));

    // Due again one day before the new time.
    const later = new Date(NOW.getTime() + 2 * 60 * MINUTE);
    expect(await sendDueReminders(later, send, FAST)).toEqual({
      sent: 1,
      failed: 0,
    });
    expect(sent[1]!.params[3]).toBe("16:30");
  });

  it("follows the chosen lead: 3 h before goes out, 1 h before waits", async () => {
    const inTwoHours = new Date(NOW.getTime() + 2 * 60 * MINUTE);
    await insertAppointment({ startsAt: inTwoHours, reminderLeadMinutes: 180 });
    await insertAppointment({
      startsAt: new Date(inTwoHours.getTime() + 60 * MINUTE),
      reminderLeadMinutes: 60,
    });
    const { sent, send } = recorder();

    expect(await sendDueReminders(NOW, send, FAST)).toEqual({
      sent: 1,
      failed: 0,
    });
    expect(sent[0]!.params[3]).toBe("16:30");
  });

  it("waits until one day before for the 1-day lead", async () => {
    await insertAppointment();
    const { send } = recorder();
    const early = new Date(NOW.getTime() - 15 * MINUTE);
    expect(await sendDueReminders(early, send, FAST)).toEqual({
      sent: 0,
      failed: 0,
    });
  });

  it("gives the claim back when the message fails", async () => {
    const id = await insertAppointment();
    const send = vi.fn(async () => {
      throw new Error("Falha ao enviar o WhatsApp (Meta 400).");
    });

    expect(await sendDueReminders(NOW, send, FAST)).toEqual({
      sent: 0,
      failed: 1,
    });
    expect(await sentFor(id)).toBeNull();
  });
});

describe("only after she writes first", () => {
  it("sends nothing to a patient who never activated", async () => {
    await db
      .update(patients)
      .set({ whatsappOptInAt: null, whatsappSenderId: null })
      .where(eq(patients.id, patientId));
    await insertAppointment();
    const { sent, send } = recorder();
    expect(await sendDueReminders(NOW, send, FAST)).toEqual({
      sent: 0,
      failed: 0,
    });
    expect(sent).toEqual([]);
  });

  it("sends the clinic's slug for the map button", async () => {
    await insertAppointment();
    const { sent, send } = recorder();
    await sendDueReminders(NOW, send, FAST);
    expect(sent[0]!.button).toMatch(/^[a-z0-9-]+$/);
    expect(sent[0]!.params).toHaveLength(6);
  });

  it("stops at the day's warm-up limit", async () => {
    // The first day allows 10; 10 already went out today.
    await db.insert(whatsappDailySends).values({ day: "2026-11-18", sent: 10 });
    await insertAppointment();
    const { send } = recorder();
    expect(await sendDueReminders(NOW, send, FAST)).toEqual({
      sent: 0,
      failed: 0,
    });
  });

  it("activates with her code and records her 1 and 2", async () => {
    await db
      .update(patients)
      .set({ whatsappOptInAt: null, whatsappSenderId: null })
      .where(eq(patients.id, patientId));
    await db
      .insert(whatsappOptInCodes)
      .values({ code: "K7P2Q9", clinicId: CLINIC, patientId });
    const replies: string[] = [];
    const send = async (_to: string, text: string) => {
      replies.push(text);
    };

    await handleIncoming(
      "sender-novo",
      "Oi! Quero receber os lembretes ✅ Código: K7P2Q9",
      NOW,
      send,
    );
    const [patient] = await db
      .select()
      .from(patients)
      .where(eq(patients.id, patientId));
    expect(patient!.whatsappSenderId).toBe("sender-novo");
    expect(patient!.whatsappOptInAt).not.toBeNull();
    expect(replies[0]).toContain("Pronto!");

    const id = await insertAppointment();
    const recorded = recorder();
    await sendDueReminders(NOW, recorded.send, FAST);
    await handleIncoming("sender-novo", "1", NOW, send);
    expect((await getAppointment(CLINIC, id, NOW))?.patientReply).toBe(
      "confirmed",
    );
    expect(replies[1]).toContain("Perfeito, confirmado!");

    await handleIncoming("sender-novo", "2", NOW, send);
    expect((await getAppointment(CLINIC, id, NOW))?.patientReply).toBe(
      "declined",
    );
    // A stranger's "1" changes nothing.
    await handleIncoming("outra-pessoa", "1", NOW, send);
    expect(replies).toHaveLength(3);
  });
});

describe("the panel's checkbox", () => {
  function form(overrides: Record<string, unknown> = {}) {
    return appointmentFormSchema.parse({
      patientId,
      serviceId,
      customLabel: "",
      date: "2026-11-19",
      startTime: "14:30",
      durationMinutes: "60",
      idempotencyKey: crypto.randomUUID(),
      // The test clinic has no working hours: every time is "outside hours".
      acknowledgeWarnings: true,
      ...overrides,
    });
  }

  it("saves the reminder on a new appointment and keeps it on an edit without the checkbox", async () => {
    const result = await createAppointment(
      CLINIC,
      form({ whatsappReminder: true }),
      actorId,
      NOW,
    );
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(
      (await getAppointment(CLINIC, result.id, NOW))?.whatsappReminder,
    ).toBe(true);

    const kept = await updateAppointment(
      CLINIC,
      result.id,
      form({ startTime: "15:00" }),
      actorId,
      NOW,
    );
    expect(kept.ok).toBe(true);
    expect(
      (await getAppointment(CLINIC, result.id, NOW))?.whatsappReminder,
    ).toBe(true);

    const off = await updateAppointment(
      CLINIC,
      result.id,
      form({ startTime: "15:00", whatsappReminder: false }),
      actorId,
      NOW,
    );
    expect(off.ok).toBe(true);
    expect(
      (await getAppointment(CLINIC, result.id, NOW))?.whatsappReminder,
    ).toBe(false);
  });

  it("saves how long before, and changes it on an edit", async () => {
    const result = await createAppointment(
      CLINIC,
      form({ whatsappReminder: true, reminderLeadMinutes: "180" }),
      actorId,
      NOW,
    );
    if (!result.ok) throw new Error(JSON.stringify(result));
    expect(
      (await getAppointment(CLINIC, result.id, NOW))?.reminderLeadMinutes,
    ).toBe(180);

    const changed = await updateAppointment(
      CLINIC,
      result.id,
      form({ whatsappReminder: true, reminderLeadMinutes: "60" }),
      actorId,
      NOW,
    );
    expect(changed.ok).toBe(true);
    expect(
      (await getAppointment(CLINIC, result.id, NOW))?.reminderLeadMinutes,
    ).toBe(60);
  });

  it("refuses a lead that is not offered", () => {
    expect(() => form({ reminderLeadMinutes: "30" })).toThrow();
  });

  it("is off when the box is left unticked", async () => {
    const result = await createAppointment(CLINIC, form(), actorId, NOW);
    if (!result.ok) throw new Error(JSON.stringify(result));
    const record = await getAppointment(CLINIC, result.id, NOW);
    expect(record?.whatsappReminder).toBe(false);
    expect(record?.reminderSent).toBe(false);
  });
});
