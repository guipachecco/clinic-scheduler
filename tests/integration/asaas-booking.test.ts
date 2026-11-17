import { and, eq, inArray, like } from "drizzle-orm";
import {
  afterAll,
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
  asaasCustomers,
  asaasDeposits,
  auditLogs,
  businessHours,
  clinics,
  patients,
  serviceCategories,
  services,
  users,
} from "@/db/schema";
import { env } from "@/lib/env";
import {
  depositQuote,
  getDepositView,
  sweepExpiredDeposits,
} from "@/modules/asaas/deposits";
import {
  bookOnline,
  type BookingContext,
  listFreeSlots,
} from "@/modules/booking/booking";
import { registerClientPatient } from "@/modules/clients/context";
import { encryptToken, tokenKey } from "@/modules/mercado-pago/crypto";

import { otherClinic } from "../helpers/clinic";

// Online booking with a Pix deposit, against a fake Asaas: nothing leaves the
// machine. A clinic of its own, every record fictitious. The e-mails end in
// @sinal-pix.example.test.

const DOMAIN = "@sinal-pix.example.test";
const SLUG = "clinica-sinal-pix";
// 2033-03-01 is a Tuesday; the clinic opens Monday to Friday, 09:00-12:00
// (São Paulo, -03:00).
const NOW = new Date("2033-03-01T12:00:00Z");
const MONDAY = "2033-03-07";
const CPF = "529.982.247-25";
const MINUTE = 60_000;

const local = (date: string, time: string) => `${date}T${time}:00.000-03:00`;
const SLOT = local(MONDAY, "09:00");

let clinicId: string;
let serviceId: string;
let freeServiceId: string;
const user = { ana: "", bia: "" };
const patient = { ana: "", bia: "" };

const ctx = (who: keyof typeof user): BookingContext => ({
  clinicId,
  patientId: patient[who],
  userId: user[who],
  emailVerified: true,
});

type Call = { method: string; path: string; body: unknown; key?: string };

function fakeAsaas() {
  const calls: Call[] = [];
  const state = {
    paymentError: null as null | { status: number; code?: string },
    nextPayment: 1,
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const key = new Headers(init?.headers).get("access_token") ?? undefined;
    calls.push({ method, path: url.pathname, body, key });
    if (url.pathname.endsWith("/customers") && method === "POST") {
      return json({ id: "cus-1" });
    }
    if (url.pathname.endsWith("/payments") && method === "POST") {
      if (state.paymentError) {
        const { status, code } = state.paymentError;
        return json({ errors: code ? [{ code }] : [] }, status);
      }
      const id = `pay-${state.nextPayment++}`;
      return json({
        id,
        status: "PENDING",
        value: (body as { value: number }).value,
        externalReference: (body as { externalReference: string })
          .externalReference,
      });
    }
    if (url.pathname.endsWith("/pixQrCode")) {
      return json({
        payload: "pix-copia-e-cola-ficticio",
        encodedImage: "aW1hZ2VtLWZpY3RpY2lh",
        expirationDate: "2033-03-02 23:59:59",
      });
    }
    if (/\/payments\/[^/]+$/.test(url.pathname) && method === "DELETE") {
      return json({ deleted: true });
    }
    return json({ errors: [{ code: "not_found" }] }, 404);
  }) as typeof fetch;
  const count = (method: string, suffix: RegExp) =>
    calls.filter((c) => c.method === method && suffix.test(c.path)).length;
  return { fetchImpl, calls, state, count };
}

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

async function setAccount(values: Partial<typeof asaasAccounts.$inferInsert>) {
  await db
    .update(asaasAccounts)
    .set(values)
    .where(eq(asaasAccounts.clinicId, clinicId));
}

async function clearAgenda() {
  await db.delete(asaasDeposits).where(eq(asaasDeposits.clinicId, clinicId));
  await db.delete(asaasCustomers).where(eq(asaasCustomers.clinicId, clinicId));
  await db.delete(auditLogs).where(eq(auditLogs.clinicId, clinicId));
  await db.delete(appointments).where(eq(appointments.clinicId, clinicId));
}

