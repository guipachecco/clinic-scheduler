import { and, eq, ne, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/owner";
import {
  appointments,
  auditLogs,
  patients,
  professionals,
  serviceCategories,
  services,
  users,
} from "@/db/schema";
import {
  createAppointment,
  getAppointment,
  rescheduleAppointment,
  updateAppointment,
} from "@/modules/appointments/appointments";
import {
  appointmentFormSchema,
  type AppointmentFormValues,
} from "@/modules/appointments/fields";
import { professionalFormSchema } from "@/modules/professionals/fields";
import {
  createProfessional,
  HAS_UPCOMING,
  LAST_ACTIVE,
  listActiveProfessionals,
  listProfessionals,
  updateProfessional,
} from "@/modules/professionals/professionals";

import { CLINIC, defaultProfessional, otherClinic } from "../helpers/clinic";

// The team of a clinic and the agenda per professional, through the panel's
// module functions (app_panel). Every record here is fictitious.

const NOW = new Date("2026-11-09T12:00:00Z");

let actorId: string;
let patientId: string;
let serviceId: string;
let first: { id: string; name: string };

const values = (input: Record<string, unknown> = {}) =>
  professionalFormSchema.parse({
    name: "Bia Fictícia",
    registration: "",
    sortOrder: "1",
    isActive: true,
    ...input,
  });

function form(overrides: Record<string, unknown> = {}): AppointmentFormValues {
  return appointmentFormSchema.parse({
    patientId,
    serviceId,
    customLabel: "",
    date: "2026-11-10",
    startTime: "10:00",
    durationMinutes: "60",
    idempotencyKey: crypto.randomUUID(),
    acknowledgeWarnings: true,
    ...overrides,
  });
}

async function newProfessional(input: Record<string, unknown> = {}) {
  const result = await createProfessional(CLINIC, values(input), actorId);
  if (!result.ok) throw new Error("expected ok");
  return result.id;
}

async function created(overrides: Record<string, unknown> = {}) {
  const result = await createAppointment(CLINIC, form(overrides), actorId, NOW);
  if (!result.ok) throw new Error(`expected ok: ${JSON.stringify(result)}`);
  return result.id;
}

async function removeExtraProfessionals() {
  await db
    .delete(professionals)
    .where(
      and(eq(professionals.clinicId, CLINIC), ne(professionals.id, first.id)),
    );
  await db
    .update(professionals)
    .set({ isActive: true, sortOrder: 0 })
    .where(eq(professionals.id, first.id));
}

beforeAll(async () => {
  first = await defaultProfessional();
});

beforeEach(async () => {
  await db.execute(
    sql`truncate table audit_logs, appointments, patients, services, service_categories, users cascade`,
  );
  await removeExtraProfessionals();
  const [user] = await db
    .insert(users)
    .values({
      name: "Admin",
      email: "admin-equipe@example.com",
      role: "admin",
      clinicId: CLINIC,
    })
    .returning();
  actorId = user!.id;
  const [category] = await db
    .insert(serviceCategories)
    .values({ clinicId: CLINIC, name: "Categoria", slug: "categoria" })
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
  const [patient] = await db
    .insert(patients)
    .values({
      clinicId: CLINIC,
      name: "Paciente Fictícia",
      nameNormalized: "paciente ficticia",
      phone: "+5500000000032",
    })
    .returning();
  serviceId = service!.id;
  patientId = patient!.id;
});

afterAll(async () => {
  await db.execute(sql`truncate table appointments cascade`);
  await removeExtraProfessionals();
  await endPools();
});

describe("team", () => {
  it("lists the team in order and marks the default one", async () => {
    const bia = await newProfessional({
      sortOrder: "0",
      registration: "CRM 1",
    });
    const team = await listProfessionals(CLINIC);
    // Same sort order: the older one comes first and stays the default.
    expect(team.map((p) => [p.id, p.isDefault])).toEqual([
      [first.id, true],
      [bia, false],
    ]);
    expect(team[1]).toMatchObject({
      name: "Bia Fictícia",
      registration: "CRM 1",
      isActive: true,
    });
    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, bia));
    expect(audit).toMatchObject({ action: "professional.created" });
    expect(JSON.stringify(audit!.changes)).not.toContain("Bia");
  });

  it("an inactive professional is neither listed for the agenda nor the default", async () => {
    const bia = await newProfessional({ sortOrder: "0" });
    await updateProfessional(
      CLINIC,
      first.id,
      values({ name: first.name, sortOrder: "5" }),
      actorId,
    );
    expect((await listActiveProfessionals(CLINIC))[0]!.id).toBe(bia);
    expect(
      await updateProfessional(
        CLINIC,
        first.id,
        values({ name: first.name, isActive: false }),
        actorId,
      ),
    ).toEqual({ ok: true, id: first.id });
    expect((await listActiveProfessionals(CLINIC)).map((p) => p.id)).toEqual([
      bia,
    ]);
  });

  it("refuses to deactivate the last active professional", async () => {
    const result = await updateProfessional(
      CLINIC,
      first.id,
      values({ name: first.name, isActive: false }),
      actorId,
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: { isActive: LAST_ACTIVE },
    });
  });

  it("refuses to deactivate a professional with upcoming appointments", async () => {
    const bia = await newProfessional();
    await created({ professionalId: bia, date: "2099-01-05" });
    const result = await updateProfessional(
      CLINIC,
      bia,
      values({ isActive: false }),
      actorId,
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: { isActive: HAS_UPCOMING },
    });
  });

  it("never changes another clinic's professional", async () => {
    const clinicB = await otherClinic("equipe-outra-clinica");
    const foreign = await defaultProfessional(clinicB);
    const result = await updateProfessional(
      CLINIC,
      foreign.id,
      values({ name: "Trocado" }),
      actorId,
    );
    expect(result.ok).toBe(false);
    expect((await defaultProfessional(clinicB)).name).toBe(foreign.name);
  });
});

