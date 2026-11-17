import { and, asc, eq, inArray } from "drizzle-orm";
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

import { POST } from "@/app/api/webhooks/asaas/route";
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
} from "@/db/schema";
import { env } from "@/lib/env";
import { PIX_ONLINE_METHOD } from "@/modules/asaas/accounts";
import { handleDepositNotification } from "@/modules/asaas/deposits";
import {
  findSessionInstallment,
  getSale,
  listSales,
} from "@/modules/finance/sales";
import { encryptToken, tokenKey } from "@/modules/mercado-pago/crypto";

import { otherClinic, setPixDepositModule } from "../helpers/clinic";

// The Asaas webhook against a fake Asaas: nothing leaves the machine. A
// clinic of its own, every record fictitious.

const SLUG = "clinica-sinal-webhook";
const NOW = new Date("2033-03-01T12:00:00Z");
const MINUTE = 60_000;
// Monday 2033-03-07, 09:00-10:00 in São Paulo (-03:00).
const STARTS_AT = new Date("2033-03-07T12:00:00Z");
const ENDS_AT = new Date("2033-03-07T13:00:00Z");

let clinicId: string;
let serviceId: string;
let patientId: string;

type FakePayment = { status: string; value: number; externalReference: string };

function fakeAsaas() {
  const payments = new Map<string, FakePayment>();
  const calls: { method: string; path: string }[] = [];
  const state = {
    refundError: null as null | number,
    refundStatus: "REFUNDED",
    readError: null as null | number,
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push({ method, path: url.pathname });
    const refund = /\/payments\/([^/]+)\/refund$/.exec(url.pathname);
    if (refund && method === "POST") {
      const payment = payments.get(refund[1]!);
      if (!payment) return json({ errors: [{ code: "not_found" }] }, 404);
      if (state.refundError) {
        return json({ errors: [{ code: "refund_failed" }] }, state.refundError);
      }
      if (payment.status === "REFUNDED") {
        return json({ errors: [{ code: "invalid_action" }] }, 400);
      }
      payment.status = state.refundStatus;
      return json({ id: refund[1], ...payment });
    }
    const read = /\/payments\/([^/]+)$/.exec(url.pathname);
    if (read && method === "GET") {
      if (state.readError) {
        return json(
          { errors: [{ code: "invalid_access_token" }] },
          state.readError,
        );
      }
      const payment = payments.get(read[1]!);
      if (!payment) return json({ errors: [{ code: "not_found" }] }, 404);
      return json({ id: read[1], ...payment });
    }
    return json({ errors: [{ code: "not_found" }] }, 404);
  }) as typeof fetch;
  const refunds = () =>
    calls.filter((c) => c.method === "POST" && c.path.endsWith("/refund"));
  return { fetchImpl, payments, calls, state, refunds };
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
  await db.delete(asaasAccounts).where(eq(asaasAccounts.clinicId, clinicId));
  await db.delete(paymentMethods).where(eq(paymentMethods.clinicId, clinicId));
  await db.delete(patients).where(eq(patients.clinicId, clinicId));
  await db.delete(services).where(eq(services.clinicId, clinicId));
  await db
    .delete(serviceCategories)
    .where(eq(serviceCategories.clinicId, clinicId));
}

type HoldInput = {
  appointment?: Partial<typeof appointments.$inferInsert>;
  deposit?: Partial<typeof asaasDeposits.$inferInsert>;
};

// A held online booking with its deposit, as bookOnline leaves it.
async function hold(input: HoldInput = {}) {
  const [appointment] = await db
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
      ...input.appointment,
    })
    .returning({ id: appointments.id });
  const [deposit] = await db
    .insert(asaasDeposits)
    .values({
      clinicId,
      appointmentId: appointment!.id,
      patientId,
      amountCents: 1_200,
      chargeId: "pay-1",
      status: "pending",
      expiresAt: new Date(NOW.getTime() + 30 * MINUTE),
      ...input.deposit,
    })
    .returning({ id: asaasDeposits.id });
  return { appointmentId: appointment!.id, depositId: deposit!.id };
}

