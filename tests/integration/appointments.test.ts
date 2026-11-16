import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/owner";
import {
  appointments,
  appointmentServices,
  auditLogs,
  businessHours,
  patients,
  saleItems,
  saleSessions,
  serviceCategories,
  services,
  timeBlocks,
  users,
} from "@/db/schema";
import {
  changeAppointmentStatus,
  createAppointment,
  getAppointment,
  listAppointmentsInRange,
  listPatientAppointments,
  listRequestedFrom,
  countRequestedFrom,
  rescheduleAppointment,
  updateAppointment,
} from "@/modules/appointments/appointments";
import {
  appointmentFormSchema,
  type AppointmentFormValues,
} from "@/modules/appointments/fields";

import {
  approveSchema,
  quoteFormSchema,
  scheduleSessionsSchema,
} from "@/modules/finance/fields";
import { approveQuote, createQuote } from "@/modules/finance/quotes";
import { scheduleSessions } from "@/modules/finance/sales";

import { CLINIC, defaultProfessional, otherClinic } from "../helpers/clinic";

// Every record here is fictitious and exists only during the test.

const MINUTE = 60_000;
// Tuesday 2026-11-03, 09:00 in São Paulo.
const NOW = new Date("2026-11-03T12:00:00Z");

let actorId: string;
let patientId: string;
let plainPatientId: string;
let anonymizedPatientId: string;
let serviceId: string;
let otherServiceId: string;
let flexibleServiceId: string;
let inactiveServiceId: string;
let inactiveCategoryServiceId: string;
let extraAId: string;
let extraBId: string;
let bufferedExtraId: string;

const PATIENT_NAME = "Maria Fictícia da Silva";
const LABEL = "Encaixe de retorno";

function form(overrides: Record<string, unknown> = {}): AppointmentFormValues {
  return appointmentFormSchema.parse({
    patientId,
    serviceId,
    customLabel: "",
    date: "2026-11-10",
    startTime: "10:00",
    durationMinutes: "60",
    idempotencyKey: crypto.randomUUID(),
    ...overrides,
  });
}

async function created(overrides: Record<string, unknown> = {}) {
  const result = await createAppointment(CLINIC, form(overrides), actorId, NOW);
  if (!result.ok) throw new Error(`expected ok: ${JSON.stringify(result)}`);
  return result.id;
}

// An appointment that is a session of a package, built through the real path:
// a quote with a service item, approved into a sale, one session scheduled.
async function packageSession(startTime = "10:00"): Promise<string> {
  const quote = await createQuote(
    CLINIC,
    quoteFormSchema.parse({
      patientId,
      validUntil: "2026-11-19",
      discount: "",
      notes: "",
      items: [
        {
          kind: "service",
          serviceId,
          sessions: "2",
          unitPrice: "150,00",
          discount: "",
        },
      ],
    }),
    actorId,
  );
  if (!quote.ok) throw new Error(JSON.stringify(quote));
  const sale = await approveQuote(
    CLINIC,
    quote.id,
    approveSchema.parse({ plan: "upfront", firstDueDate: "2026-11-03" }),
    actorId,
    "2026-11-03",
  );
  if (!sale.ok) throw new Error(JSON.stringify(sale));
  const [item] = await db.select({ id: saleItems.id }).from(saleItems);
  const scheduled = await scheduleSessions(
    CLINIC,
    scheduleSessionsSchema.parse({
      saleItemId: item!.id,
      durationMinutes: "60",
      slots: [{ date: "2026-11-10", startTime }],
      acknowledgeWarnings: false,
    }),
    actorId,
    NOW,
  );
  if (!scheduled.ok) throw new Error(JSON.stringify(scheduled));
  const [session] = await db.select().from(saleSessions);
  return session!.appointmentId!;
}

async function row(id: string) {
  const [found] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, id));
  return found!;
}

async function audits(entityId: string) {
  return db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.entityId, entityId))
    .orderBy(asc(auditLogs.createdAt));
}

async function appointmentCount() {
  const rows = await db.select({ id: appointments.id }).from(appointments);
  return rows.length;
}

