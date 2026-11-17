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

import { changeStatusAction } from "@/app/admin/(painel)/agenda/actions";
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
import {
  cancelWithDeposit,
  handleDepositNotification,
  previewCancellation,
} from "@/modules/asaas/deposits";
import { changeAppointmentStatus } from "@/modules/appointments/appointments";
import { findSessionInstallment } from "@/modules/finance/sales";
import { encryptToken, tokenKey } from "@/modules/mercado-pago/crypto";

import { otherClinic } from "../helpers/clinic";

// changeStatusAction runs as the clinic's admin, without a real session.
const panel = vi.hoisted(() => ({ clinicId: "", userId: "" }));
vi.mock("@/modules/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/auth/session")>()),
  requireAdmin: async () => ({
    clinicId: panel.clinicId,
    user: { id: panel.userId },
  }),
}));

// Cancelling from the panel an online booking with a Pix deposit, against a
// fake Asaas: nothing leaves the machine. A clinic of its own, every record
// fictitious.

const SLUG = "clinica-sinal-cancelar";
const EMAIL = "admin-sinal-cancelar@example.com";
const NOW = new Date("2033-03-01T12:00:00Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
// Monday 2033-03-07, 09:00-10:00 in São Paulo (-03:00).
const STARTS_AT = new Date("2033-03-07T12:00:00Z");
const ENDS_AT = new Date("2033-03-07T13:00:00Z");

let clinicId: string;
let serviceId: string;
let patientId: string;
let actorId: string;

type FakePayment = { status: string; value: number; externalReference: string };

function fakeAsaas() {
  const charges = new Map<string, FakePayment>();
  const calls: { method: string; path: string }[] = [];
  const state = {
    refundError: null as null | { status: number; code: string },
    refunded: 0,
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
      const charge = charges.get(refund[1]!);
      if (!charge) return json({ errors: [{ code: "not_found" }] }, 404);
      if (state.refundError) {
        return json(
          { errors: [{ code: state.refundError.code }] },
          state.refundError.status,
        );
      }
      if (charge.status === "REFUNDED") {
        return json({ errors: [{ code: "invalid_action" }] }, 400);
      }
      charge.status = "REFUNDED";
      state.refunded += 1;
      return json({ id: refund[1], ...charge });
    }
    const one = /\/payments\/([^/]+)$/.exec(url.pathname);
    const charge = one ? charges.get(one[1]!) : undefined;
    if (!one || !charge) return json({ errors: [{ code: "not_found" }] }, 404);
    if (method === "DELETE") {
      charges.delete(one[1]!);
      return json({ deleted: true, id: one[1] });
    }
    return json({ id: one[1], ...charge });
  }) as typeof fetch;
  const refunds = () =>
    calls.filter((c) => c.method === "POST" && c.path.endsWith("/refund"));
  const deletes = () => calls.filter((c) => c.method === "DELETE");
  return { fetchImpl, charges, calls, state, refunds, deletes };
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
async function hold() {
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

// A held booking whose Pix arrived (through the webhook's own handler):
// confirmed, with the deposit sale.
async function paidHold(asaas: ReturnType<typeof fakeAsaas>) {
  const held = await hold();
  asaas.charges.set("pay-1", {
    status: "RECEIVED",
    value: 12,
    externalReference: held.depositId,
  });
  expect(
    await handleDepositNotification(held.depositId, "pay-1", asaas.fetchImpl),
  ).toBe("paid");
  return held;
}

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

async function payment(id: string) {
  const [row] = await db.select().from(payments).where(eq(payments.id, id));
  return row!;
}

async function sale(id: string) {
  const [row] = await db.select().from(sales).where(eq(sales.id, id));
  return row!;
}

async function saleParts(saleId: string) {
  return db
    .select()
    .from(installments)
    .where(eq(installments.saleId, saleId))
    .orderBy(asc(installments.number));
}

async function audits(action: string) {
  return db
    .select({ changes: auditLogs.changes, entityId: auditLogs.entityId })
    .from(auditLogs)
    .where(and(eq(auditLogs.clinicId, clinicId), eq(auditLogs.action, action)));
}

// The whole sale is gone: payment reversed, every installment cancelled.
async function expectRefundedLocally(depositId: string, reason: string) {
  const row = await deposit(depositId);
  expect(row.status).toBe("refunded");
  const paidRow = await payment(row.paymentId!);
  expect(paidRow.reversedAt).not.toBeNull();
  expect(paidRow.reversalReason).toBe(reason);
  expect(paidRow.reversedByUserId).toBe(actorId);
  const saleRow = await sale(row.saleId!);
  expect(saleRow.cancelledAt).not.toBeNull();
  expect(saleRow.cancellationReason).toBe(reason);
  const parts = await saleParts(row.saleId!);
  expect(parts.map((part) => part.cancelledAt !== null)).toEqual([true, true]);
  expect(await findSessionInstallment(clinicId, row.appointmentId)).toBeNull();
}

beforeAll(async () => {
  await cleanup();
  clinicId = await otherClinic(SLUG);
  const [category] = await db
    .insert(serviceCategories)
    .values({
      clinicId,
      name: "Categoria cancelar",
      slug: "categoria-cancelar",
    })
    .returning({ id: serviceCategories.id });
  const [service] = await db
    .insert(services)
    .values({
      clinicId,
      categoryId: category!.id,
      name: "Serviço com sinal fictício",
      slug: "servico-com-sinal-cancelar",
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
      name: "Paciente Cancelar Fictícia",
      nameNormalized: "paciente cancelar ficticia",
      phone: "+5511900004701",
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
    accountId: "acc-cancelar",
    walletId: "wal-cancelar",
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

describe("cancelling with a deposit", () => {
  it("previewCancellation tells the outcome before confirming", async () => {
    const asaas = fakeAsaas();
    const { appointmentId } = await paidHold(asaas);
    expect(
      await previewCancellation(clinicId, appointmentId, "patient", NOW),
    ).toEqual({ hasPaidDeposit: true, outcome: "refund", amountCents: 1_200 });
    const late = new Date(STARTS_AT.getTime() - 24 * HOUR);
    expect(
      await previewCancellation(clinicId, appointmentId, "patient", late),
    ).toEqual({ hasPaidDeposit: true, outcome: "keep", amountCents: 1_200 });
    expect(
      await previewCancellation(clinicId, appointmentId, "clinic", late),
    ).toEqual({ hasPaidDeposit: true, outcome: "refund", amountCents: 1_200 });

    const { appointmentId: held } = await (async () => {
      await clearAgenda();
      return hold();
    })();
    expect(await previewCancellation(clinicId, held, "patient", NOW)).toEqual({
      hasPaidDeposit: false,
      outcome: "refund",
      amountCents: 1_200,
    });
  });

  it("patient cancels more than 24h before: refunds at Asaas, reverses payment, cancels sale", async () => {
    const asaas = fakeAsaas();
    const { appointmentId, depositId } = await paidHold(asaas);

    expect(
      await cancelWithDeposit(
        clinicId,
        appointmentId,
        { by: "patient", reason: "patient_request" },
        actorId,
        asaas.fetchImpl,
        NOW,
      ),
    ).toEqual({ ok: true, id: appointmentId });

    expect(asaas.refunds()).toEqual([
      { method: "POST", path: "/v3/payments/pay-1/refund" },
    ]);
    expect(asaas.charges.get("pay-1")!.status).toBe("REFUNDED");
    expect(await appointment(appointmentId)).toMatchObject({
      status: "cancelled",
      cancelledBy: "patient",
      cancellationReason: "patient_request",
    });
    await expectRefundedLocally(depositId, "Sinal devolvido");
    expect(await audits("asaas.deposit_refunded")).toEqual([
      {
        entityId: appointmentId,
        changes: {
          depositId,
          chargeId: "pay-1",
          amountCents: 1_200,
          by: "patient",
        },
      },
    ]);

    // Asaas then sends PAYMENT_REFUNDED: nothing more to do.
    expect(
      await handleDepositNotification(depositId, "pay-1", asaas.fetchImpl),
    ).toBe("ignored");
    expect(await audits("payment.reversed")).toHaveLength(1);
    expect(asaas.state.refunded).toBe(1);
  });

  it("patient cancels within 24h: keeps deposit, cancels remaining installment", async () => {
    const asaas = fakeAsaas();
    const { appointmentId, depositId } = await paidHold(asaas);
    const before = await deposit(depositId);
    const late = new Date(STARTS_AT.getTime() - 2 * HOUR);
    vi.setSystemTime(late);

    expect(
      await cancelWithDeposit(
        clinicId,
        appointmentId,
        { by: "patient", reason: "patient_request" },
        actorId,
        asaas.fetchImpl,
        late,
      ),
    ).toEqual({ ok: true, id: appointmentId });

    expect(asaas.refunds()).toEqual([]);
    expect((await appointment(appointmentId)).status).toBe("cancelled");
    const row = await deposit(depositId);
    expect(row).toMatchObject({
      status: "kept",
      paymentId: before.paymentId,
      saleId: before.saleId,
    });
    expect((await payment(row.paymentId!)).reversedAt).toBeNull();
    expect((await sale(row.saleId!)).cancelledAt).toBeNull();
    const parts = await saleParts(row.saleId!);
    expect(parts[0]!.cancelledAt).toBeNull();
    expect(parts[1]!.cancelledAt).not.toBeNull();
    expect(await findSessionInstallment(clinicId, appointmentId)).toBeNull();
  });

  it("a kept deposit refunded from the Asaas app reverses the payment and cancels the sale", async () => {
    const asaas = fakeAsaas();
    const { appointmentId, depositId } = await paidHold(asaas);
    const late = new Date(STARTS_AT.getTime() - 2 * HOUR);
    vi.setSystemTime(late);
    await cancelWithDeposit(
      clinicId,
      appointmentId,
      { by: "patient", reason: "patient_request" },
      actorId,
      asaas.fetchImpl,
      late,
    );
    expect((await deposit(depositId)).status).toBe("kept");

    asaas.charges.get("pay-1")!.status = "REFUNDED";
    expect(
      await handleDepositNotification(
        depositId,
        "pay-1",
        asaas.fetchImpl,
        late,
      ),
    ).toBe("refunded");
    const row = await deposit(depositId);
    expect(row.status).toBe("refunded");
    expect((await payment(row.paymentId!)).reversedAt).not.toBeNull();
    const saleRow = await sale(row.saleId!);
    expect(saleRow.cancelledAt).not.toBeNull();
    const parts = await saleParts(row.saleId!);
    expect(parts.map((part) => part.cancelledAt !== null)).toEqual([
      true,
      true,
    ]);
    expect((await appointment(appointmentId)).status).toBe("cancelled");
  });

  it("clinic cancels 1h before: refunds", async () => {
    const asaas = fakeAsaas();
    const { appointmentId, depositId } = await paidHold(asaas);
    const late = new Date(STARTS_AT.getTime() - HOUR);
    vi.setSystemTime(late);

    expect(
      await cancelWithDeposit(
        clinicId,
        appointmentId,
        { by: "clinic", reason: "clinic_unavailable" },
        actorId,
        asaas.fetchImpl,
        late,
      ),
    ).toEqual({ ok: true, id: appointmentId });
    expect(asaas.refunds()).toHaveLength(1);
    expect(await appointment(appointmentId)).toMatchObject({
      status: "cancelled",
      cancelledBy: "clinic",
    });
    await expectRefundedLocally(depositId, "Sinal devolvido");
  });

  it("refund refused by Asaas: nothing changes, formError explains", async () => {
    const asaas = fakeAsaas();
    const { appointmentId, depositId } = await paidHold(asaas);
    asaas.state.refundError = { status: 400, code: "insufficient_balance" };

    expect(
      await cancelWithDeposit(
        clinicId,
        appointmentId,
        { by: "clinic", reason: "clinic_unavailable" },
        actorId,
        asaas.fetchImpl,
        NOW,
      ),
    ).toEqual({
      ok: false,
      formError: "O Asaas não conseguiu devolver: saldo insuficiente na conta.",
      refundFailed: true,
    });

    asaas.state.refundError = { status: 400, code: "something_new" };
    expect(
      await cancelWithDeposit(
        clinicId,
        appointmentId,
        { by: "clinic", reason: "clinic_unavailable" },
        actorId,
        asaas.fetchImpl,
        NOW,
      ),
    ).toMatchObject({
      ok: false,
      formError: "O Asaas não conseguiu devolver: tente de novo mais tarde.",
    });

    expect(await appointment(appointmentId)).toMatchObject({
      status: "confirmed",
      cancelledAt: null,
    });
    const row = await deposit(depositId);
    expect(row.status).toBe("paid");
    expect((await payment(row.paymentId!)).reversedAt).toBeNull();
    expect((await sale(row.saleId!)).cancelledAt).toBeNull();
    expect(
      (await saleParts(row.saleId!)).map((part) => part.cancelledAt),
    ).toEqual([null, null]);
    expect(asaas.charges.get("pay-1")!.status).toBe("RECEIVED");
  });

  it("skipRefund cancels without calling Asaas refund", async () => {
    const asaas = fakeAsaas();
    const { appointmentId, depositId } = await paidHold(asaas);

    expect(
      await cancelWithDeposit(
        clinicId,
        appointmentId,
        { by: "clinic", reason: "clinic_unavailable", skipRefund: true },
        actorId,
        asaas.fetchImpl,
        NOW,
      ),
    ).toEqual({ ok: true, id: appointmentId });
    expect(asaas.refunds()).toEqual([]);
    expect((await appointment(appointmentId)).status).toBe("cancelled");
    await expectRefundedLocally(depositId, "Sinal devolvido por fora");
    expect(await audits("asaas.deposit_refunded_outside")).toEqual([
      {
        entityId: appointmentId,
        changes: {
          depositId,
          chargeId: "pay-1",
          amountCents: 1_200,
          by: "clinic",
        },
      },
    ]);
  });

  it("cancelling a pending deposit deletes the charge", async () => {
    const asaas = fakeAsaas();
    const { appointmentId, depositId } = await hold();
    asaas.charges.set("pay-1", {
      status: "PENDING",
      value: 12,
      externalReference: depositId,
    });

    expect(
      await cancelWithDeposit(
        clinicId,
        appointmentId,
        { by: "clinic", reason: "clinic_unavailable" },
        actorId,
        asaas.fetchImpl,
        NOW,
      ),
    ).toEqual({ ok: true, id: appointmentId });
    expect((await appointment(appointmentId)).status).toBe("cancelled");
    expect(await deposit(depositId)).toMatchObject({
      status: "closed",
      closeReason: "clinic_cancelled",
    });
    expect(asaas.deletes()).toEqual([
      { method: "DELETE", path: "/v3/payments/pay-1" },
    ]);
    expect(asaas.refunds()).toEqual([]);
  });

  it("a Pix paid between the read and the transaction aborts the cancel", async () => {
    const asaas = fakeAsaas();
    const { appointmentId, depositId } = await hold();
    asaas.charges.set("pay-1", {
      status: "RECEIVED",
      value: 12,
      externalReference: depositId,
    });

    expect(
      await cancelWithDeposit(
        clinicId,
        appointmentId,
        { by: "clinic", reason: "clinic_unavailable" },
        actorId,
        asaas.fetchImpl,
        NOW,
        // The webhook confirms the Pix right after the unlocked read.
        async () => {
          expect(
            await handleDepositNotification(
              depositId,
              "pay-1",
              asaas.fetchImpl,
            ),
          ).toBe("paid");
        },
      ),
    ).toEqual({
      ok: false,
      formError:
        "O sinal acabou de ser pago. Abra o agendamento de novo para escolher quem desmarcou.",
      stale: true,
    });

    expect(await appointment(appointmentId)).toMatchObject({
      status: "confirmed",
      cancelledAt: null,
    });
    const row = await deposit(depositId);
    expect(row.status).toBe("paid");
    expect((await payment(row.paymentId!)).reversedAt).toBeNull();
    expect((await sale(row.saleId!)).cancelledAt).toBeNull();
    expect(
      (await saleParts(row.saleId!)).map((part) => part.cancelledAt),
    ).toEqual([null, null]);
    expect(asaas.refunds()).toEqual([]);
    expect(asaas.deletes()).toEqual([]);
  });

  it("cancel from a page that showed no paid deposit: asks to reopen it", async () => {
    const asaas = fakeAsaas();
    vi.stubGlobal("fetch", asaas.fetchImpl);
    const { appointmentId, depositId } = await paidHold(asaas);
    panel.clinicId = clinicId;
    panel.userId = actorId;

    // The page rendered before the Pix arrived: no "Quem desmarcou?".
    expect(
      await changeStatusAction({
        id: appointmentId,
        to: "cancelled",
        reason: "clinic_unavailable",
      }),
    ).toEqual({
      ok: false,
      formError:
        "O sinal acabou de ser pago. Abra o agendamento de novo para escolher quem desmarcou.",
      stale: true,
    });
    expect(await appointment(appointmentId)).toMatchObject({
      status: "confirmed",
    });
    expect((await deposit(depositId)).status).toBe("paid");
    expect(asaas.state.refunded).toBe(0);
  });

  it("cancelledBy is stored as patient", async () => {
    // An ordinary booking, no deposit: the plain cancel, with who cancelled.
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
        status: "confirmed",
        source: "admin",
      })
      .returning({ id: appointments.id });
    const asaas = fakeAsaas();
    expect(
      await cancelWithDeposit(
        clinicId,
        row!.id,
        { by: "patient", reason: "patient_request" },
        actorId,
        asaas.fetchImpl,
        NOW,
      ),
    ).toEqual({ ok: true, id: row!.id });
    expect(await appointment(row!.id)).toMatchObject({
      status: "cancelled",
      cancelledBy: "patient",
    });
    expect(asaas.calls).toEqual([]);
  });

  it("a retry after the refund went through but the save failed does not refund twice", async () => {
    const asaas = fakeAsaas();
    const { appointmentId, depositId } = await paidHold(asaas);

    // The refund reaches Asaas, then the transaction fails (an instant the
    // database cannot store stands in for any failure there).
    await expect(
      cancelWithDeposit(
        clinicId,
        appointmentId,
        { by: "clinic", reason: "clinic_unavailable" },
        actorId,
        asaas.fetchImpl,
        new Date(Number.NaN),
      ),
    ).rejects.toThrow();
    expect(asaas.state.refunded).toBe(1);
    expect((await appointment(appointmentId)).status).toBe("confirmed");
    expect((await deposit(depositId)).status).toBe("paid");

    // The owner tries again: Asaas says it is already refunded, which counts.
    expect(
      await cancelWithDeposit(
        clinicId,
        appointmentId,
        { by: "clinic", reason: "clinic_unavailable" },
        actorId,
        asaas.fetchImpl,
        NOW,
      ),
    ).toEqual({ ok: true, id: appointmentId });
    expect(asaas.refunds()).toHaveLength(2);
    expect(asaas.state.refunded).toBe(1);
    await expectRefundedLocally(depositId, "Sinal devolvido");
  });

  it("a plain cancel never leaves the rest of a paid deposit open", async () => {
    const asaas = fakeAsaas();
    const { appointmentId, depositId } = await paidHold(asaas);
    expect(
      await changeAppointmentStatus(
        clinicId,
        appointmentId,
        { to: "cancelled", reason: "clinic_unavailable" },
        actorId,
        NOW,
        asaas.fetchImpl,
      ),
    ).toEqual({ ok: true, id: appointmentId });
    expect((await appointment(appointmentId)).cancelledBy).toBe("clinic");
    const row = await deposit(depositId);
    const parts = await saleParts(row.saleId!);
    expect(parts[1]!.cancelledAt).not.toBeNull();
    expect(await findSessionInstallment(clinicId, appointmentId)).toBeNull();
    expect(asaas.refunds()).toEqual([]);
  });
});