async function cleanup() {
  const [existing] = await db
    .select({ id: clinics.id })
    .from(clinics)
    .where(eq(clinics.slug, SLUG));
  if (existing) {
    clinicId = existing.id;
    await clearAgenda();
    await db.delete(asaasAccounts).where(eq(asaasAccounts.clinicId, clinicId));
    await db.delete(businessHours).where(eq(businessHours.clinicId, clinicId));
    await db.delete(patients).where(eq(patients.clinicId, clinicId));
    await db.delete(services).where(eq(services.clinicId, clinicId));
    await db
      .delete(serviceCategories)
      .where(eq(serviceCategories.clinicId, clinicId));
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

async function appointment(id: string) {
  const [row] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, id));
  return row!;
}

async function deposits() {
  return db
    .select()
    .from(asaasDeposits)
    .where(eq(asaasDeposits.clinicId, clinicId));
}

beforeAll(async () => {
  await cleanup();
  clinicId = await otherClinic(SLUG);
  await db
    .update(clinics)
    .set({
      isActive: true,
      onlineBookingChoice: true,
      minAdvanceMinutes: 120,
      maxAdvanceDays: 60,
      slotStepMinutes: 30,
      maxActiveAppointmentsPerPhone: 5,
      timezone: "America/Sao_Paulo",
    })
    .where(eq(clinics.id, clinicId));
  await db.insert(businessHours).values(
    [1, 2, 3, 4, 5].map((weekday) => ({
      clinicId,
      weekday,
      startTime: "09:00",
      endTime: "12:00",
    })),
  );
  const [category] = await db
    .insert(serviceCategories)
    .values({ clinicId, name: "Categoria sinal", slug: "categoria-sinal" })
    .returning({ id: serviceCategories.id });
  const base = {
    clinicId,
    categoryId: category!.id,
    durationMinutes: 60,
    isActive: true,
    onlineBookingEnabled: true,
  };
  const [paid] = await db
    .insert(services)
    .values({
      ...base,
      name: "Serviço com sinal fictício",
      slug: "servico-com-sinal",
      priceCents: 8_000,
      priceDisplay: "fixed",
    })
    .returning({ id: services.id });
  serviceId = paid!.id;
  const [free] = await db
    .insert(services)
    .values({
      ...base,
      name: "Serviço sob consulta fictício",
      slug: "servico-sob-consulta",
      priceCents: null,
      priceDisplay: "on_request",
    })
    .returning({ id: services.id });
  freeServiceId = free!.id;

  user.ana = await createUser("ana");
  user.bia = await createUser("bia");
  patient.ana = await registerClientPatient({
    clinicId,
    userId: user.ana,
    name: "Ana Sinal Pix",
    phone: "+5511900004401",
    email: null,
  });
  patient.bia = await registerClientPatient({
    clinicId,
    userId: user.bia,
    name: "Bia Sinal Pix",
    phone: "+5511900004402",
    email: null,
  });

  await db.insert(asaasAccounts).values({
    clinicId,
    accountId: "acc-sinal",
    walletId: "wal-sinal",
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
  // Only Date is faked, so the database driver keeps its real timers.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await clearAgenda();
  await setAccount({
    status: "approved",
    depositEnabled: true,
    lastError: null,
  });
});

afterAll(async () => {
  vi.useRealTimers();
  await cleanup();
  await endPools();
});

describe("online booking with a Pix deposit", () => {
  it("clinic without active deposit books confirmed, as today", async () => {
    await setAccount({ depositEnabled: false });
    const asaas = fakeAsaas();
    expect(await depositQuote(clinicId, serviceId, patient.ana)).toBeNull();
    const result = await bookOnline(
      ctx("ana"),
      { serviceId, startsAt: SLOT },
      asaas.fetchImpl,
    );
    expect(result).toMatchObject({ ok: true, deposit: null });
    const id = (result as { appointmentId: string }).appointmentId;
    expect(await appointment(id)).toMatchObject({ status: "confirmed" });
    expect(asaas.calls).toEqual([]);
    expect(await deposits()).toEqual([]);
  });

  it("service without price books confirmed without deposit", async () => {
    const asaas = fakeAsaas();
    expect(await depositQuote(clinicId, freeServiceId, patient.ana)).toBeNull();
    const result = await bookOnline(
      ctx("ana"),
      { serviceId: freeServiceId, startsAt: SLOT },
      asaas.fetchImpl,
    );
    expect(result).toMatchObject({ ok: true, deposit: null });
    const id = (result as { appointmentId: string }).appointmentId;
    expect(await appointment(id)).toMatchObject({ status: "confirmed" });
    expect(asaas.calls).toEqual([]);
  });

  it("asks for CPF when the patient has no Asaas customer", async () => {
    expect(await depositQuote(clinicId, serviceId, patient.ana)).toEqual({
      amountCents: 1_200,
      needsCpf: true,
      cpfLast4: null,
    });
    const asaas = fakeAsaas();
    const result = await bookOnline(
      ctx("ana"),
      { serviceId, startsAt: SLOT },
      asaas.fetchImpl,
    );
    expect(result).toEqual({ ok: false, reason: "cpf_required" });
    const invalid = await bookOnline(
      ctx("ana"),
      { serviceId, startsAt: SLOT, cpf: "111.111.111-11" },
      asaas.fetchImpl,
    );
    expect(invalid).toEqual({ ok: false, reason: "cpf_invalid" });
    const rows = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(eq(appointments.clinicId, clinicId));
    expect(rows).toEqual([]);
    expect(asaas.calls).toEqual([]);
  });

  it("books requested, creates one Pix charge of 15% and returns the QR", async () => {
    const asaas = fakeAsaas();
    const result = await bookOnline(
      ctx("ana"),
      { serviceId, startsAt: SLOT, cpf: CPF },
      asaas.fetchImpl,
    );
    expect(result).toMatchObject({
      ok: true,
      deposit: {
        status: "pending",
        amountCents: 1_200,
        pixPayload: "pix-copia-e-cola-ficticio",
        qrImageBase64: "aW1hZ2VtLWZpY3RpY2lh",
      },
    });
    const ok = result as {
      appointmentId: string;
      deposit: { expiresAt: Date };
    };
    expect(ok.deposit.expiresAt.getTime()).toBe(NOW.getTime() + 30 * MINUTE);
    expect(await appointment(ok.appointmentId)).toMatchObject({
      status: "requested",
      confirmedAt: null,
    });

    const customer = asaas.calls.find((c) => c.path.endsWith("/customers"))!;
    expect(customer.key).toBe("sub-key");
    expect(customer.body).toMatchObject({
      name: "Ana Sinal Pix",
      cpfCnpj: "52998224725",
    });
    const [deposit] = await deposits();
    const charge = asaas.calls.find(
      (c) => c.method === "POST" && c.path.endsWith("/payments"),
    )!;
    expect(charge.body).toEqual({
      customer: "cus-1",
      billingType: "PIX",
      value: 12,
      dueDate: "2033-03-01",
      externalReference: deposit!.id,
      description: "Sinal · Serviço com sinal fictício",
    });
    expect(deposit).toMatchObject({
      appointmentId: ok.appointmentId,
      patientId: patient.ana,
      amountCents: 1_200,
      chargeId: "pay-1",
      status: "pending",
    });
    // Only the last 4 digits of the CPF are kept.
    const [saved] = await db
      .select()
      .from(asaasCustomers)
      .where(eq(asaasCustomers.clinicId, clinicId));
    expect(saved).toMatchObject({
      patientId: patient.ana,
      customerId: "cus-1",
      cpfCnpjLast4: "4725",
    });
    expect(await depositQuote(clinicId, serviceId, patient.ana)).toEqual({
      amountCents: 1_200,
      needsCpf: false,
      cpfLast4: "4725",
    });
    // The CPF never reaches the audit log.
    const audit = await db
      .select({ changes: auditLogs.changes })
      .from(auditLogs)
      .where(eq(auditLogs.clinicId, clinicId));
    expect(JSON.stringify(audit)).not.toContain("52998224725");
    // The slot is held for everyone.
    expect(await listFreeSlots(ctx("bia"), serviceId, MONDAY)).not.toContain(
      SLOT,
    );
  });

  it("second click returns the same deposit, one charge only", async () => {
    const asaas = fakeAsaas();
    const first = await bookOnline(
      ctx("ana"),
      { serviceId, startsAt: SLOT, cpf: CPF },
      asaas.fetchImpl,
    );
    const second = await bookOnline(
      ctx("ana"),
      { serviceId, startsAt: SLOT },
      asaas.fetchImpl,
    );
    expect(first.ok && second.ok).toBe(true);
    expect(second).toMatchObject({
      ok: true,
      appointmentId: (first as { appointmentId: string }).appointmentId,
      deposit: { status: "pending", pixPayload: "pix-copia-e-cola-ficticio" },
    });
    expect(asaas.count("POST", /\/payments$/)).toBe(1);
    expect(asaas.count("POST", /\/customers$/)).toBe(1);
    // Someone else still gets "taken".
    expect(
      await bookOnline(
        ctx("bia"),
        { serviceId, startsAt: SLOT, cpf: CPF },
        asaas.fetchImpl,
      ),
    ).toEqual({ ok: false, reason: "taken" });
  });

  it("after 30 minutes the slot is free again and the charge is deleted", async () => {
    const asaas = fakeAsaas();
    const result = await bookOnline(
      ctx("ana"),
      { serviceId, startsAt: SLOT, cpf: CPF },
      asaas.fetchImpl,
    );
    const id = (result as { appointmentId: string }).appointmentId;

    // Within the hold nothing expires.
    expect(
      await sweepExpiredDeposits(
        clinicId,
        new Date(NOW.getTime() + 29 * MINUTE),
        asaas.fetchImpl,
      ),
    ).toBe(0);

    vi.setSystemTime(new Date(NOW.getTime() + 31 * MINUTE));
    expect(
      await sweepExpiredDeposits(clinicId, new Date(), asaas.fetchImpl),
    ).toBe(1);
    expect(await listFreeSlots(ctx("bia"), serviceId, MONDAY)).toContain(SLOT);
    expect(await appointment(id)).toMatchObject({
      status: "cancelled",
      cancelledBy: "system",
      cancellationReason: "other",
    });
    const [deposit] = await deposits();
    expect(deposit).toMatchObject({
      status: "expired",
      closeReason: "timeout",
    });
    expect(asaas.count("DELETE", /\/payments\/pay-1$/)).toBe(1);
    // Nothing left to sweep.
    expect(
      await sweepExpiredDeposits(clinicId, new Date(), asaas.fetchImpl),
    ).toBe(0);
  });

  it("transient Asaas failure undoes the booking", async () => {
    const asaas = fakeAsaas();
    asaas.state.paymentError = { status: 503 };
    const result = await bookOnline(
      ctx("ana"),
      { serviceId, startsAt: SLOT, cpf: CPF },
      asaas.fetchImpl,
    );
    expect(result).toEqual({ ok: false, reason: "unavailable" });
    const [row] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.clinicId, clinicId));
    expect(row).toMatchObject({ status: "cancelled", cancelledBy: "system" });
    const [deposit] = await deposits();
    expect(deposit).toMatchObject({
      status: "closed",
      closeReason: "charge_failed",
      chargeId: null,
    });
    expect(await listFreeSlots(ctx("bia"), serviceId, MONDAY)).toContain(SLOT);
    // The account is not flagged for a passing failure.
    const [account] = await db
      .select()
      .from(asaasAccounts)
      .where(eq(asaasAccounts.clinicId, clinicId));
    expect(account!.lastError).toBeNull();
  });

  it("an unexpected error after the hold lets the slot go", async () => {
    const [account] = await db
      .select({ apiKeyEnc: asaasAccounts.apiKeyEnc })
      .from(asaasAccounts)
      .where(eq(asaasAccounts.clinicId, clinicId));
    // The key no longer decrypts: startDeposit throws a plain Error before
    // any deposit row exists.
    await setAccount({ apiKeyEnc: "nao-decifra" });
    try {
      const asaas = fakeAsaas();
      const result = await bookOnline(
        ctx("ana"),
        { serviceId, startsAt: SLOT, cpf: CPF },
        asaas.fetchImpl,
      );
      expect(result).toEqual({ ok: false, reason: "unavailable" });
      const [row] = await db
        .select()
        .from(appointments)
        .where(eq(appointments.clinicId, clinicId));
      expect(row).toMatchObject({ status: "cancelled", cancelledBy: "system" });
      expect(await deposits()).toEqual([]);
      expect(asaas.calls).toEqual([]);
      expect(await listFreeSlots(ctx("bia"), serviceId, MONDAY)).toContain(
        SLOT,
      );
    } finally {
      await setAccount({ apiKeyEnc: account!.apiKeyEnc });
    }
  });

  it("a plain error from Asaas after the deposit row closes it too", async () => {
    const asaas = fakeAsaas();
    // A network error (not an AsaasError) on the charge.
    const failing = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/payments") && init?.method === "POST") {
        throw new Error("conexão caiu");
      }
      return asaas.fetchImpl(input, init);
    }) as typeof fetch;
    const result = await bookOnline(
      ctx("ana"),
      { serviceId, startsAt: SLOT, cpf: CPF },
      failing,
    );
    expect(result).toEqual({ ok: false, reason: "unavailable" });
    const [deposit] = await deposits();
    expect(deposit).toMatchObject({
      status: "closed",
      closeReason: "charge_failed",
    });
    expect(await listFreeSlots(ctx("bia"), serviceId, MONDAY)).toContain(SLOT);
  });

  it("permanent refusal confirms without deposit and flags the account", async () => {
    const asaas = fakeAsaas();
    asaas.state.paymentError = { status: 400, code: "invalid_action" };
    const result = await bookOnline(
      ctx("ana"),
      { serviceId, startsAt: SLOT, cpf: CPF },
      asaas.fetchImpl,
    );
    expect(result).toMatchObject({ ok: true, deposit: null });
    const id = (result as { appointmentId: string }).appointmentId;
    const record = await appointment(id);
    expect(record.status).toBe("confirmed");
    expect(record.confirmedAt).not.toBeNull();
    const [account] = await db
      .select()
      .from(asaasAccounts)
      .where(eq(asaasAccounts.clinicId, clinicId));
    expect(account!.lastError).toBe("invalid_action");
    const [deposit] = await deposits();
    expect(deposit).toMatchObject({
      status: "closed",
      closeReason: "charge_failed",
    });
  });

  it("getDepositView never shows another patient's deposit", async () => {
    const asaas = fakeAsaas();
    const result = await bookOnline(
      ctx("ana"),
      { serviceId, startsAt: SLOT, cpf: CPF },
      asaas.fetchImpl,
    );
    const id = (result as { appointmentId: string }).appointmentId;
    expect(
      await getDepositView(clinicId, id, patient.ana, false, asaas.fetchImpl),
    ).toMatchObject({
      status: "pending",
      amountCents: 1_200,
      pixPayload: null,
    });
    expect(
      await getDepositView(clinicId, id, patient.bia, true, asaas.fetchImpl),
    ).toBeNull();
    const other = await otherClinic();
    expect(
      await getDepositView(other, id, patient.ana, true, asaas.fetchImpl),
    ).toBeNull();
    expect(
      await getDepositView(clinicId, "not-a-uuid", patient.ana),
    ).toBeNull();
    const withQr = await getDepositView(
      clinicId,
      id,
      patient.ana,
      true,
      asaas.fetchImpl,
    );
    expect(withQr).toMatchObject({ qrImageBase64: "aW1hZ2VtLWZpY3RpY2lh" });
    expect(
      await db
        .select({ id: asaasDeposits.id })
        .from(asaasDeposits)
        .where(
          and(
            eq(asaasDeposits.clinicId, clinicId),
            eq(asaasDeposits.patientId, patient.bia),
          ),
        ),
    ).toEqual([]);
  });
});