function paid(
  asaas: ReturnType<typeof fakeAsaas>,
  id: string,
  depositId: string,
  status = "RECEIVED",
) {
  asaas.payments.set(id, { status, value: 12, externalReference: depositId });
}

function webhook(
  body: unknown,
  token: string | null = env.ASAAS_WEBHOOK_TOKEN!,
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token !== null) headers["asaas-access-token"] = token;
  return new Request("http://localhost:3000/api/webhooks/asaas", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const notice = (paymentId: string, depositId: string) => ({
  id: "evt_ficticio",
  event: "PAYMENT_RECEIVED",
  payment: { id: paymentId, externalReference: depositId },
});

async function appointment(id: string) {
  const [row] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, id));
  return row!;
}

async function deposit(id: string) {
  const [row] = await db
    .select()
    .from(asaasDeposits)
    .where(eq(asaasDeposits.id, id));
  return row!;
}

async function clinicPayments() {
  return db
    .select({
      id: payments.id,
      amountCents: payments.amountCents,
      paidOn: payments.paidOn,
      notes: payments.notes,
      reversedAt: payments.reversedAt,
      method: paymentMethods.name,
      installmentId: payments.installmentId,
    })
    .from(payments)
    .innerJoin(paymentMethods, eq(payments.paymentMethodId, paymentMethods.id))
    .where(eq(payments.clinicId, clinicId));
}

async function autoRefunds() {
  return db
    .select({ changes: auditLogs.changes, entityId: auditLogs.entityId })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.clinicId, clinicId),
        eq(auditLogs.action, "asaas.deposit_auto_refunded"),
      ),
    );
}

beforeAll(async () => {
  await cleanup();
  clinicId = await otherClinic(SLUG);
  await setPixDepositModule(clinicId, true);
  const [category] = await db
    .insert(serviceCategories)
    .values({ clinicId, name: "Categoria webhook", slug: "categoria-webhook" })
    .returning({ id: serviceCategories.id });
  const [service] = await db
    .insert(services)
    .values({
      clinicId,
      categoryId: category!.id,
      name: "Serviço com sinal fictício",
      slug: "servico-com-sinal-webhook",
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
      name: "Paciente Webhook Fictícia",
      nameNormalized: "paciente webhook ficticia",
      phone: "+5511900004501",
    })
    .returning({ id: patients.id });
  patientId = patient!.id;
  await db.insert(asaasAccounts).values({
    clinicId,
    accountId: "acc-webhook",
    walletId: "wal-webhook",
    apiKeyEnc: encryptToken(
      "sub-key",
      tokenKey(env.BETTER_AUTH_SECRET, "asaas-api-keys"),
    ),
    status: "approved",
    pixKeyReady: true,
    depositEnabled: true,
  });
});

async function accountRow() {
  const [row] = await db
    .select()
    .from(asaasAccounts)
    .where(eq(asaasAccounts.clinicId, clinicId));
  return row!;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await clearAgenda();
  await db
    .update(asaasAccounts)
    .set({ depositEnabled: true, status: "approved", lastError: null })
    .where(eq(asaasAccounts.clinicId, clinicId));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  vi.useRealTimers();
  await cleanup();
  await endPools();
});

