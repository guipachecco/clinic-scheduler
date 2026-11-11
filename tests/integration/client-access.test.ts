import { eq, inArray, like, or, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asClient, clientDb } from "@/db/client";
import { db, endPools } from "@/db/owner";
import { findPgError } from "@/db/errors";
import {
  anamneses,
  appointments,
  auditLogs,
  clinics,
  patients,
  serviceCategories,
  services,
  timeBlocks,
  users,
} from "@/db/schema";
import {
  getClientContext,
  getPublicClinic,
  registerClientPatient,
} from "@/modules/clients/context";
import { normalizeName } from "@/modules/patients/fields";
import { anonymizePatient } from "@/modules/patients/patients";

import { CLINIC, otherClinic } from "../helpers/clinic";

// What app_client, the role of the client booking area, may reach: her own
// patient row and appointments, the clinic's public data, and the definer
// functions. Every record is fictitious. The e-mails end in
// @acesso-cliente.example.test so the cleanup never touches other files' rows.

const DOMAIN = "@acesso-cliente.example.test";
const MINUTE = 60_000;
const SLUG_B = "clinica-acesso-cliente";

let clinicB: string;
let categoryId: string;
let serviceId: string;
const user: Record<"ana" | "bia" | "carla" | "dora", string> = {
  ana: "",
  bia: "",
  carla: "",
  dora: "",
};
let patientAna: string;
let patientBia: string;
let patientCarla: string;
let existingPatient: string;
let appointmentAna: string;
let appointmentBia: string;
let onlineBefore: boolean;

const at = (iso: string) => new Date(iso);
const ctx = (who: "ana" | "bia", patientId: string) => ({
  clinicId: CLINIC,
  patientId,
  userId: user[who],
});

async function pgErrorCode(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return findPgError(error)?.code;
  }
  return "no error";
}

async function setOnlineBooking(clinicId: string, enabled: boolean) {
  await db
    .update(clinics)
    .set({ onlineBookingEnabled: enabled })
    .where(eq(clinics.id, clinicId));
}

async function createUser(local: string) {
  const [row] = await db
    .insert(users)
    .values({
      name: `Cliente ${local}`,
      email: `${local}${DOMAIN}`,
      role: "client",
      clinicId: null,
    })
    .returning({ id: users.id });
  return row!.id;
}

function appointmentValues(
  patientId: string,
  start: string,
  extra: Partial<typeof appointments.$inferInsert> = {},
): typeof appointments.$inferInsert {
  const startsAt = at(start);
  const endsAt = new Date(startsAt.getTime() + 60 * MINUTE);
  return {
    clinicId: CLINIC,
    patientId,
    serviceId,
    serviceName: "Serviço fictício online",
    serviceDurationMinutes: 60,
    startsAt,
    endsAt,
    occupiedFrom: new Date(startsAt.getTime() - 10 * MINUTE),
    occupiedUntil: new Date(endsAt.getTime() + 15 * MINUTE),
    status: "confirmed",
    source: "online",
    confirmedAt: new Date(),
    ...extra,
  };
}

