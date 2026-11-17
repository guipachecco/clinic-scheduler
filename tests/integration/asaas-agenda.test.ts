import { and, asc, eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { db, endPools } from "@/db/owner";
import {
  appointments,
  asaasAccounts,
  asaasDeposits,
  auditLogs,
  clinics,
  installments,
  paymentMethods,
  patients,
  payments,
  quoteItems,
  quotes,
  saleItems,
  saleRevisions,
  sales,
  serviceCategories,
  services,
  users,
} from "@/db/schema";
import { env } from "@/lib/env";
import { handleDepositNotification } from "@/modules/asaas/deposits";
import {
  changeAppointmentStatus,
  countRequestedFrom,
  getAppointment,
  listAppointmentsInRange,
  listRequestedFrom,
  rescheduleAppointment,
} from "@/modules/appointments/appointments";
import { findSessionInstallment } from "@/modules/finance/sales";
import { encryptToken, tokenKey } from "@/modules/mercado-pago/crypto";

import { otherClinic } from "../helpers/clinic";

// The panel agenda with Pix deposits, against a fake Asaas: nothing leaves
// the machine. A clinic of its own, every record fictitious.

const SLUG = "clinica-sinal-agenda";
const EMAIL = "admin-sinal-agenda@example.com";
const NOW = new Date("2033-03-01T12:00:00Z");
const MINUTE = 60_000;
// Monday 2033-03-07, 09:00-10:00 in São Paulo (-03:00).
const STARTS_AT = new Date("2033-03-07T12:00:00Z");
const ENDS_AT = new Date("2033-03-07T13:00:00Z");

let clinicId: string;
let serviceId: string;
let patientId: string;
let actorId: string;

function fakeAsaas() {
  const charges = new Map<string, { status: string; ref: string }>();
  const calls: { method: string; path: string }[] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push({ method, path: url.pathname });
    const match = /\/payments\/([^/]+)$/.exec(url.pathname);
    const charge = match ? charges.get(match[1]!) : undefined;
    if (!match || !charge)
      return json({ errors: [{ code: "not_found" }] }, 404);
    if (method === "DELETE") {
      charges.delete(match[1]!);
      return json({ deleted: true, id: match[1] });
    }
    return json({
      id: match[1],
      status: charge.status,
      value: 12,
      externalReference: charge.ref,
    });
  }) as typeof fetch;
  const deletes = () => calls.filter((c) => c.method === "DELETE");
  return { fetchImpl, charges, calls, deletes };
}

async function clearAgenda() {
  await db.delete(asaasDeposits).where(eq(asaasDeposits.clinicId, clinicId));
  await db.delete(payments).where(eq(payments.clinicId, clinicId));
  await db.delete(installments).where(eq(installments.clinicId, clinicId));
  await db.delete(saleRevisions).where(eq(saleRevisions.clinicId, clinicId));
  await db.delete(saleItems).where(eq(saleItems.clinicId, clinicId));
  await db.delete(sales).where(eq(sales.clinicId, clinicId));
  await db.delete(quoteItems).where(eq(quoteItems.clinicId, clinicId));
  await db.delete(quotes).where(eq(quotes.clinicId, clinicId));
  await db.delete(auditLogs).where(eq(auditLogs.clinicId, clinicId));
  await db.delete(appointments).where(eq(appointments.clinicId, clinicId));
}

async function cleanup() {
  const [existing] = await db
    .select({ id: clinics.id })
    .from(clinics)
    .where(eq(clinics.slug, SLUG));
  if (!existing) return;
  clinicId = existing.id;
  await clearAgenda();
  await db.delete(users).where(eq(users.email, EMAIL));
  await db.delete(asaasAccounts).where(eq(asaasAccounts.clinicId, clinicId));
  await db.delete(paymentMethods).where(eq(paymentMethods.clinicId, clinicId));
  await db.delete(patients).where(eq(patients.clinicId, clinicId));
  await db.delete(services).where(eq(services.clinicId, clinicId));
  await db
    .delete(serviceCategories)
    .where(eq(serviceCategories.clinicId, clinicId));
}

// A held online booking with its pending deposit, as bookOnline leaves it.
async function hold(
  appointment: Partial<typeof appointments.$inferInsert> = {},
) {
  const [row] = await db
    .insert(appointments)
    .values({
      clinicId,
      patientId,
      serviceId,
      serviceName: "Serviço com sinal fictício",
      serviceDurationMinutes: 60,
      startsAt: STARTS_AT,
      endsAt: ENDS_AT,
      occupiedFrom: STARTS_AT,
      occupiedUntil: ENDS_AT,
      status: "requested",
      source: "online",
      ...appointment,
    })
    .returning({ id: appointments.id });
  const [deposit] = await db
    .insert(asaasDeposits)
    .values({
      clinicId,
      appointmentId: row!.id,
      patientId,
      amountCents: 1_200,
      chargeId: "pay-1",
      status: "pending",
      expiresAt: new Date(NOW.getTime() + 30 * MINUTE),
    })
    .returning({ id: asaasDeposits.id });
  return { appointmentId: row!.id, depositId: deposit!.id };
}