describe("Asaas webhook", () => {
  it("401 without the right token; 503 when not configured", async () => {
    const asaas = fakeAsaas();
    vi.stubGlobal("fetch", asaas.fetchImpl);
    const { depositId } = await hold();
    paid(asaas, "pay-1", depositId);

    expect((await POST(webhook(notice("pay-1", depositId), null))).status).toBe(
      401,
    );
    expect(
      (await POST(webhook(notice("pay-1", depositId), "token-errado"))).status,
    ).toBe(401);
    expect(asaas.calls).toEqual([]);

    const saved = env.ASAAS_WEBHOOK_TOKEN;
    (env as { ASAAS_WEBHOOK_TOKEN?: string }).ASAAS_WEBHOOK_TOKEN = undefined;
    try {
      expect((await POST(webhook(notice("pay-1", depositId)))).status).toBe(
        503,
      );
    } finally {
      (env as { ASAAS_WEBHOOK_TOKEN?: string }).ASAAS_WEBHOOK_TOKEN = saved;
    }
    expect((await deposit(depositId)).status).toBe("pending");
  });

  it("paid: appointment confirmed, sale with 2 installments, deposit payment with Pix online", async () => {
    const asaas = fakeAsaas();
    vi.stubGlobal("fetch", asaas.fetchImpl);
    const { appointmentId, depositId } = await hold();
    paid(asaas, "pay-1", depositId);

    const response = await POST(webhook(notice("pay-1", depositId)));
    expect(response.status).toBe(200);

    const booked = await appointment(appointmentId);
    expect(booked.status).toBe("confirmed");
    expect(booked.confirmedAt).not.toBeNull();

    const row = await deposit(depositId);
    expect(row).toMatchObject({ status: "paid", chargeId: "pay-1" });
    expect(row.paymentId).not.toBeNull();
    expect(row.saleId).not.toBeNull();

    const [sale] = await db
      .select()
      .from(sales)
      .where(eq(sales.id, row.saleId!));
    expect(sale).toMatchObject({
      patientId,
      paymentPlan: "installments",
      totalCents: 8_000,
      cancelledAt: null,
    });
    const [quote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.id, sale!.quoteId));
    expect(quote).toMatchObject({ status: "approved", notes: "Sinal online" });
    const items = await db
      .select()
      .from(saleItems)
      .where(eq(saleItems.saleId, sale!.id));
    expect(items).toMatchObject([
      { serviceId, sessions: 1, totalCents: 8_000 },
    ]);

    const parts = await db
      .select()
      .from(installments)
      .where(eq(installments.saleId, sale!.id))
      .orderBy(asc(installments.number));
    expect(parts).toMatchObject([
      {
        number: 1,
        amountCents: 1_200,
        dueDate: "2033-03-01",
        appointmentId: null,
      },
      {
        number: 2,
        amountCents: 6_800,
        dueDate: "2033-03-07",
        appointmentId,
        saleItemId: items[0]!.id,
      },
    ]);

    const recorded = await clinicPayments();
    expect(recorded).toMatchObject([
      {
        id: row.paymentId,
        amountCents: 1_200,
        paidOn: "2033-03-01",
        method: PIX_ONLINE_METHOD,
        notes: "Sinal pago por Pix (Asaas)",
        installmentId: parts[0]!.id,
        reversedAt: null,
      },
    ]);

    expect(await findSessionInstallment(clinicId, appointmentId)).toEqual({
      installmentId: parts[1]!.id,
      saleId: sale!.id,
      outstandingCents: 6_800,
    });

    const [audit] = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.clinicId, clinicId),
          eq(auditLogs.action, "appointment.status_changed"),
          eq(auditLogs.entityId, appointmentId),
        ),
      );
    expect(audit).toMatchObject({ actorType: "system" });
    expect(asaas.refunds()).toEqual([]);
  });

  it("same notification twice records one payment", async () => {
    const asaas = fakeAsaas();
    const { depositId } = await hold();
    paid(asaas, "pay-1", depositId);
    expect(
      await handleDepositNotification(depositId, "pay-1", asaas.fetchImpl),
    ).toBe("paid");
    paid(asaas, "pay-1", depositId, "CONFIRMED");
    expect(
      await handleDepositNotification(depositId, "pay-1", asaas.fetchImpl),
    ).toBe("ignored");
    expect(await clinicPayments()).toHaveLength(1);
    expect(
      await db.select().from(sales).where(eq(sales.clinicId, clinicId)),
    ).toHaveLength(1);
    expect(asaas.refunds()).toEqual([]);
  });

  it("paid after timeout, slot still free: confirms", async () => {
    const asaas = fakeAsaas();
    const { appointmentId, depositId } = await hold({
      appointment: {
        status: "cancelled",
        cancelledAt: NOW,
        cancelledBy: "system",
        cancellationReason: "other",
      },
      deposit: { status: "expired", closeReason: "timeout" },
    });
    paid(asaas, "pay-1", depositId);
    expect(
      await handleDepositNotification(depositId, "pay-1", asaas.fetchImpl),
    ).toBe("paid");
    expect(await appointment(appointmentId)).toMatchObject({
      status: "confirmed",
      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: null,
    });
    expect(await deposit(depositId)).toMatchObject({
      status: "paid",
      closeReason: null,
    });
    expect(await clinicPayments()).toHaveLength(1);
    expect(asaas.refunds()).toEqual([]);
  });

  it("paid after timeout, slot taken: refunds automatically, no payment recorded", async () => {
    const asaas = fakeAsaas();
    const { appointmentId, depositId } = await hold({
      appointment: {
        status: "cancelled",
        cancelledAt: NOW,
        cancelledBy: "system",
        cancellationReason: "other",
      },
      deposit: { status: "expired", closeReason: "timeout" },
    });
    // Someone else booked the freed slot.
    await db.insert(appointments).values({
      clinicId,
      patientId,
      serviceId,
      serviceName: "Serviço com sinal fictício",
      serviceDurationMinutes: 60,
      startsAt: new Date(STARTS_AT.getTime() + 30 * MINUTE),
      endsAt: new Date(ENDS_AT.getTime() + 30 * MINUTE),
      occupiedFrom: new Date(STARTS_AT.getTime() + 30 * MINUTE),
      occupiedUntil: new Date(ENDS_AT.getTime() + 30 * MINUTE),
      status: "confirmed",
      source: "admin",
    });
    paid(asaas, "pay-1", depositId);
    expect(
      await handleDepositNotification(depositId, "pay-1", asaas.fetchImpl),
    ).toBe("refunded");
    expect(asaas.refunds()).toHaveLength(1);
    expect(asaas.payments.get("pay-1")!.status).toBe("REFUNDED");
    expect(await appointment(appointmentId)).toMatchObject({
      status: "cancelled",
    });
    expect(await deposit(depositId)).toMatchObject({
      status: "expired",
      paymentId: null,
    });
    expect(await clinicPayments()).toEqual([]);
    expect(await autoRefunds()).toEqual([
      {
        entityId: appointmentId,
        changes: {
          depositId,
          chargeId: "pay-1",
          reason: "slot_taken",
          refundStatus: "REFUNDED",
        },
      },
    ]);
  });

  it("paid after timeout once the appointment time has passed: refunds", async () => {
    const asaas = fakeAsaas();
    const { appointmentId, depositId } = await hold({
      appointment: {
        status: "cancelled",
        cancelledAt: NOW,
        cancelledBy: "system",
        cancellationReason: "other",
      },
      deposit: { status: "expired", closeReason: "timeout" },
    });
    paid(asaas, "pay-1", depositId);
    const later = new Date(STARTS_AT.getTime() + MINUTE);
    expect(
      await handleDepositNotification(
        depositId,
        "pay-1",
        asaas.fetchImpl,
        later,
      ),
    ).toBe("refunded");
    expect(asaas.refunds()).toHaveLength(1);
    expect(await appointment(appointmentId)).toMatchObject({
      status: "cancelled",
      cancelledBy: "system",
    });
    expect(await deposit(depositId)).toMatchObject({
      status: "expired",
      paymentId: null,
    });
    expect(await clinicPayments()).toEqual([]);
    expect(await autoRefunds()).toEqual([
      {
        entityId: appointmentId,
        changes: {
          depositId,
          chargeId: "pay-1",
          reason: "past",
          refundStatus: "REFUNDED",
        },
      },
    ]);
  });

  it("paid with another amount than the deposit: refunds, records nothing", async () => {
    const asaas = fakeAsaas();
    const { appointmentId, depositId } = await hold();
    asaas.payments.set("pay-1", {
      status: "RECEIVED",
      value: 10,
      externalReference: depositId,
    });
    expect(
      await handleDepositNotification(depositId, "pay-1", asaas.fetchImpl),
    ).toBe("refunded");
    expect(asaas.refunds()).toHaveLength(1);
    expect(asaas.payments.get("pay-1")!.status).toBe("REFUNDED");
    expect(await appointment(appointmentId)).toMatchObject({
      status: "requested",
    });
    expect(await deposit(depositId)).toMatchObject({
      status: "pending",
      paymentId: null,
      saleId: null,
    });
    expect(await clinicPayments()).toEqual([]);
    expect(await autoRefunds()).toEqual([
      {
        entityId: appointmentId,
        changes: {
          depositId,
          chargeId: "pay-1",
          reason: "amount_mismatch",
          refundStatus: "REFUNDED",
        },
      },
    ]);

    // The retried notification now reads REFUNDED and changes nothing.
    expect(
      await handleDepositNotification(depositId, "pay-1", asaas.fetchImpl),
    ).toBe("ignored");
    expect(asaas.refunds()).toHaveLength(1);
  });

  it("paid after the owner cancelled: refunds, appointment stays cancelled", async () => {
    const asaas = fakeAsaas();
    const { appointmentId, depositId } = await hold({
      appointment: {
        status: "cancelled",
        cancelledAt: NOW,
        cancelledBy: "clinic",
        cancellationReason: "clinic_unavailable",
      },
      deposit: { status: "closed", closeReason: "clinic_cancelled" },
    });
    paid(asaas, "pay-1", depositId);
    expect(
      await handleDepositNotification(depositId, "pay-1", asaas.fetchImpl),
    ).toBe("refunded");
    expect(asaas.refunds()).toHaveLength(1);
    expect(await appointment(appointmentId)).toMatchObject({
      status: "cancelled",
      cancelledBy: "clinic",
    });
    expect(await clinicPayments()).toEqual([]);
    expect((await autoRefunds())[0]!.changes).toMatchObject({
      reason: "clinic_cancelled",
    });
  });

  it("paid after manual confirm: refunds", async () => {
    const asaas = fakeAsaas();
    const { appointmentId, depositId } = await hold({
      appointment: { status: "confirmed", confirmedAt: NOW },
      deposit: { status: "closed", closeReason: "manual_confirm" },
    });
    paid(asaas, "pay-1", depositId);
    expect(
      await handleDepositNotification(depositId, "pay-1", asaas.fetchImpl),
    ).toBe("refunded");
    expect(asaas.refunds()).toHaveLength(1);
    expect(await appointment(appointmentId)).toMatchObject({
      status: "confirmed",
    });
    expect(await clinicPayments()).toEqual([]);
    expect(
      await db.select().from(sales).where(eq(sales.clinicId, clinicId)),
    ).toEqual([]);
    expect((await autoRefunds())[0]!.changes).toMatchObject({
      reason: "manual_confirm",
    });
  });

  it("charge never saved (charge_failed) but paid: refunds", async () => {
    const asaas = fakeAsaas();
    const { depositId } = await hold({
      appointment: {
        status: "cancelled",
        cancelledAt: NOW,
        cancelledBy: "system",
        cancellationReason: "other",
      },
      deposit: {
        status: "closed",
        closeReason: "charge_failed",
        chargeId: null,
      },
    });
    paid(asaas, "pay-9", depositId);
    expect(
      await handleDepositNotification(depositId, "pay-9", asaas.fetchImpl),
    ).toBe("refunded");
    expect(asaas.payments.get("pay-9")!.status).toBe("REFUNDED");
    expect(await clinicPayments()).toEqual([]);
  });

  it("a second payment on a paid deposit is refunded", async () => {
    const asaas = fakeAsaas();
    const { depositId } = await hold();
    paid(asaas, "pay-1", depositId);
    await handleDepositNotification(depositId, "pay-1", asaas.fetchImpl);
    paid(asaas, "pay-2", depositId);
    expect(
      await handleDepositNotification(depositId, "pay-2", asaas.fetchImpl),
    ).toBe("refunded");
    expect(asaas.payments.get("pay-1")!.status).toBe("RECEIVED");
    expect(asaas.payments.get("pay-2")!.status).toBe("REFUNDED");
    expect(await deposit(depositId)).toMatchObject({
      status: "paid",
      chargeId: "pay-1",
    });
    expect(await clinicPayments()).toHaveLength(1);
    expect((await autoRefunds())[0]!.changes).toMatchObject({
      chargeId: "pay-2",
      reason: "duplicate_payment",
    });
  });

  it("a refund waiting for the owner's approval leaves a note on the account", async () => {
    const asaas = fakeAsaas();
    asaas.state.refundStatus = "REFUND_REQUESTED";
    const { depositId } = await hold({
      deposit: { status: "closed", closeReason: "manual_confirm" },
      appointment: { status: "confirmed", confirmedAt: NOW },
    });
    paid(asaas, "pay-1", depositId);
    expect(
      await handleDepositNotification(depositId, "pay-1", asaas.fetchImpl),
    ).toBe("refunded");
    expect(await accountRow()).toMatchObject({
      status: "approved",
      lastError: "refund_pending_approval",
    });
  });

  it("a refund that completes leaves no note on the account", async () => {
    const asaas = fakeAsaas();
    const { depositId } = await hold({
      deposit: { status: "closed", closeReason: "manual_confirm" },
      appointment: { status: "confirmed", confirmedAt: NOW },
    });
    paid(asaas, "pay-1", depositId);
    await handleDepositNotification(depositId, "pay-1", asaas.fetchImpl);
    expect((await accountRow()).lastError).toBeNull();
  });

  it("a revoked key (401) on the payment read disconnects the account and still throws", async () => {
    const asaas = fakeAsaas();
    const { depositId } = await hold();
    paid(asaas, "pay-1", depositId);
    asaas.state.readError = 401;
    await expect(
      handleDepositNotification(depositId, "pay-1", asaas.fetchImpl),
    ).rejects.toThrow();
    expect(await accountRow()).toMatchObject({
      status: "disconnected",
      lastError: "invalid_key",
    });
  });

  it("a revoked key (401) on the refund disconnects the account and still throws", async () => {
    const asaas = fakeAsaas();
    const { depositId } = await hold({
      deposit: { status: "closed", closeReason: "manual_confirm" },
      appointment: { status: "confirmed", confirmedAt: NOW },
    });
    paid(asaas, "pay-1", depositId);
    asaas.state.refundError = 401;
    await expect(
      handleDepositNotification(depositId, "pay-1", asaas.fetchImpl),
    ).rejects.toThrow();
    expect(await accountRow()).toMatchObject({ status: "disconnected" });
  });

  it("a refund that fails asks for a retry, and the retry refunds once", async () => {
    const asaas = fakeAsaas();
    vi.stubGlobal("fetch", asaas.fetchImpl);
    const { depositId } = await hold({
      deposit: { status: "closed", closeReason: "manual_confirm" },
      appointment: { status: "confirmed", confirmedAt: NOW },
    });
    paid(asaas, "pay-1", depositId);
    asaas.state.refundError = 503;
    expect((await POST(webhook(notice("pay-1", depositId)))).status).toBe(500);
    expect(await autoRefunds()).toEqual([]);
    asaas.state.refundError = null;
    expect((await POST(webhook(notice("pay-1", depositId)))).status).toBe(200);
    expect(asaas.payments.get("pay-1")!.status).toBe("REFUNDED");
    expect(await autoRefunds()).toHaveLength(1);
    // Asaas sends PAYMENT_REFUNDED next: nothing more to do.
    expect((await POST(webhook(notice("pay-1", depositId)))).status).toBe(200);
    expect(await autoRefunds()).toHaveLength(1);
  });

  it("payment whose externalReference is another deposit is ignored", async () => {
    const asaas = fakeAsaas();
    vi.stubGlobal("fetch", asaas.fetchImpl);
    const { depositId } = await hold();
    asaas.payments.set("pay-1", {
      status: "RECEIVED",
      value: 12,
      externalReference: "00000000-0000-4000-8000-000000000000",
    });
    expect(
      await handleDepositNotification(depositId, "pay-1", asaas.fetchImpl),
    ).toBe("ignored");
    expect((await POST(webhook(notice("pay-1", depositId)))).status).toBe(200);
    expect(await deposit(depositId)).toMatchObject({ status: "pending" });
    expect(await clinicPayments()).toEqual([]);
    expect(asaas.refunds()).toEqual([]);
    // A deposit id nobody has, or a body without one: nothing to do.
    expect(
      await handleDepositNotification(
        "00000000-0000-4000-8000-000000000000",
        "pay-1",
        asaas.fetchImpl,
      ),
    ).toBe("unknown");
    expect((await POST(webhook({ payment: { id: "pay-1" } }))).status).toBe(
      200,
    );
  });

  it("deposit disabled after payment still confirms", async () => {
    const asaas = fakeAsaas();
    const { appointmentId, depositId } = await hold();
    await db
      .update(asaasAccounts)
      .set({ depositEnabled: false })
      .where(eq(asaasAccounts.clinicId, clinicId));
    paid(asaas, "pay-1", depositId);
    expect(
      await handleDepositNotification(depositId, "pay-1", asaas.fetchImpl),
    ).toBe("paid");
    expect((await appointment(appointmentId)).status).toBe("confirmed");
  });

  it("REFUNDED from the Asaas app reverses the payment here", async () => {
    const asaas = fakeAsaas();
    const { appointmentId, depositId } = await hold();
    paid(asaas, "pay-1", depositId);
    await handleDepositNotification(depositId, "pay-1", asaas.fetchImpl);
    asaas.payments.get("pay-1")!.status = "REFUNDED";
    expect(
      await handleDepositNotification(depositId, "pay-1", asaas.fetchImpl),
    ).toBe("refunded");
    const row = await deposit(depositId);
    expect(row.status).toBe("refunded");
    const [payment] = await clinicPayments();
    expect(payment!.reversedAt).not.toBeNull();
    const parts = await db
      .select()
      .from(installments)
      .where(eq(installments.saleId, row.saleId!))
      .orderBy(asc(installments.number));
    // The patient got it all back: the whole sale is cancelled.
    expect(parts[0]!.cancelledAt).not.toBeNull();
    expect(parts[1]!.cancelledAt).not.toBeNull();
    const [sale] = await db
      .select()
      .from(sales)
      .where(eq(sales.id, row.saleId!));
    expect(sale!.cancelledAt).not.toBeNull();
    expect(sale!.cancellationReason).toBe("Sinal devolvido pelo Asaas");
    // A week later nothing shows as owed or overdue.
    const detail = await getSale(clinicId, row.saleId!, "2033-03-08");
    expect(detail).toMatchObject({ paidCents: 0, outstandingCents: 0 });
    expect(detail!.installments.map((part) => part.state)).toEqual([
      "cancelled",
      "cancelled",
    ]);
    const listed = (await listSales(clinicId, { patientId })).find(
      (item) => item.id === row.saleId,
    );
    expect(listed).toMatchObject({
      paidCents: 0,
      outstandingCents: 0,
      cancelled: true,
    });
    expect(await findSessionInstallment(clinicId, appointmentId)).toBeNull();
    expect((await appointment(appointmentId)).status).toBe("confirmed");
    // Asaas repeating the notice changes nothing.
    expect(
      await handleDepositNotification(depositId, "pay-1", asaas.fetchImpl),
    ).toBe("ignored");
    expect(asaas.refunds()).toEqual([]);
    expect(
      await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.clinicId, clinicId),
            inArray(auditLogs.action, ["payment.reversed"]),
          ),
        ),
    ).toHaveLength(1);
  });
});