async function cleanup() {
  const ids = (
    await db
      .select({ id: users.id })
      .from(users)
      .where(like(users.email, `%${DOMAIN}`))
  ).map((row) => row.id);
  const patientIds = (
    await db
      .select({ id: patients.id })
      .from(patients)
      .where(like(patients.name, "%Acesso Cliente%"))
  ).map((row) => row.id);
  if (patientIds.length > 0) {
    await db
      .delete(appointments)
      .where(inArray(appointments.patientId, patientIds));
    // Provisional records first: they reference the matched patient.
    await db
      .delete(patients)
      .where(
        sql`${patients.id} in ${patientIds} and ${patients.pendingLinkPatientId} is not null`,
      );
    await db.delete(patients).where(inArray(patients.id, patientIds));
  }
  if (ids.length > 0) {
    await db.delete(auditLogs).where(inArray(auditLogs.actorUserId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }
  await db
    .delete(timeBlocks)
    .where(eq(timeBlocks.title, "Bloqueio acesso cliente"));
  await db
    .delete(services)
    .where(like(services.slug, "servico-acesso-cliente%"));
  await db
    .delete(serviceCategories)
    .where(eq(serviceCategories.slug, "categoria-acesso-cliente"));
}

beforeAll(async () => {
  await cleanup();
  const [grais] = await db
    .select({ online: clinics.onlineBookingEnabled })
    .from(clinics)
    .where(eq(clinics.id, CLINIC));
  onlineBefore = grais!.online;
  clinicB = await otherClinic(SLUG_B);
  for (const who of Object.keys(user) as (keyof typeof user)[]) {
    user[who] = await createUser(who);
  }

  const [category] = await db
    .insert(serviceCategories)
    .values({
      clinicId: CLINIC,
      name: "Categoria acesso cliente",
      slug: "categoria-acesso-cliente",
    })
    .returning({ id: serviceCategories.id });
  categoryId = category!.id;
  const [service] = await db
    .insert(services)
    .values({
      clinicId: CLINIC,
      categoryId,
      name: "Serviço fictício online",
      slug: "servico-acesso-cliente",
      durationMinutes: 60,
      bufferBeforeMinutes: 10,
      bufferAfterMinutes: 15,
      isActive: true,
      onlineBookingEnabled: true,
    })
    .returning({ id: services.id });
  serviceId = service!.id;

  patientAna = await registerClientPatient({
    clinicId: CLINIC,
    userId: user.ana,
    name: "Ana Acesso Cliente",
    phone: "+5511900002201",
    email: `ana${DOMAIN}`,
  });
  patientBia = await registerClientPatient({
    clinicId: CLINIC,
    userId: user.bia,
    name: "Bia Acesso Cliente",
    phone: "+5511900002202",
    email: null,
  });
  patientCarla = await registerClientPatient({
    clinicId: clinicB,
    userId: user.carla,
    name: "Carla Acesso Cliente",
    phone: "+5511900002203",
    email: null,
  });

  const [a] = await db
    .insert(appointments)
    .values(appointmentValues(patientAna, "2033-03-10T13:00:00Z"))
    .returning({ id: appointments.id });
  const [b] = await db
    .insert(appointments)
    .values(appointmentValues(patientBia, "2033-03-10T15:00:00Z"))
    .returning({ id: appointments.id });
  appointmentAna = a!.id;
  appointmentBia = b!.id;

  const [block] = await db
    .insert(timeBlocks)
    .values({
      clinicId: CLINIC,
      type: "other",
      title: "Bloqueio acesso cliente",
      startsAt: at("2033-03-10T18:00:00Z"),
      endsAt: at("2033-03-10T19:00:00Z"),
    })
    .returning({ id: timeBlocks.id });
  expect(block).toBeTruthy();
});

afterAll(async () => {
  await setOnlineBooking(CLINIC, onlineBefore);
  await cleanup();
  await endPools();
});

describe("client access", () => {
  it("client reads only her own patient row", async () => {
    const seen = await asClient(ctx("ana", patientAna), (tx) =>
      tx
        .select({ id: patients.id })
        .from(patients)
        .where(inArray(patients.id, [patientAna, patientBia, patientCarla])),
    );
    expect(seen).toEqual([{ id: patientAna }]);
  });

  it("client cannot read the clinic's private patient fields", async () => {
    const own = await asClient(ctx("ana", patientAna), (tx) =>
      tx.select({ name: patients.name, phone: patients.phone }).from(patients),
    );
    expect(own).toEqual([
      { name: "Ana Acesso Cliente", phone: "+5511900002201" },
    ]);
    for (const column of ["notes", "cpf", "rg", "referral_source"]) {
      const code = await pgErrorCode(
        asClient(ctx("ana", patientAna), (tx) =>
          tx.execute(sql`select ${sql.identifier(column)} from patients`),
        ),
      );
      expect(code, column).toBe("42501");
    }
  });

  it("client reads only her own appointments", async () => {
    const seen = await asClient(ctx("ana", patientAna), (tx) =>
      tx
        .select({ id: appointments.id })
        .from(appointments)
        .where(inArray(appointments.id, [appointmentAna, appointmentBia])),
    );
    expect(seen).toEqual([{ id: appointmentAna }]);

    // Without the settings she sees nothing.
    expect(
      await clientDb.select({ id: appointments.id }).from(appointments),
    ).toEqual([]);
  });

  it("client cannot read the owner's columns of her appointments", async () => {
    for (const column of [
      "cancellation_reason",
      "custom_label",
      "manage_token_hash",
      "idempotency_key",
      "cancelled_by",
    ]) {
      const code = await pgErrorCode(
        asClient(ctx("ana", patientAna), (tx) =>
          tx.execute(sql`select ${sql.identifier(column)} from appointments`),
        ),
      );
      expect(code, column).toBe("42501");
    }
    // select * needs every column.
    const all = await pgErrorCode(
      asClient(ctx("ana", patientAna), (tx) =>
        tx.execute(sql`select * from appointments`),
      ),
    );
    expect(all).toBe("42501");
  });

  it("client is denied finance tables", async () => {
    for (const table of ["sales", "payments", "expenses"]) {
      const code = await pgErrorCode(
        asClient(ctx("ana", patientAna), (tx) =>
          tx.execute(sql`select 1 from ${sql.identifier(table)}`),
        ),
      );
      expect(code, table).toBe("42501");
    }
  });

  it("client cannot read anamneses", async () => {
    const code = await pgErrorCode(
      asClient(ctx("ana", patientAna), (tx) => tx.select().from(anamneses)),
    );
    expect(code).toBe("42501");
  });

  it("client cannot update or delete appointments", async () => {
    const update = await pgErrorCode(
      asClient(ctx("ana", patientAna), (tx) =>
        tx
          .update(appointments)
          .set({ customLabel: null })
          .where(eq(appointments.id, appointmentAna)),
      ),
    );
    expect(update).toBe("42501");
    const remove = await pgErrorCode(
      asClient(ctx("ana", patientAna), (tx) =>
        tx.delete(appointments).where(eq(appointments.id, appointmentAna)),
      ),
    );
    expect(remove).toBe("42501");
  });

  it("client cannot insert for another patient or as requested", async () => {
    const forBia = await pgErrorCode(
      asClient(ctx("ana", patientAna), (tx) =>
        tx
          .insert(appointments)
          .values(appointmentValues(patientBia, "2033-03-11T13:00:00Z")),
      ),
    );
    expect(forBia).toBe("42501");
    const requested = await pgErrorCode(
      asClient(ctx("ana", patientAna), (tx) =>
        tx.insert(appointments).values(
          appointmentValues(patientAna, "2033-03-11T13:00:00Z", {
            status: "requested",
            confirmedAt: null,
          }),
        ),
      ),
    );
    expect(requested).toBe("42501");
    const fromPanel = await pgErrorCode(
      asClient(ctx("ana", patientAna), (tx) =>
        tx.insert(appointments).values(
          appointmentValues(patientAna, "2033-03-11T13:00:00Z", {
            source: "admin",
          }),
        ),
      ),
    );
    expect(fromPanel).toBe("42501");

    // Her own confirmed online booking and its audit row go through.
    const id = await asClient(ctx("ana", patientAna), async (tx) => {
      const [row] = await tx
        .insert(appointments)
        .values(appointmentValues(patientAna, "2033-03-11T13:00:00Z"))
        .returning({ id: appointments.id });
      await tx.insert(auditLogs).values({
        clinicId: CLINIC,
        actorType: "patient",
        actorUserId: user.ana,
        action: "appointment.created",
        entityType: "appointment",
        entityId: row!.id,
      });
      return row!.id;
    });
    expect(id).toBeTruthy();

    // An audit row as admin, for another clinic or another user is refused.
    for (const values of [
      { clinicId: CLINIC, actorType: "admin" as const, actorUserId: user.ana },
      {
        clinicId: clinicB,
        actorType: "patient" as const,
        actorUserId: user.ana,
      },
      {
        clinicId: CLINIC,
        actorType: "patient" as const,
        actorUserId: user.bia,
      },
    ]) {
      const code = await pgErrorCode(
        asClient(ctx("ana", patientAna), (tx) =>
          tx.insert(auditLogs).values({
            ...values,
            action: "appointment.created",
            entityType: "appointment",
          }),
        ),
      );
      expect(code).toBe("42501");
    }
  });

  it("client reads only bookable services and the public clinic columns", async () => {
    const seen = await asClient(ctx("ana", patientAna), (tx) =>
      tx
        .select({ id: services.id })
        .from(services)
        .where(eq(services.id, serviceId)),
    );
    expect(seen).toEqual([{ id: serviceId }]);

    await db
      .update(services)
      .set({ onlineBookingEnabled: false })
      .where(eq(services.id, serviceId));
    try {
      const hidden = await asClient(ctx("ana", patientAna), (tx) =>
        tx
          .select({ id: services.id })
          .from(services)
          .where(eq(services.id, serviceId)),
      );
      expect(hidden).toEqual([]);
    } finally {
      await db
        .update(services)
        .set({ onlineBookingEnabled: true })
        .where(eq(services.id, serviceId));
    }

    // A service whose category is inactive is not bookable either.
    await db
      .update(serviceCategories)
      .set({ isActive: false })
      .where(eq(serviceCategories.id, categoryId));
    try {
      const hidden = await asClient(ctx("ana", patientAna), (tx) =>
        tx
          .select({ id: services.id })
          .from(services)
          .where(eq(services.id, serviceId)),
      );
      expect(hidden).toEqual([]);
    } finally {
      await db
        .update(serviceCategories)
        .set({ isActive: true })
        .where(eq(serviceCategories.id, categoryId));
    }

    const clinic = await asClient(ctx("ana", patientAna), (tx) =>
      tx.select({ id: clinics.id }).from(clinics),
    );
    expect(clinic).toEqual([{ id: CLINIC }]);
    const privateColumn = await pgErrorCode(
      asClient(ctx("ana", patientAna), (tx) =>
        tx.select({ draft: clinics.pageDraft }).from(clinics),
      ),
    );
    expect(privateColumn).toBe("42501");
  });

  it("busy intervals are empty while online booking is off", async () => {
    const busy = () =>
      clientDb.execute(
        sql`select * from client_busy_intervals(${CLINIC}, ${"2033-03-10T00:00:00Z"}, ${"2033-03-11T00:00:00Z"})`,
      );
    await setOnlineBooking(CLINIC, false);
    expect((await busy()).rows).toEqual([]);
    await setOnlineBooking(CLINIC, true);
    expect((await busy()).rows.length).toBeGreaterThan(0);
  });

  it("client inserts only for a bookable service", async () => {
    const [offline] = await db
      .insert(services)
      .values({
        clinicId: CLINIC,
        categoryId,
        name: "Serviço fictício fora do online",
        slug: "servico-acesso-cliente-fora",
        durationMinutes: 60,
        isActive: true,
        onlineBookingEnabled: false,
      })
      .returning({ id: services.id });
    try {
      const cases: Array<{
        label: string;
        values: Partial<typeof services.$inferInsert>;
      }> = [
        { label: "offline", values: {} },
        {
          label: "inactive",
          values: { onlineBookingEnabled: true, isActive: false },
        },
        {
          label: "flexible",
          values: { onlineBookingEnabled: true, isFlexible: true },
        },
      ];
      for (const { label, values } of cases) {
        await db
          .update(services)
          .set({
            onlineBookingEnabled: false,
            isActive: true,
            isFlexible: false,
            ...values,
          })
          .where(eq(services.id, offline!.id));
        const code = await pgErrorCode(
          asClient(ctx("ana", patientAna), (tx) =>
            tx.insert(appointments).values(
              appointmentValues(patientAna, "2033-03-12T13:00:00Z", {
                serviceId: offline!.id,
                ...(label === "flexible" ? { customLabel: "Rótulo" } : {}),
              }),
            ),
          ),
        );
        expect(code, label).toBe("42501");
      }

      // A service in an inactive category is refused too.
      await db
        .update(serviceCategories)
        .set({ isActive: false })
        .where(eq(serviceCategories.id, categoryId));
      try {
        const code = await pgErrorCode(
          asClient(ctx("ana", patientAna), (tx) =>
            tx
              .insert(appointments)
              .values(appointmentValues(patientAna, "2033-03-12T13:00:00Z")),
          ),
        );
        expect(code).toBe("42501");
      } finally {
        await db
          .update(serviceCategories)
          .set({ isActive: true })
          .where(eq(serviceCategories.id, categoryId));
      }
    } finally {
      await db.delete(services).where(eq(services.id, offline!.id));
    }
  });

  it("busy intervals carry no names", async () => {
    await setOnlineBooking(CLINIC, true);
    const result = await clientDb.execute(
      sql`select * from client_busy_intervals(${CLINIC}, ${"2033-03-10T00:00:00Z"}, ${"2033-03-11T00:00:00Z"})`,
    );
    expect(result.fields.map((field) => field.name)).toEqual([
      "starts_at",
      "ends_at",
    ]);
    const intervals = result.rows.map((row) => [
      new Date(row.starts_at as string).toISOString(),
      new Date(row.ends_at as string).toISOString(),
    ]);
    // Bia's appointment, with the service's 10 and 15 minute buffers.
    expect(intervals).toContainEqual([
      "2033-03-10T14:50:00.000Z",
      "2033-03-10T16:15:00.000Z",
    ]);
    // The time block.
    expect(intervals).toContainEqual([
      "2033-03-10T18:00:00.000Z",
      "2033-03-10T19:00:00.000Z",
    ]);

    // Another clinic's agenda is empty for that day.
    const other = await clientDb.execute(
      sql`select * from client_busy_intervals(${clinicB}, ${"2033-03-10T00:00:00Z"}, ${"2033-03-11T00:00:00Z"})`,
    );
    expect(other.rows).toEqual([]);

    const hours = await clientDb.execute(
      sql`select * from client_business_hours(${CLINIC})`,
    );
    expect(hours.fields.map((field) => field.name)).toEqual([
      "weekday",
      "opens",
      "closes",
    ]);
  });

  it("context for another clinic's slug has no patient", async () => {
    const own = await getClientContext("grais", user.ana);
    expect(own).toMatchObject({
      clinic: { id: CLINIC, slug: "grais" },
      patientId: patientAna,
      pending: false,
    });
    expect(Object.keys(own!.clinic).sort()).toEqual(
      [
        "address",
        "contactEmail",
        "displayName",
        "id",
        "mapsUrl",
        "maxActiveAppointmentsPerPhone",
        "maxAdvanceDays",
        "minAdvanceMinutes",
        "name",
        "onlineBookingEnabled",
        "slotStepMinutes",
        "slug",
        "timezone",
        "whatsappPhone",
      ].sort(),
    );

    const other = await getClientContext(SLUG_B, user.ana);
    expect(other).toMatchObject({
      clinic: { id: clinicB, slug: SLUG_B },
      patientId: null,
      pending: false,
    });

    expect(await getClientContext("clinica-que-nao-existe", user.ana)).toBe(
      null,
    );
    expect(await getClientContext("grais", "nao-e-um-id")).toBe(null);
    // Signed-out visitors: only the clinic's public columns, never a record.
    expect(await getPublicClinic(SLUG_B)).toMatchObject({
      id: clinicB,
      slug: SLUG_B,
    });
    expect(await getPublicClinic("clinica-que-nao-existe")).toBe(null);
    expect(
      await getClientContext("grais", "00000000-0000-0000-0000-000000000000"),
    ).toBe(null);

    await db
      .update(clinics)
      .set({ isActive: false })
      .where(eq(clinics.id, clinicB));
    try {
      expect(await getClientContext(SLUG_B, user.carla)).toBe(null);
      expect(await getPublicClinic(SLUG_B)).toBe(null);
    } finally {
      await db
        .update(clinics)
        .set({ isActive: true })
        .where(eq(clinics.id, clinicB));
    }
  });

  it("same phone creates a pending provisional record", async () => {
    const [existing] = await db
      .insert(patients)
      .values({
        clinicId: CLINIC,
        name: "Dora Acesso Cliente",
        nameNormalized: "dora acesso cliente",
        phone: "+5511900002204",
        notes: "Anotação da clínica",
      })
      .returning({ id: patients.id });
    existingPatient = existing!.id;

    const name = "  Dóra   Acesso  Cliente ";
    const provisional = await registerClientPatient({
      clinicId: CLINIC,
      userId: user.dora,
      name,
      phone: "(11) 90000-2204",
      email: `dora${DOMAIN}`,
    });
    expect(provisional).not.toBe(existingPatient);

    const [row] = await db
      .select()
      .from(patients)
      .where(eq(patients.id, provisional));
    expect(row).toMatchObject({
      clinicId: CLINIC,
      userId: user.dora,
      name: "Dóra Acesso Cliente",
      nameNormalized: normalizeName(name),
      phone: "+5511900002204",
      email: `dora${DOMAIN}`,
      notes: null,
      pendingLinkPatientId: existingPatient,
    });

    const context = await getClientContext("grais", user.dora);
    expect(context).toMatchObject({ patientId: provisional, pending: true });

    // She sees only the provisional record, never the matched one.
    const seen = await asClient(
      { clinicId: CLINIC, patientId: provisional, userId: user.dora },
      (tx) =>
        tx
          .select({ id: patients.id })
          .from(patients)
          .where(
            or(eq(patients.id, provisional), eq(patients.id, existingPatient)),
          ),
    );
    expect(seen).toEqual([{ id: provisional }]);

    const again = await pgErrorCode(
      registerClientPatient({
        clinicId: CLINIC,
        userId: user.dora,
        name: "Dora de Novo Acesso Cliente",
        phone: "+5511900002299",
        email: null,
      }),
    );
    expect(again).toBe("P0001");
  });

  it("an anonymized patient with the phone is never matched", async () => {
    const [anonymized] = await db
      .insert(patients)
      .values({
        clinicId: CLINIC,
        name: "Paciente anonimizado Acesso Cliente",
        anonymizedAt: new Date(),
      })
      .returning({ id: patients.id });
    expect(anonymized).toBeTruthy();
    const otherUser = await createUser("eva");
    const id = await registerClientPatient({
      clinicId: CLINIC,
      userId: otherUser,
      name: "Eva Acesso Cliente",
      phone: "+5511900002205",
      email: null,
    });
    const [row] = await db
      .select({ pending: patients.pendingLinkPatientId })
      .from(patients)
      .where(eq(patients.id, id));
    expect(row).toEqual({ pending: null });
  });

  it("anonymizing a patient unlinks her account", async () => {
    const fia = await createUser("fia");
    const id = await registerClientPatient({
      clinicId: CLINIC,
      userId: fia,
      name: "Fia Acesso Cliente",
      phone: "+5511900002208",
      email: null,
    });
    expect((await getClientContext("grais", fia))?.patientId).toBe(id);

    expect(await anonymizePatient(CLINIC, id, fia)).toEqual({ ok: true });
    const [row] = await db
      .select({ userId: patients.userId })
      .from(patients)
      .where(eq(patients.id, id));
    expect(row).toEqual({ userId: null });
    expect(await getClientContext("grais", fia)).toMatchObject({
      patientId: null,
      pending: false,
    });

    // The database refuses an anonymized row tied to an account.
    const code = await pgErrorCode(
      db.update(patients).set({ userId: fia }).where(eq(patients.id, id)),
    );
    expect(code).toBe("23514");
    // Its name is now the anonymized label, out of reach of the cleanup.
    await db.delete(patients).where(eq(patients.id, id));
  });

  it("register refuses bad input and accounts that are not clients", async () => {
    const admin = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1);
    const cases = [
      { userId: user.ana, name: " ", phone: "+5511900002206" },
      { userId: user.ana, name: "Nome Acesso Cliente", phone: "123" },
      ...(admin[0]
        ? [{ userId: admin[0].id, name: "Nome", phone: "+5511900002207" }]
        : []),
    ];
    for (const input of cases) {
      const code = await pgErrorCode(
        registerClientPatient({ clinicId: clinicB, email: null, ...input }),
      );
      expect(code).toBe("22023");
    }
  });

  it("catalog: app_client privileges", async () => {
    const forbidden = [
      "quotes",
      "quote_items",
      "sales",
      "sale_items",
      "sale_revisions",
      "sale_sessions",
      "installments",
      "payments",
      "expenses",
      "expense_categories",
      "payment_methods",
      "audit_logs",
      "media",
      "clinic_photos",
      "reviews",
      "loyalty_redemptions",
      "users",
      "sessions",
      "accounts",
      "verifications",
      "two_factors",
      "rate_limits",
    ];
    const selectable = await db.execute<{ table_name: string }>(sql`
      select c.relname as table_name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in (${sql.join(
        forbidden.map((t) => sql`${t}`),
        sql`, `,
      )})
        and (has_table_privilege('app_client', c.oid, 'SELECT')
             or has_any_column_privilege('app_client', c.oid, 'SELECT'))
    `);
    expect(selectable.rows).toEqual([]);

    // Every table app_client reaches at all, and each has RLS.
    const reachable = await db.execute<{ table_name: string; rls: boolean }>(
      sql`
        select c.relname as table_name, c.relrowsecurity as rls
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r', 'p', 'v', 'm', 'f')
          and n.nspname not in ('pg_catalog', 'information_schema')
          and (has_table_privilege('app_client', c.oid,
                 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
               or has_any_column_privilege('app_client', c.oid,
                 'SELECT, INSERT, UPDATE, REFERENCES'))
        order by 1
      `,
    );
    expect(reachable.rows).toEqual(
      [
        "appointments",
        "audit_logs",
        "clinics",
        "patients",
        "products",
        "reviews",
        "service_categories",
        "services",
      ].map((table_name) => ({ table_name, rls: true })),
    );

    // The definer functions run for app_client only.
    const functions = await db.execute<{
      proname: string;
      secdef: boolean;
      client: boolean;
      panel: boolean;
      platform: boolean;
      auth: boolean;
    }>(sql`
      select p.proname, p.prosecdef as secdef,
             has_function_privilege('app_client', p.oid, 'EXECUTE') as client,
             has_function_privilege('app_panel', p.oid, 'EXECUTE') as panel,
             has_function_privilege('app_platform', p.oid, 'EXECUTE') as platform,
             has_function_privilege('app_auth', p.oid, 'EXECUTE') as auth
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'client\\_%'
         or p.proname = 'register_client_patient'
      order by 1
    `);
    expect(functions.rows).toEqual(
      [
        "client_business_hours",
        "client_busy_intervals",
        "client_clinic_cover",
        "client_clinic_logo",
        "client_clinic_photo",
        "client_clinic_photos",
        "client_context",
        "client_loyalty_progress",
        "client_my_clinics",
        "client_owner_photo",
        "client_payment_methods",
        "client_public_clinics",
        "client_public_reviews",
        "client_review_summary",
        "register_client_patient",
      ].map((proname) => ({
        proname,
        secdef: true,
        client: true,
        panel: false,
        platform: false,
        auth: false,
      })),
    );
  });
});