// A held booking whose Pix arrived: confirmed, with the deposit sale.
async function paidHold() {
  const asaas = fakeAsaas();
  const held = await hold();
  asaas.charges.set("pay-1", { status: "RECEIVED", ref: held.depositId });
  expect(
    await handleDepositNotification(held.depositId, "pay-1", asaas.fetchImpl),
  ).toBe("paid");
  return held;
}

async function deposit(id: string) {
  const [row] = await db
    .select()
    .from(asaasDeposits)
    .where(eq(asaasDeposits.id, id));
  return row!;
}

async function saleParts(saleId: string) {
  return db
    .select()
    .from(installments)
    .where(eq(installments.saleId, saleId))
    .orderBy(asc(installments.number));
}

beforeAll(async () => {
  await cleanup();
  clinicId = await otherClinic(SLUG);
  const [category] = await db
    .insert(serviceCategories)
    .values({ clinicId, name: "Categoria agenda", slug: "categoria-agenda" })
    .returning({ id: serviceCategories.id });
  const [service] = await db
    .insert(services)
    .values({
      clinicId,
      categoryId: category!.id,
      name: "Serviço com sinal fictício",
      slug: "servico-com-sinal-agenda",
      durationMinutes: 60,
      isActive: true,
      onlineBookingEnabled: true,
      priceCents: 8_000,
      priceDisplay: "fixed",
    })
    .returning({ id: services.id });
  serviceId = service!.id;
  const [patient] = await db
    .insert(patients)
    .values({
      clinicId,
      name: "Paciente Agenda Fictícia",
      nameNormalized: "paciente agenda ficticia",
      phone: "+5511900004601",
    })
    .returning({ id: patients.id });
  patientId = patient!.id;
  const [user] = await db
    .insert(users)
    .values({ name: "Admin", email: EMAIL, role: "admin", clinicId })
    .returning({ id: users.id });
  actorId = user!.id;
  await db.insert(asaasAccounts).values({
    clinicId,
    accountId: "acc-agenda",
    walletId: "wal-agenda",
    apiKeyEnc: encryptToken(
      "sub-key",
      tokenKey(env.BETTER_AUTH_SECRET, "asaas-api-keys"),
    ),
    status: "approved",
    pixKeyReady: true,
    depositEnabled: true,
  });
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await clearAgenda();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  vi.useRealTimers();
  await cleanup();
  await endPools();
});