describe("agenda per professional", () => {
  it("without a choice, an appointment goes to the default professional", async () => {
    const id = await created();
    expect(await getAppointment(CLINIC, id, NOW)).toMatchObject({
      professionalId: first.id,
      professionalName: first.name,
    });
  });

  it("two professionals may see patients at the same time; one may not", async () => {
    const bia = await newProfessional();
    await created();
    await created({ professionalId: bia });
    const clash = await createAppointment(
      CLINIC,
      form({ professionalId: bia, startTime: "10:30" }),
      actorId,
      NOW,
    );
    expect(clash).toMatchObject({ ok: false });
    expect((clash as { formError?: string }).formError).toMatch(
      /^Este horário conflita com outro atendimento das 10:00 às 11:00\.$/,
    );
  });

  it("refuses an inactive professional or another clinic's", async () => {
    const bia = await newProfessional();
    await updateProfessional(CLINIC, bia, values({ isActive: false }), actorId);
    const clinicB = await otherClinic("equipe-outra-clinica");
    const foreign = await defaultProfessional(clinicB);
    for (const professionalId of [bia, foreign.id]) {
      expect(
        await createAppointment(CLINIC, form({ professionalId }), actorId, NOW),
      ).toEqual({
        ok: false,
        fieldErrors: {
          professionalId: "Escolha uma profissional ativa da equipe.",
        },
      });
    }
  });

  it("an edit moves the appointment to another professional's agenda", async () => {
    const bia = await newProfessional();
    const id = await created();
    // Bia is busy at 10:00, so the move is refused.
    const busy = await created({ professionalId: bia });
    const refused = await updateAppointment(
      CLINIC,
      id,
      form({ professionalId: bia }),
      actorId,
      NOW,
    );
    expect(refused).toMatchObject({ ok: false });

    await db.delete(appointments).where(eq(appointments.id, busy));
    expect(
      await updateAppointment(
        CLINIC,
        id,
        form({ professionalId: bia }),
        actorId,
        NOW,
      ),
    ).toEqual({ ok: true, id });
    expect((await getAppointment(CLINIC, id, NOW))!.professionalId).toBe(bia);

    // An edit without a choice keeps her.
    await updateAppointment(
      CLINIC,
      id,
      form({ startTime: "11:00" }),
      actorId,
      NOW,
    );
    expect((await getAppointment(CLINIC, id, NOW))!.professionalId).toBe(bia);
    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.entityId, id),
          eq(auditLogs.action, "appointment.updated"),
        ),
      );
    expect(audit!.changes).toMatchObject({
      fromProfessionalId: first.id,
      toProfessionalId: bia,
    });
  });

  it("dragging checks only the same professional's agenda", async () => {
    const bia = await newProfessional();
    await created({ professionalId: bia, startTime: "11:00" });
    const id = await created();
    expect(
      await rescheduleAppointment(
        CLINIC,
        id,
        {
          startsAt: new Date("2026-11-10T14:00:00Z"),
          endsAt: new Date("2026-11-10T15:00:00Z"),
          acknowledgeWarnings: true,
        },
        actorId,
        NOW,
      ),
    ).toEqual({ ok: true, id });
  });
});