beforeEach(async () => {
  await db.execute(
    sql`truncate table audit_logs, time_blocks, business_hours, appointments, patients, services, service_categories, users cascade`,
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

  const [category, closedCategory] = await db
    .insert(serviceCategories)
    .values([
      {
        clinicId: CLINIC,
        name: "Categoria fictícia",
        slug: "categoria-ficticia",
      },
      {
        clinicId: CLINIC,
        name: "Categoria inativa",
        slug: "categoria-inativa",
        isActive: false,
      },
    ])
    .returning();
  const insertService = async (values: Partial<typeof services.$inferInsert>) =>
    (
      await db
        .insert(services)
        .values({
          clinicId: CLINIC,
          categoryId: category!.id,
          name: values.slug!,
          slug: values.slug!,
          durationMinutes: 60,
          isActive: true,
          ...values,
        })
        .returning()
    )[0]!.id;
  serviceId = await insertService({
    slug: "limpeza-ficticia",
    name: "Limpeza fictícia",
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 15,
  });
  otherServiceId = await insertService({
    slug: "outro-ficticio",
    name: "Outro fictício",
    durationMinutes: 30,
    bufferAfterMinutes: 5,
  });
  flexibleServiceId = await insertService({
    slug: "encaixe-ficticio",
    name: "Encaixe fictício",
    isFlexible: true,
  });
  inactiveServiceId = await insertService({
    slug: "inativo-ficticio",
    isActive: false,
  });
  inactiveCategoryServiceId = await insertService({
    slug: "categoria-fechada-ficticio",
    categoryId: closedCategory!.id,
  });
  extraAId = await insertService({
    slug: "extra-a-ficticio",
    name: "Extra A fictício",
    durationMinutes: 20,
  });
  extraBId = await insertService({
    slug: "extra-b-ficticio",
    name: "Extra B fictício",
    durationMinutes: 40,
  });
  bufferedExtraId = await insertService({
    slug: "extra-limpeza-ficticio",
    name: "Extra com limpeza fictício",
    durationMinutes: 25,
    bufferAfterMinutes: 15,
  });

  const [patient, plain, anonymized] = await db
    .insert(patients)
    .values([
      {
        clinicId: CLINIC,
        name: PATIENT_NAME,
        nameNormalized: "maria ficticia da silva",
        nickname: "Mari",
        phone: "+5500000000001",
      },
      {
        clinicId: CLINIC,
        name: "João Fictício",
        nameNormalized: "joao ficticio",
        phone: "+5500000000002",
      },
      {
        clinicId: CLINIC,
        name: "Paciente anonimizado",
        anonymizedAt: new Date(),
      },
    ])
    .returning();
  patientId = patient!.id;
  plainPatientId = plain!.id;
  anonymizedPatientId = anonymized!.id;

  // Monday to Saturday, 08:00 to 18:00.
  await db.insert(businessHours).values(
    [1, 2, 3, 4, 5, 6].map((weekday) => ({
      clinicId: CLINIC,
      weekday,
      startTime: "08:00",
      endTime: "18:00",
    })),
  );
});

afterAll(async () => {
  await endPools();
});

describe("createAppointment", () => {
  it("creates a confirmed admin appointment with the buffers applied", async () => {
    const id = await created();
    const saved = await row(id);
    expect(saved).toMatchObject({
      patientId,
      serviceId,
      serviceName: "Limpeza fictícia",
      serviceDurationMinutes: 60,
      customLabel: null,
      status: "confirmed",
      source: "admin",
      confirmedAt: NOW,
    });
    expect(saved.startsAt.toISOString()).toBe("2026-11-10T13:00:00.000Z");
    expect(saved.endsAt.toISOString()).toBe("2026-11-10T14:00:00.000Z");
    expect(saved.occupiedFrom.toISOString()).toBe("2026-11-10T12:50:00.000Z");
    expect(saved.occupiedUntil.toISOString()).toBe("2026-11-10T14:15:00.000Z");

    const [audit] = await audits(id);
    expect(audit).toMatchObject({
      action: "appointment.created",
      entityType: "appointment",
      actorType: "admin",
      actorUserId: actorId,
    });
  });

  it("keeps a custom duration and the service's default as the snapshot", async () => {
    const id = await created({ durationMinutes: "45" });
    const saved = await row(id);
    expect(saved.serviceDurationMinutes).toBe(60);
    expect(saved.endsAt.getTime() - saved.startsAt.getTime()).toBe(45 * MINUTE);
  });

  it("returns warnings and writes nothing until they are acknowledged", async () => {
    // Sunday is closed.
    const values = form({ date: "2026-11-08" });
    const first = await createAppointment(CLINIC, values, actorId, NOW);
    expect(first).toEqual({
      ok: false,
      warnings: [{ code: "outside_hours", message: "Fora do expediente." }],
    });
    expect(await appointmentCount()).toBe(0);

    const second = await createAppointment(
      CLINIC,
      { ...values, acknowledgeWarnings: true },
      actorId,
      NOW,
    );
    expect(second.ok).toBe(true);
    expect(await appointmentCount()).toBe(1);
  });

  it("warns about blocks and the past", async () => {
    await db.insert(timeBlocks).values({
      clinicId: CLINIC,
      type: "day_off",
      title: "Folga fictícia",
      startsAt: new Date("2026-11-10T12:00:00Z"),
      endsAt: new Date("2026-11-10T16:00:00Z"),
    });
    const onBlock = await createAppointment(CLINIC, form(), actorId, NOW);
    expect(onBlock).toEqual({
      ok: false,
      warnings: [
        { code: "on_block", message: "Sobre um bloqueio: Folga fictícia." },
      ],
    });
    const past = await createAppointment(
      CLINIC,
      form({ date: "2026-11-02" }),
      actorId,
      NOW,
    );
    expect(past).toEqual({
      ok: false,
      warnings: [{ code: "in_past", message: "Horário no passado." }],
    });
  });

  it("refuses an overlap with the conflicting times and no patient data", async () => {
    await created();
    // 11:10 local falls inside the 15-minute cleanup buffer of the first.
    const result = await createAppointment(
      CLINIC,
      form({ startTime: "11:10", patientId: plainPatientId }),
      actorId,
      NOW,
    );
    expect(result).toEqual({
      ok: false,
      formError:
        "Este horário conflita com outro atendimento das 10:00 às 11:00.",
    });
    expect(JSON.stringify(result)).not.toMatch(/Maria|Mari|Fictícia/);
    expect(await appointmentCount()).toBe(1);
  });

  it("refuses an overlap before looking at warnings", async () => {
    await db.insert(timeBlocks).values({
      clinicId: CLINIC,
      type: "day_off",
      startsAt: new Date("2026-11-10T12:00:00Z"),
      endsAt: new Date("2026-11-10T16:00:00Z"),
    });
    await created({ acknowledgeWarnings: true });
    const result = await createAppointment(
      CLINIC,
      form({ startTime: "10:30", patientId: plainPatientId }),
      actorId,
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.formError).toMatch(/conflita/);
      expect(result.warnings).toBeUndefined();
    }
  });

  it("lets exactly one of two simultaneous creates for the same slot through", async () => {
    const results = await Promise.all([
      createAppointment(CLINIC, form(), actorId, NOW),
      createAppointment(
        CLINIC,
        form({ patientId: plainPatientId }),
        actorId,
        NOW,
      ),
      createAppointment(CLINIC, form({ startTime: "10:30" }), actorId, NOW),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    for (const result of results.filter((r) => !r.ok)) {
      expect(result).toMatchObject({
        ok: false,
        formError: expect.stringMatching(/^Este horário conflita/),
      });
    }
    expect(await appointmentCount()).toBe(1);
  });

  it("refuses an anonymized or missing patient", async () => {
    expect(
      await createAppointment(
        CLINIC,
        form({ patientId: anonymizedPatientId }),
        actorId,
        NOW,
      ),
    ).toEqual({
      ok: false,
      formError: "Paciente anonimizado não pode ser agendado.",
    });
    const missing = await createAppointment(
      CLINIC,
      form({ patientId: crypto.randomUUID() }),
      actorId,
      NOW,
    );
    expect(missing).toMatchObject({
      ok: false,
      fieldErrors: { patientId: expect.any(String) },
    });
    expect(await appointmentCount()).toBe(0);
  });

  it("refuses an inactive service or one in an inactive category", async () => {
    for (const id of [inactiveServiceId, inactiveCategoryServiceId]) {
      expect(
        await createAppointment(CLINIC, form({ serviceId: id }), actorId, NOW),
      ).toEqual({ ok: false, fieldErrors: { serviceId: "Serviço inativo." } });
    }
    const missing = await createAppointment(
      CLINIC,
      form({ serviceId: crypto.randomUUID() }),
      actorId,
      NOW,
    );
    expect(missing).toMatchObject({
      ok: false,
      fieldErrors: { serviceId: expect.any(String) },
    });
    expect(await appointmentCount()).toBe(0);
  });

  it("requires a label for a flexible service and rejects one otherwise", async () => {
    const noLabel = await createAppointment(
      CLINIC,
      form({ serviceId: flexibleServiceId }),
      actorId,
      NOW,
    );
    expect(noLabel).toMatchObject({
      ok: false,
      fieldErrors: { customLabel: expect.any(String) },
    });
    const withLabel = await createAppointment(
      CLINIC,
      form({ customLabel: LABEL }),
      actorId,
      NOW,
    );
    expect(withLabel).toMatchObject({
      ok: false,
      fieldErrors: { customLabel: expect.any(String) },
    });
    expect(await appointmentCount()).toBe(0);

    const id = await created({
      serviceId: flexibleServiceId,
      customLabel: LABEL,
    });
    expect((await row(id)).customLabel).toBe(LABEL);
  });

  it("returns the same id for a repeated idempotency key", async () => {
    const values = form();
    const first = await createAppointment(CLINIC, values, actorId, NOW);
    const second = await createAppointment(CLINIC, values, actorId, NOW);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.id).toBe(first.id);
    expect(await appointmentCount()).toBe(1);
    expect(await db.select().from(auditLogs)).toHaveLength(1);
  });

  it("refuses a repeated key that carries a different request", async () => {
    const idempotencyKey = crypto.randomUUID();
    const first = await createAppointment(
      CLINIC,
      form({ idempotencyKey }),
      actorId,
      NOW,
    );
    expect(first.ok).toBe(true);
    for (const overrides of [
      { startTime: "14:00" },
      { serviceId: otherServiceId },
      { patientId: plainPatientId },
    ]) {
      const again = await createAppointment(
        CLINIC,
        form({ idempotencyKey, ...overrides }),
        actorId,
        NOW,
      );
      expect(again).toEqual({
        ok: false,
        formError:
          "Este formulário já foi enviado. Recarregue a página para criar outro agendamento.",
      });
    }
    expect(await appointmentCount()).toBe(1);
  });
});

describe("updateAppointment", () => {
  it("changes the service and recomputes buffers as appointment.updated", async () => {
    const id = await created();
    const result = await updateAppointment(
      CLINIC,
      id,
      form({ serviceId: otherServiceId }),
      actorId,
      NOW,
    );
    expect(result).toEqual({ ok: true, id });
    const saved = await row(id);
    expect(saved).toMatchObject({
      serviceId: otherServiceId,
      serviceName: "Outro fictício",
      serviceDurationMinutes: 30,
    });
    expect(saved.occupiedFrom.toISOString()).toBe("2026-11-10T13:00:00.000Z");
    expect(saved.occupiedUntil.toISOString()).toBe("2026-11-10T14:05:00.000Z");
    const rows = await audits(id);
    expect(rows.map((r) => r.action)).toEqual([
      "appointment.created",
      "appointment.updated",
    ]);
    expect(rows[1]!.changes).toMatchObject({
      serviceChanged: true,
      fromServiceId: serviceId,
      toServiceId: otherServiceId,
    });
  });

  it("logs a time and service change as one appointment.rescheduled", async () => {
    const id = await created();
    await updateAppointment(
      CLINIC,
      id,
      form({ serviceId: otherServiceId, startTime: "15:00" }),
      actorId,
      NOW,
    );
    const rows = await audits(id);
    expect(rows.map((r) => r.action)).toEqual([
      "appointment.created",
      "appointment.rescheduled",
    ]);
    expect(rows[1]!.changes).toMatchObject({
      serviceChanged: true,
      to: { startsAt: "2026-11-10T18:00:00.000Z" },
    });
  });

  it("writes nothing when nothing changed", async () => {
    const id = await created();
    expect(await updateAppointment(CLINIC, id, form(), actorId, NOW)).toEqual({
      ok: true,
      id,
    });
    expect(await audits(id)).toHaveLength(1);
  });

  it("keeps a service that became inactive but refuses switching to another inactive one", async () => {
    const id = await created();
    await db
      .update(services)
      .set({ isActive: false })
      .where(eq(services.id, serviceId));
    expect(
      await updateAppointment(
        CLINIC,
        id,
        form({ startTime: "11:00" }),
        actorId,
        NOW,
      ),
    ).toEqual({ ok: true, id });
    expect(
      await updateAppointment(
        CLINIC,
        id,
        form({ serviceId: inactiveServiceId }),
        actorId,
        NOW,
      ),
    ).toEqual({ ok: false, fieldErrors: { serviceId: "Serviço inativo." } });
  });

  it("keeps the patient and ignores another patient id in the values", async () => {
    const id = await created();
    await updateAppointment(
      CLINIC,
      id,
      form({ patientId: plainPatientId, startTime: "11:00" }),
      actorId,
      NOW,
    );
    expect((await row(id)).patientId).toBe(patientId);
  });

  it("refuses an overlap with another appointment but not with itself", async () => {
    const id = await created();
    await created({ startTime: "14:00", patientId: plainPatientId });
    // Moving by 15 minutes overlaps only itself.
    expect(
      await updateAppointment(
        CLINIC,
        id,
        form({ startTime: "10:15" }),
        actorId,
        NOW,
      ),
    ).toEqual({ ok: true, id });
    expect(
      await updateAppointment(
        CLINIC,
        id,
        form({ startTime: "13:30" }),
        actorId,
        NOW,
      ),
    ).toEqual({
      ok: false,
      formError:
        "Este horário conflita com outro atendimento das 14:00 às 15:00.",
    });
  });

  it("refuses a missing id or a non-UUID", async () => {
    expect(
      await updateAppointment(CLINIC, "x", form(), actorId, NOW),
    ).toMatchObject({
      ok: false,
      formError: expect.any(String),
    });
    expect(
      await updateAppointment(
        CLINIC,
        crypto.randomUUID(),
        form(),
        actorId,
        NOW,
      ),
    ).toMatchObject({ ok: false, formError: expect.any(String) });
  });
});

describe("rescheduleAppointment", () => {
  it("moves the appointment, recomputes buffers and logs appointment.rescheduled", async () => {
    const id = await created();
    // The service's buffers changed since the appointment was created.
    await db
      .update(services)
      .set({ bufferBeforeMinutes: 0, bufferAfterMinutes: 30 })
      .where(eq(services.id, serviceId));
    const result = await rescheduleAppointment(
      CLINIC,
      id,
      {
        startsAt: new Date("2026-11-11T14:00:00Z"),
        endsAt: new Date("2026-11-11T15:30:00Z"),
        acknowledgeWarnings: false,
      },
      actorId,
      NOW,
    );
    expect(result).toEqual({ ok: true, id });
    const saved = await row(id);
    expect(saved.occupiedFrom.toISOString()).toBe("2026-11-11T14:00:00.000Z");
    expect(saved.occupiedUntil.toISOString()).toBe("2026-11-11T16:00:00.000Z");
    const rows = await audits(id);
    expect(rows[1]).toMatchObject({ action: "appointment.rescheduled" });
    expect(rows[1]!.changes).toEqual({
      from: {
        startsAt: "2026-11-10T13:00:00.000Z",
        endsAt: "2026-11-10T14:00:00.000Z",
        durationMinutes: 60,
      },
      to: {
        startsAt: "2026-11-11T14:00:00.000Z",
        endsAt: "2026-11-11T15:30:00.000Z",
        durationMinutes: 90,
      },
    });
  });

  it("returns warnings for a drag outside hours and moves nothing", async () => {
    const id = await created();
    const move = {
      startsAt: new Date("2026-11-10T22:00:00Z"),
      endsAt: new Date("2026-11-10T23:00:00Z"),
    };
    expect(
      await rescheduleAppointment(
        CLINIC,
        id,
        { ...move, acknowledgeWarnings: false },
        actorId,
        NOW,
      ),
    ).toEqual({
      ok: false,
      warnings: [{ code: "outside_hours", message: "Fora do expediente." }],
    });
    expect((await row(id)).startsAt.toISOString()).toBe(
      "2026-11-10T13:00:00.000Z",
    );
    expect(
      await rescheduleAppointment(
        CLINIC,
        id,
        { ...move, acknowledgeWarnings: true },
        actorId,
        NOW,
      ),
    ).toEqual({ ok: true, id });
  });

  it("refuses moving a cancelled or completed appointment", async () => {
    const cancelled = await created();
    await changeAppointmentStatus(
      CLINIC,
      cancelled,
      { to: "cancelled", reason: "other" },
      actorId,
      NOW,
    );
    const completed = await created({
      date: "2026-11-02",
      acknowledgeWarnings: true,
    });
    expect(
      (
        await changeAppointmentStatus(
          CLINIC,
          completed,
          { to: "completed" },
          actorId,
          NOW,
        )
      ).ok,
    ).toBe(true);
    for (const id of [cancelled, completed]) {
      const result = await rescheduleAppointment(
        CLINIC,
        id,
        {
          startsAt: new Date("2026-11-12T13:00:00Z"),
          endsAt: new Date("2026-11-12T14:00:00Z"),
          acknowledgeWarnings: true,
        },
        actorId,
        NOW,
      );
      expect(result).toEqual({
        ok: false,
        formError: "Este atendimento não pode mais ser alterado.",
      });
      expect(
        await updateAppointment(
          CLINIC,
          id,
          form({ startTime: "15:00" }),
          actorId,
          NOW,
        ),
      ).toEqual({
        ok: false,
        formError: "Este atendimento não pode mais ser alterado.",
      });
    }
  });
});

describe("changeAppointmentStatus", () => {
  it("cancels with a reason code, cancelled_by clinic and cancelled_at", async () => {
    const id = await created();
    const result = await changeAppointmentStatus(
      CLINIC,
      id,
      { to: "cancelled", reason: "patient_request" },
      actorId,
      NOW,
    );
    expect(result).toEqual({ ok: true, id });
    expect(await row(id)).toMatchObject({
      status: "cancelled",
      cancelledBy: "clinic",
      cancelledAt: NOW,
      cancellationReason: "patient_request",
    });
    const rows = await audits(id);
    expect(rows[1]).toMatchObject({
      action: "appointment.status_changed",
      changes: {
        from: "confirmed",
        to: "cancelled",
        reason: "patient_request",
      },
    });
    // The slot is free again.
    await created({ patientId: plainPatientId });
  });

  it("refuses a cancellation without a valid reason", async () => {
    const id = await created();
    expect(
      await changeAppointmentStatus(
        CLINIC,
        id,
        { to: "cancelled" },
        actorId,
        NOW,
      ),
    ).toMatchObject({ ok: false, fieldErrors: { reason: expect.any(String) } });
    expect((await row(id)).status).toBe("confirmed");
  });

  it("sets confirmed_at when a requested appointment is confirmed", async () => {
    const id = await created();
    await db
      .update(appointments)
      .set({ status: "requested", confirmedAt: null })
      .where(eq(appointments.id, id));
    const later = new Date(NOW.getTime() + 5 * MINUTE);
    expect(
      await changeAppointmentStatus(
        CLINIC,
        id,
        { to: "confirmed" },
        actorId,
        later,
      ),
    ).toEqual({ ok: true, id });
    expect(await row(id)).toMatchObject({
      status: "confirmed",
      confirmedAt: later,
    });
  });

  it("refuses completed before the start and allows it after", async () => {
    const id = await created();
    expect(
      await changeAppointmentStatus(
        CLINIC,
        id,
        { to: "completed" },
        actorId,
        NOW,
      ),
    ).toEqual({ ok: false, formError: "Só depois do horário de início." });
    const after = new Date("2026-11-10T13:00:00Z");
    expect(
      await changeAppointmentStatus(
        CLINIC,
        id,
        { to: "completed" },
        actorId,
        after,
      ),
    ).toEqual({ ok: true, id });
    expect(
      await changeAppointmentStatus(
        CLINIC,
        id,
        { to: "no_show" },
        actorId,
        after,
      ),
    ).toEqual({ ok: true, id });
    expect((await row(id)).status).toBe("no_show");
  });

  it("treats cancelled as final", async () => {
    const id = await created();
    await changeAppointmentStatus(
      CLINIC,
      id,
      { to: "cancelled", reason: "other" },
      actorId,
      NOW,
    );
    const result = await changeAppointmentStatus(
      CLINIC,
      id,
      { to: "confirmed" },
      actorId,
      NOW,
    );
    expect(result).toMatchObject({ ok: false, formError: expect.any(String) });
    expect((await row(id)).status).toBe("cancelled");
  });
});

describe("audit changes", () => {
  it("never contain the patient name or the label", async () => {
    const id = await created({
      serviceId: flexibleServiceId,
      customLabel: LABEL,
    });
    await updateAppointment(
      CLINIC,
      id,
      form({
        serviceId: flexibleServiceId,
        customLabel: "Outro rótulo fictício",
        startTime: "11:00",
      }),
      actorId,
      NOW,
    );
    await rescheduleAppointment(
      CLINIC,
      id,
      {
        startsAt: new Date("2026-11-12T13:00:00Z"),
        endsAt: new Date("2026-11-12T14:00:00Z"),
        acknowledgeWarnings: false,
      },
      actorId,
      NOW,
    );
    await changeAppointmentStatus(
      CLINIC,
      id,
      { to: "cancelled", reason: "rescheduled" },
      actorId,
      NOW,
    );
    const rows = await audits(id);
    expect(rows.map((r) => r.action)).toEqual([
      "appointment.created",
      "appointment.rescheduled",
      "appointment.rescheduled",
      "appointment.status_changed",
    ]);
    const text = JSON.stringify(rows.map((r) => r.changes));
    for (const secret of [
      "Maria",
      "Mari",
      "Fictícia",
      LABEL,
      "Outro rótulo",
      "Encaixe",
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(rows[1]!.changes).toMatchObject({ labelChanged: true });
  });
});

describe("getAppointment", () => {
  it("returns the record page fields", async () => {
    const id = await created({
      serviceId: flexibleServiceId,
      customLabel: LABEL,
      durationMinutes: "45",
    });
    const professional = await defaultProfessional();
    expect(await getAppointment(CLINIC, id, NOW)).toEqual({
      id,
      patientId,
      patientName: PATIENT_NAME,
      serviceId: flexibleServiceId,
      serviceName: "Encaixe fictício",
      isFlexible: true,
      professionalId: professional.id,
      professionalName: professional.name,
      customLabel: LABEL,
      startsAt: new Date("2026-11-10T13:00:00Z"),
      endsAt: new Date("2026-11-10T13:45:00Z"),
      durationMinutes: 45,
      serviceDurationMinutes: 60,
      status: "confirmed",
      source: "admin",
      cancellationReason: null,
      confirmedAt: NOW,
      editable: true,
      allowedTransitions: ["cancelled"],
      extras: [],
      inPackage: false,
    });
    const after = await getAppointment(
      CLINIC,
      id,
      new Date("2026-11-10T14:00:00Z"),
    );
    expect(after?.allowedTransitions).toEqual([
      "cancelled",
      "completed",
      "no_show",
    ]);
  });

  it("returns null for a missing id or a non-UUID", async () => {
    expect(await getAppointment(CLINIC, "x")).toBeNull();
    expect(await getAppointment(CLINIC, crypto.randomUUID())).toBeNull();
  });
});

describe("listAppointmentsInRange", () => {
  it("lists events with the nickname or first name and hides cancelled ones", async () => {
    const nick = await created();
    const plain = await created({
      patientId: plainPatientId,
      startTime: "14:00",
      serviceId: flexibleServiceId,
      customLabel: LABEL,
    });
    const cancelled = await created({ startTime: "16:00" });
    await changeAppointmentStatus(
      CLINIC,
      cancelled,
      { to: "cancelled", reason: "other" },
      actorId,
      NOW,
    );
    await created({ date: "2026-11-20" });
    // Booked by the client through the clinic link: labelled Online.
    await db
      .update(appointments)
      .set({ source: "online" })
      .where(eq(appointments.id, plain));

    const range = {
      from: new Date("2026-11-10T03:00:00Z"),
      to: new Date("2026-11-11T03:00:00Z"),
    };
    const events = await listAppointmentsInRange(CLINIC, {
      ...range,
      includeCancelled: false,
    });
    const professional = await defaultProfessional();
    expect(events).toEqual([
      {
        id: nick,
        title: "Mari · Limpeza fictícia",
        patientLabel: "Mari",
        serviceLabel: "Limpeza fictícia",
        start: "2026-11-10T13:00:00.000Z",
        end: "2026-11-10T14:00:00.000Z",
        status: "confirmed",
        editable: true,
        online: false,
        professionalId: professional.id,
        professionalName: professional.name,
      },
      {
        id: plain,
        title: `João · ${LABEL} · Online`,
        patientLabel: "João",
        serviceLabel: LABEL,
        start: "2026-11-10T17:00:00.000Z",
        end: "2026-11-10T18:00:00.000Z",
        status: "confirmed",
        editable: true,
        online: true,
        professionalId: professional.id,
        professionalName: professional.name,
      },
    ]);

    const all = await listAppointmentsInRange(CLINIC, {
      ...range,
      includeCancelled: true,
    });
    expect(all.map((e) => e.id)).toEqual([nick, plain, cancelled]);
    expect(all[2]).toMatchObject({ status: "cancelled", editable: false });
  });

  it("labels past appointments of an anonymized patient", async () => {
    const id = await created({ date: "2026-11-02", acknowledgeWarnings: true });
    await db
      .update(appointments)
      .set({ patientId: anonymizedPatientId })
      .where(eq(appointments.id, id));
    const events = await listAppointmentsInRange(CLINIC, {
      from: new Date("2026-11-01T00:00:00Z"),
      to: new Date("2026-11-04T00:00:00Z"),
      includeCancelled: false,
    });
    expect(events[0]!.title).toBe("Paciente anonimizado · Limpeza fictícia");
  });
});

describe("listRequestedFrom", () => {
  it("lists only requested appointments from now on, by start", async () => {
    const later = await created({ date: "2026-11-12" });
    const sooner = await created({ date: "2026-11-10" });
    const confirmed = await created({ date: "2026-11-11" });
    const past = await created({
      date: "2026-11-02",
      acknowledgeWarnings: true,
    });
    await db
      .update(appointments)
      .set({ status: "requested", confirmedAt: null })
      .where(sql`${appointments.id} in (${later}, ${sooner}, ${past})`);

    const requested = await listRequestedFrom(CLINIC, NOW);
    expect(requested.map((e) => e.id)).toEqual([sooner, later]);
    expect(requested[0]).toMatchObject({
      patientLabel: "Mari",
      serviceLabel: "Limpeza fictícia",
      status: "requested",
      start: "2026-11-10T13:00:00.000Z",
      requiresApproval: true,
    });
    expect(requested.map((e) => e.id)).not.toContain(confirmed);
    expect(await countRequestedFrom(CLINIC, NOW)).toBe(2);
  });
});

describe("listPatientAppointments", () => {
  it("splits upcoming and past, at most 10 each", async () => {
    const upcoming: string[] = [];
    for (let day = 10; day <= 21; day++) {
      // 2026-11-15 is a Sunday, outside the hours.
      upcoming.push(
        await created({ date: `2026-11-${day}`, acknowledgeWarnings: true }),
      );
    }
    const past = await created({
      date: "2026-11-02",
      acknowledgeWarnings: true,
    });
    await created({ patientId: plainPatientId, date: "2026-11-25" });

    const result = await listPatientAppointments(CLINIC, patientId, NOW);
    expect(result.upcoming.map((i) => i.id)).toEqual(upcoming.slice(0, 10));
    expect(result.past.map((i) => i.id)).toEqual([past]);
    expect(result.upcoming[0]).toEqual({
      id: upcoming[0],
      startsAt: new Date("2026-11-10T13:00:00Z"),
      endsAt: new Date("2026-11-10T14:00:00Z"),
      serviceName: "Limpeza fictícia",
      customLabel: null,
      status: "confirmed",
    });
  });

  it("returns empty lists for a non-UUID", async () => {
    expect(await listPatientAppointments(CLINIC, "x")).toEqual({
      upcoming: [],
      past: [],
    });
  });
});

describe("anonymized patients", () => {
  it("still allow status corrections on past appointments", async () => {
    const id = await created({ date: "2026-11-02", acknowledgeWarnings: true });
    await db
      .update(patients)
      .set({
        name: "Paciente anonimizado",
        nameNormalized: null,
        nickname: null,
        phone: null,
        anonymizedAt: NOW,
      })
      .where(eq(patients.id, patientId));

    const before = await getAppointment(CLINIC, id, NOW);
    expect(before?.editable).toBe(false);
    expect(before?.allowedTransitions).toEqual([
      "cancelled",
      "completed",
      "no_show",
    ]);
    expect(
      await changeAppointmentStatus(
        CLINIC,
        id,
        { to: "completed" },
        actorId,
        NOW,
      ),
    ).toEqual({ ok: true, id });
    expect((await row(id)).status).toBe("completed");

    // Scheduling changes stay refused.
    expect(
      await rescheduleAppointment(
        CLINIC,
        id,
        {
          startsAt: new Date("2026-11-12T13:00:00Z"),
          endsAt: new Date("2026-11-12T14:00:00Z"),
          acknowledgeWarnings: true,
        },
        actorId,
        NOW,
      ),
    ).toEqual({
      ok: false,
      formError: "Paciente anonimizado não pode ser agendado.",
    });
  });
});

describe("overlap race backstop", () => {
  it("returns the overlap message when the exclusion constraint fires", async () => {
    // A writer that skips the agenda lock holds an uncommitted overlapping
    // row, so the pre-check cannot see it and the insert waits on the
    // constraint until that writer commits.
    let inserted!: () => void;
    let release!: () => void;
    const insertedSignal = new Promise<void>((resolve) => (inserted = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));
    const startsAt = new Date("2026-11-10T13:00:00Z");
    const endsAt = new Date("2026-11-10T14:00:00Z");
    const holder = db.transaction(async (tx) => {
      await tx.insert(appointments).values({
        clinicId: CLINIC,
        patientId: plainPatientId,
        serviceId,
        serviceName: "Limpeza fictícia",
        serviceDurationMinutes: 60,
        startsAt,
        endsAt,
        occupiedFrom: startsAt,
        occupiedUntil: endsAt,
        source: "online",
      });
      inserted();
      await gate;
    });
    await insertedSignal;

    const attempt = createAppointment(CLINIC, form(), actorId, NOW);
    // Wait until the attempt is blocked on the other writer's row.
    for (let i = 0; i < 100; i++) {
      const result = await db.execute<{ waiting: number }>(
        sql`select count(*)::int as waiting from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
      );
      if (result.rows[0]!.waiting > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    release();
    await holder;

    await expect(attempt).resolves.toEqual({
      ok: false,
      formError: "Este horário conflita com outro atendimento.",
    });
    expect(await appointmentCount()).toBe(1);
  });
});

async function extraRows(appointmentId: string) {
  return db
    .select()
    .from(appointmentServices)
    .where(eq(appointmentServices.appointmentId, appointmentId))
    .orderBy(asc(appointmentServices.position));
}

describe("extra procedures", () => {
  it("stores the extras in order with the name and duration copied", async () => {
    const id = await created({ extraServiceIds: [extraAId, extraBId] });
    const rows = await extraRows(id);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      clinicId: CLINIC,
      serviceId: extraAId,
      serviceName: "Extra A fictício",
      serviceDurationMinutes: 20,
      position: 1,
    });
    expect(rows[1]).toMatchObject({
      serviceId: extraBId,
      serviceName: "Extra B fictício",
      serviceDurationMinutes: 40,
      position: 2,
    });
    const [audit] = await audits(id);
    expect(audit!.changes).toMatchObject({
      extraServiceIds: [extraAId, extraBId],
    });
  });

  it("leaves extraServiceIds out of the audit when there are none", async () => {
    const id = await created();
    const [audit] = await audits(id);
    expect(audit!.changes).not.toHaveProperty("extraServiceIds");
    expect(await extraRows(id)).toHaveLength(0);
  });

  it("refuses a missing, flexible, inactive or other-clinic extra and writes nothing", async () => {
    const other = await otherClinic();
    const [category] = await db
      .insert(serviceCategories)
      .values({ clinicId: other, name: "Cat", slug: "cat-extra-outra" })
      .returning();
    const [foreign] = await db
      .insert(services)
      .values({
        clinicId: other,
        categoryId: category!.id,
        name: "Serviço de outra clínica",
        slug: "servico-outra-clinica",
        durationMinutes: 30,
      })
      .returning();
    const cases: [string, string][] = [
      [foreign!.id, "Escolha um serviço cadastrado."],
      [crypto.randomUUID(), "Escolha um serviço cadastrado."],
      [flexibleServiceId, "O encaixe só pode ser o serviço principal."],
      [inactiveServiceId, "Serviço inativo."],
      [inactiveCategoryServiceId, "Serviço inativo."],
    ];
    for (const [extra, message] of cases) {
      const result = await createAppointment(
        CLINIC,
        form({ extraServiceIds: [extraAId, extra] }),
        actorId,
        NOW,
      );
      expect(result).toEqual({
        ok: false,
        fieldErrors: { extraServiceIds: message },
      });
    }
    expect(await appointmentCount()).toBe(0);
    expect(await db.select().from(appointmentServices)).toHaveLength(0);
  });

  it("refuses a repeat that differs only in letter case", async () => {
    for (const extras of [
      [extraAId, extraAId.toUpperCase()],
      [serviceId.toUpperCase()],
    ]) {
      const values = { ...form(), extraServiceIds: extras };
      const result = await createAppointment(CLINIC, values, actorId, NOW);
      expect(result).toEqual({
        ok: false,
        fieldErrors: { extraServiceIds: "Não repita o mesmo procedimento." },
      });
    }
    expect(await appointmentCount()).toBe(0);
  });

  it("occupies until the cleanup of the last procedure", async () => {
    // Main service without cleanup, last extra with 15 minutes.
    const buffered = await created({
      serviceId: extraAId,
      extraServiceIds: [bufferedExtraId],
    });
    const savedBuffered = await row(buffered);
    expect(savedBuffered.occupiedUntil.getTime()).toBe(
      savedBuffered.endsAt.getTime() + 15 * MINUTE,
    );
    expect(savedBuffered.occupiedFrom.getTime()).toBe(
      savedBuffered.startsAt.getTime(),
    );

    // Main service has a 15 minute cleanup, the last extra has none: the
    // last procedure decides, and the main one's preparation still counts.
    const last = await created({
      startTime: "13:00",
      extraServiceIds: [extraAId],
    });
    const savedLast = await row(last);
    expect(savedLast.occupiedUntil.getTime()).toBe(savedLast.endsAt.getTime());
    expect(savedLast.occupiedFrom.getTime()).toBe(
      savedLast.startsAt.getTime() - 10 * MINUTE,
    );
  });

  it("adds, removes and reorders extras on edit", async () => {
    const id = await created({ extraServiceIds: [extraAId] });
    const edit = (extras: string[]) =>
      updateAppointment(
        CLINIC,
        id,
        form({ extraServiceIds: extras }),
        actorId,
        NOW,
      );
    expect(await edit([extraAId, extraBId])).toEqual({ ok: true, id });
    expect((await extraRows(id)).map((r) => r.serviceId)).toEqual([
      extraAId,
      extraBId,
    ]);
    expect(await edit([extraBId, extraAId])).toEqual({ ok: true, id });
    const reordered = await extraRows(id);
    expect(reordered.map((r) => [r.serviceId, r.position])).toEqual([
      [extraBId, 1],
      [extraAId, 2],
    ]);
    expect(await edit([])).toEqual({ ok: true, id });
    expect(await extraRows(id)).toHaveLength(0);
    const logs = await audits(id);
    expect(logs.map((l) => l.action)).toEqual([
      "appointment.created",
      "appointment.updated",
      "appointment.updated",
      "appointment.updated",
    ]);
    expect(logs[1]!.changes).toEqual({
      extrasChanged: true,
      extraServiceIds: [extraAId, extraBId],
    });
    expect(logs[3]!.changes).toEqual({
      extrasChanged: true,
      extraServiceIds: [],
    });
  });

  it("recomputes the occupied range when the extras change", async () => {
    const id = await created();
    expect((await row(id)).occupiedUntil.toISOString()).toBe(
      "2026-11-10T14:15:00.000Z",
    );
    await updateAppointment(
      CLINIC,
      id,
      form({ extraServiceIds: [extraAId] }),
      actorId,
      NOW,
    );
    // The last procedure has no cleanup.
    expect((await row(id)).occupiedUntil.toISOString()).toBe(
      "2026-11-10T14:00:00.000Z",
    );
  });

  it("checks conflicts when only the extras change", async () => {
    const id = await created({ serviceId: extraAId });
    await created({ serviceId: extraAId, startTime: "11:10" });
    // Same time and main service, but the extra's cleanup now reaches the
    // appointment that starts at 11:10 (ends 11:00 + 15 minutes).
    const result = await updateAppointment(
      CLINIC,
      id,
      form({ serviceId: extraAId, extraServiceIds: [bufferedExtraId] }),
      actorId,
      NOW,
    );
    expect(result).toMatchObject({
      ok: false,
      formError: expect.stringContaining("conflita"),
    });
    expect(await extraRows(id)).toHaveLength(0);
  });

  it("writes no audit when the edit changes nothing", async () => {
    const id = await created({ extraServiceIds: [extraAId, extraBId] });
    const result = await updateAppointment(
      CLINIC,
      id,
      form({ extraServiceIds: [extraAId, extraBId] }),
      actorId,
      NOW,
    );
    expect(result).toEqual({ ok: true, id });
    expect(await audits(id)).toHaveLength(1);
    expect(await extraRows(id)).toHaveLength(2);
  });

  it("keeps an extra that was deactivated after booking, but refuses a new inactive one", async () => {
    const id = await created({ extraServiceIds: [extraAId] });
    await db
      .update(services)
      .set({ isActive: false })
      .where(eq(services.id, extraAId));
    const kept = await updateAppointment(
      CLINIC,
      id,
      form({ extraServiceIds: [extraAId], startTime: "11:00" }),
      actorId,
      NOW,
    );
    expect(kept).toEqual({ ok: true, id });
    expect((await extraRows(id)).map((r) => r.serviceId)).toEqual([extraAId]);
    const added = await updateAppointment(
      CLINIC,
      id,
      form({ extraServiceIds: [extraAId, inactiveServiceId] }),
      actorId,
      NOW,
    );
    expect(added).toEqual({
      ok: false,
      fieldErrors: { extraServiceIds: "Serviço inativo." },
    });
  });

  it("refuses extras on a package session", async () => {
    const id = await packageSession();
    const result = await updateAppointment(
      CLINIC,
      id,
      form({ extraServiceIds: [extraAId] }),
      actorId,
      NOW,
    );
    expect(result).toEqual({
      ok: false,
      formError: "Sessão de pacote não aceita outros procedimentos.",
    });
    expect(await extraRows(id)).toHaveLength(0);
    const same = await updateAppointment(CLINIC, id, form(), actorId, NOW);
    expect(same).toEqual({ ok: true, id });
  });

  it("keeps the extras on a drag and uses the cleanup of the last one", async () => {
    const id = await created({
      serviceId: extraAId,
      extraServiceIds: [extraBId, bufferedExtraId],
    });
    const result = await rescheduleAppointment(
      CLINIC,
      id,
      {
        startsAt: new Date("2026-11-11T14:00:00Z"),
        endsAt: new Date("2026-11-11T15:00:00Z"),
        acknowledgeWarnings: false,
      },
      actorId,
      NOW,
    );
    expect(result).toEqual({ ok: true, id });
    const saved = await row(id);
    expect(saved.occupiedFrom.toISOString()).toBe("2026-11-11T14:00:00.000Z");
    expect(saved.occupiedUntil.toISOString()).toBe("2026-11-11T15:15:00.000Z");
    expect((await extraRows(id)).map((r) => r.serviceId)).toEqual([
      extraBId,
      bufferedExtraId,
    ]);
  });

  it("creates one appointment and two extra rows for a repeated key", async () => {
    const values = form({ extraServiceIds: [extraAId, extraBId] });
    const first = await createAppointment(CLINIC, values, actorId, NOW);
    const second = await createAppointment(CLINIC, values, actorId, NOW);
    expect(first.ok && second.ok && first.id === second.id).toBe(true);
    expect(await appointmentCount()).toBe(1);
    expect(await db.select().from(appointmentServices)).toHaveLength(2);
  });
});

describe("reads with several procedures", () => {
  const range = {
    from: new Date("2026-11-10T03:00:00Z"),
    to: new Date("2026-11-11T03:00:00Z"),
  };

  it("shows the main service alone exactly as before", async () => {
    const id = await created();
    const [event] = await listAppointmentsInRange(CLINIC, {
      ...range,
      includeCancelled: false,
    });
    expect(event).toMatchObject({
      id,
      title: "Mari · Limpeza fictícia",
      serviceLabel: "Limpeza fictícia",
    });
    const { upcoming } = await listPatientAppointments(CLINIC, patientId, NOW);
    expect(upcoming[0]!.serviceName).toBe("Limpeza fictícia");
  });

  it("joins the main service and the extras in order", async () => {
    const id = await created({ extraServiceIds: [extraAId, extraBId] });
    const label = "Limpeza fictícia + Extra A fictício + Extra B fictício";
    const [event] = await listAppointmentsInRange(CLINIC, {
      ...range,
      includeCancelled: false,
    });
    expect(event).toMatchObject({
      title: `Mari · ${label}`,
      serviceLabel: label,
    });
    const [requested] = await db
      .update(appointments)
      .set({ status: "requested", confirmedAt: null })
      .where(eq(appointments.id, id))
      .returning({ id: appointments.id });
    const waiting = await listRequestedFrom(CLINIC, NOW);
    expect(waiting.find((e) => e.id === requested!.id)?.serviceLabel).toBe(
      label,
    );
    const { upcoming } = await listPatientAppointments(CLINIC, patientId, NOW);
    expect(upcoming[0]).toMatchObject({
      serviceName: label,
      customLabel: null,
    });
  });

  it("puts the flexible label first", async () => {
    await created({
      serviceId: flexibleServiceId,
      customLabel: LABEL,
      extraServiceIds: [extraAId],
    });
    const [event] = await listAppointmentsInRange(CLINIC, {
      ...range,
      includeCancelled: false,
    });
    expect(event!.serviceLabel).toBe(`${LABEL} + Extra A fictício`);
    const { upcoming } = await listPatientAppointments(CLINIC, patientId, NOW);
    expect(upcoming[0]!.serviceName).toBe(`${LABEL} + Extra A fictício`);
  });

  it("getAppointment returns the extras in order and keeps the main name", async () => {
    const id = await created({ extraServiceIds: [extraBId, extraAId] });
    const record = await getAppointment(CLINIC, id, NOW);
    expect(record).toMatchObject({
      serviceName: "Limpeza fictícia",
      inPackage: false,
    });
    expect(record!.extras).toEqual([
      {
        serviceId: extraBId,
        name: "Extra B fictício",
        durationMinutes: 40,
        active: true,
      },
      {
        serviceId: extraAId,
        name: "Extra A fictício",
        durationMinutes: 20,
        active: true,
      },
    ]);
    // An extra whose service was deactivated since stays listed, inactive.
    await db
      .update(services)
      .set({ isActive: false })
      .where(eq(services.id, extraAId));
    const after = await getAppointment(CLINIC, id, NOW);
    expect(after!.extras.map((e) => e.active)).toEqual([true, false]);
  });

  it("getAppointment has no extras when there are none", async () => {
    const id = await created();
    expect((await getAppointment(CLINIC, id, NOW))!.extras).toEqual([]);
  });
});

describe("getAppointment inPackage", () => {
  it("is true only for a session of a package", async () => {
    const id = await created();
    expect((await getAppointment(CLINIC, id, NOW))!.inPackage).toBe(false);
    const sessionId = await packageSession("14:00");
    expect((await getAppointment(CLINIC, sessionId, NOW))!.inPackage).toBe(
      true,
    );
  });
});