describe("panel agenda with deposits", () => {
  it("detail shows deposit paid 1200 and outstanding 6800", async () => {
    const { appointmentId } = await paidHold();
    const record = await getAppointment(clinicId, appointmentId, NOW);
    expect(record?.status).toBe("confirmed");
    expect(record?.deposit).toEqual({
      status: "paid",
      amountCents: 1_200,
      expiresAt: new Date(NOW.getTime() + 30 * MINUTE),
    });
    expect(await findSessionInstallment(clinicId, appointmentId)).toMatchObject(
      { outstandingCents: 6_800 },
    );
  });

  it("pending deposit does not appear in requested list/count", async () => {
    const { appointmentId: held } = await hold();
    // An ordinary request waiting for the owner, the next day.
    const [plain] = await db
      .insert(appointments)
      .values({
        clinicId,
        patientId,
        serviceId,
        serviceName: "Serviço com sinal fictício",
        serviceDurationMinutes: 60,
        startsAt: new Date(STARTS_AT.getTime() + 24 * 60 * MINUTE),
        endsAt: new Date(ENDS_AT.getTime() + 24 * 60 * MINUTE),
        occupiedFrom: new Date(STARTS_AT.getTime() + 24 * 60 * MINUTE),
        occupiedUntil: new Date(ENDS_AT.getTime() + 24 * 60 * MINUTE),
        status: "requested",
        source: "online",
      })
      .returning({ id: appointments.id });

    const requested = await listRequestedFrom(clinicId, NOW);
    expect(requested.map((item) => item.id)).toEqual([plain!.id]);
    expect(await countRequestedFrom(clinicId, NOW)).toBe(1);

    // The calendar still shows it, as waiting for the deposit.
    const events = await listAppointmentsInRange(
      clinicId,
      {
        from: new Date("2033-03-07T03:00:00Z"),
        to: new Date("2033-03-09T03:00:00Z"),
        includeCancelled: false,
      },
      new Date(NOW.getTime() + 10.5 * MINUTE),
    );
    expect(events.find((e) => e.id === held)).toMatchObject({
      status: "requested",
      depositMinutesLeft: 20,
    });
    expect(events.find((e) => e.id === plain!.id)).not.toHaveProperty(
      "depositMinutesLeft",
    );
    expect((await getAppointment(clinicId, held, NOW))?.deposit).toMatchObject({
      status: "pending",
      amountCents: 1_200,
    });
  });

  it("reschedule moves the remaining installment due date", async () => {
    const { appointmentId, depositId } = await paidHold();
    const result = await rescheduleAppointment(
      clinicId,
      appointmentId,
      {
        // Wednesday 2033-03-09, 09:00 in São Paulo.
        startsAt: new Date("2033-03-09T12:00:00Z"),
        endsAt: new Date("2033-03-09T13:00:00Z"),
        acknowledgeWarnings: true,
      },
      actorId,
      NOW,
    );
    expect(result).toEqual({ ok: true, id: appointmentId });
    const row = await deposit(depositId);
    const parts = await saleParts(row.saleId!);
    expect(parts.map((part) => part.dueDate)).toEqual([
      "2033-03-01",
      "2033-03-09",
    ]);
    expect(row).toMatchObject({ status: "paid", amountCents: 1_200 });
  });

  it("no_show keeps the deposit and cancels the remaining installment", async () => {
    const { appointmentId, depositId } = await paidHold();
    const before = await deposit(depositId);
    const afterStart = new Date(STARTS_AT.getTime() + 90 * MINUTE);
    vi.setSystemTime(afterStart);
    expect(
      await changeAppointmentStatus(
        clinicId,
        appointmentId,
        { to: "no_show" },
        actorId,
        afterStart,
      ),
    ).toEqual({ ok: true, id: appointmentId });

    const row = await deposit(depositId);
    expect(row).toMatchObject({
      status: "kept",
      paymentId: before.paymentId,
      saleId: before.saleId,
    });
    const parts = await saleParts(row.saleId!);
    expect(parts[0]!.cancelledAt).toBeNull();
    expect(parts[1]!.cancelledAt).not.toBeNull();
    const [sale] = await db
      .select()
      .from(sales)
      .where(eq(sales.id, row.saleId!));
    expect(sale!.cancelledAt).toBeNull();
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, row.paymentId!));
    expect(payment!.reversedAt).toBeNull();
    expect(await findSessionInstallment(clinicId, appointmentId)).toBeNull();

    // Corrected to completed: the rest is owed again.
    expect(
      await changeAppointmentStatus(
        clinicId,
        appointmentId,
        { to: "completed" },
        actorId,
        afterStart,
      ),
    ).toEqual({ ok: true, id: appointmentId });
    expect((await deposit(depositId)).status).toBe("paid");
    expect(await findSessionInstallment(clinicId, appointmentId)).toMatchObject(
      { outstandingCents: 6_800 },
    );
  });

  it("manual confirm closes the pending deposit and deletes the charge", async () => {
    const asaas = fakeAsaas();
    vi.stubGlobal("fetch", asaas.fetchImpl);
    const { appointmentId, depositId } = await hold();
    asaas.charges.set("pay-1", { status: "PENDING", ref: depositId });

    expect(
      await changeAppointmentStatus(
        clinicId,
        appointmentId,
        { to: "confirmed" },
        actorId,
        NOW,
        asaas.fetchImpl,
      ),
    ).toEqual({ ok: true, id: appointmentId });

    const [booked] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, appointmentId));
    expect(booked!.status).toBe("confirmed");
    expect(await deposit(depositId)).toMatchObject({
      status: "closed",
      closeReason: "manual_confirm",
      paymentId: null,
      saleId: null,
    });
    expect(asaas.deletes()).toEqual([
      { method: "DELETE", path: "/v3/payments/pay-1" },
    ]);
    expect(
      await db.select().from(sales).where(eq(sales.clinicId, clinicId)),
    ).toEqual([]);
    expect(
      await db
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.clinicId, clinicId),
            eq(auditLogs.action, "appointment.status_changed"),
          ),
        ),
    ).toHaveLength(1);
  });

  it("a failed charge deletion does not undo the manual confirm", async () => {
    const { appointmentId, depositId } = await hold();
    const failing = (async () =>
      new Response("{}", { status: 503 })) as typeof fetch;
    expect(
      await changeAppointmentStatus(
        clinicId,
        appointmentId,
        { to: "confirmed" },
        actorId,
        NOW,
        failing,
      ),
    ).toEqual({ ok: true, id: appointmentId });
    expect(await deposit(depositId)).toMatchObject({
      status: "closed",
      closeReason: "manual_confirm",
    });
  });
});
