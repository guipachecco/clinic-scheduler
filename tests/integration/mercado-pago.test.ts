import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/owner";
import {
  mercadoPagoAccounts,
  mercadoPagoCharges,
  patients,
  paymentMethods,
  payments,
  serviceCategories,
  services,
  users,
} from "@/db/schema";
import {
  approveSchema,
  paymentSchema,
  quoteFormSchema,
} from "@/modules/finance/fields";
import { approveQuote, createQuote } from "@/modules/finance/quotes";
import { getSale, receivePayment } from "@/modules/finance/sales";
import {
  accessTokenFor,
  getConnection,
  saveConnection,
} from "@/modules/mercado-pago/accounts";
import {
  createCharge,
  handleOrderNotification,
  reverseWithRefund,
} from "@/modules/mercado-pago/charges";

import { CLINIC } from "../helpers/clinic";

// Payment links through Mercado Pago, with a fake Mercado Pago: nothing
// leaves the machine. Every record is fictitious.

const TODAY = "2026-11-10";
const NOW = new Date("2026-11-10T12:00:00Z");

type Call = { method: string; path: string; body: unknown; token?: string };

// A tiny stand-in for api.mercadopago.com that keeps the orders it created.
function fakeMercadoPago() {
  const calls: Call[] = [];
  const orders = new Map<string, Record<string, unknown>>();
  let next = 1;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const token = new Headers(init?.headers)
      .get("authorization")
      ?.replace("Bearer ", "");
    const method = init?.method ?? "GET";
    calls.push({ method, path: url.pathname, body, token });

    if (url.pathname === "/oauth/token") {
      return json({
        access_token: `APP_USR-novo-${next}`,
        refresh_token: `TG-novo-${next++}`,
        public_key: "APP_USR-publica",
        user_id: 998877,
        live_mode: false,
        expires_in: 15552000,
      });
    }
    if (url.pathname === "/v1/orders" && method === "POST") {
      const id = `ORDTST${String(next++).padStart(4, "0")}`;
      const order = {
        id,
        status: "created",
        status_detail: "created",
        total_amount: body.total_amount,
        total_paid_amount: "0.00",
        external_reference: body.external_reference,
        checkout_url: `https://www.mercadopago.com.br/checkout/v1/redirect?order_id=${id}`,
      };
      orders.set(id, order);
      return json(order, 201);
    }
    const match = /^\/v1\/orders\/([^/]+)(\/refund)?$/.exec(url.pathname);
    if (match) {
      const order = orders.get(match[1]!);
      if (!order) return json({ message: "not found" }, 404);
      if (match[2]) Object.assign(order, { status: "refunded" });
      return json(order);
    }
    return json({ message: "unexpected" }, 500);
  }) as typeof fetch;
  const setStatus = (id: string, status: string, detail = status) =>
    Object.assign(orders.get(id)!, {
      status,
      status_detail: detail,
      total_paid_amount:
        status === "processed" ? orders.get(id)!.total_amount : "0.00",
    });
  return { fetchImpl, calls, orders, setStatus };
}

let actorId: string;
let patientId: string;
let serviceId: string;

async function saleWithInstallments(count = 2) {
  const quote = await createQuote(
    CLINIC,
    quoteFormSchema.parse({
      patientId,
      validUntil: "2026-11-30",
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
  const approved = await approveQuote(
    CLINIC,
    quote.id,
    approveSchema.parse({
      plan: "installments",
      installmentsCount: String(count),
      firstDueDate: TODAY,
    }),
    actorId,
    TODAY,
  );
  if (!approved.ok || !approved.saleId) throw new Error("approve failed");
  const sale = await getSale(CLINIC, approved.saleId, TODAY);
  return sale!;
}

async function connect(expiresAt = new Date("2027-04-01T00:00:00Z")) {
  await saveConnection(
    CLINIC,
    {
      accessToken: "APP_USR-token-da-clinica",
      refreshToken: "TG-refresh-da-clinica",
      publicKey: "APP_USR-publica",
      userId: "998877",
      liveMode: false,
      expiresAt,
    },
    actorId,
  );
}

beforeEach(async () => {
  await db.execute(
    sql`truncate table mercado_pago_charges, mercado_pago_accounts, receipts, sale_revisions, payments, expenses, installments, sale_sessions, sale_items, sales, quote_items, quotes, audit_logs, appointments, patients, services, service_categories, users cascade`,
  );
  await db
    .delete(paymentMethods)
    .where(eq(paymentMethods.name, "Mercado Pago"));
  const [user] = await db
    .insert(users)
    .values({
      name: "Admin",
      email: "admin-mp@example.com",
      role: "admin",
      clinicId: CLINIC,
    })
    .returning();
  actorId = user!.id;
  const [category] = await db
    .insert(serviceCategories)
    .values({ clinicId: CLINIC, name: "Rosto", slug: "rosto" })
    .returning();
  const [service] = await db
    .insert(services)
    .values({
      clinicId: CLINIC,
      categoryId: category!.id,
      name: "Limpeza de pele",
      slug: "limpeza-de-pele",
      durationMinutes: 60,
      priceCents: 15000,
      priceDisplay: "fixed",
      isActive: true,
    })
    .returning();
  serviceId = service!.id;
  const [patient] = await db
    .insert(patients)
    .values({
      clinicId: CLINIC,
      name: "Bia Fictícia",
      nameNormalized: "bia ficticia",
      phone: "+5547999990002",
    })
    .returning();
  patientId = patient!.id;
});

afterAll(endPools);

describe("connection", () => {
  it("stores the tokens encrypted and adds the Mercado Pago method", async () => {
    await connect();
    const [row] = await db.select().from(mercadoPagoAccounts);
    expect(row!.accessTokenEnc).not.toContain("token-da-clinica");
    expect(row!.refreshTokenEnc).not.toContain("refresh-da-clinica");
    expect(await getConnection(CLINIC)).toMatchObject({
      mpUserId: "998877",
      liveMode: false,
    });
    const methods = await db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.clinicId, CLINIC));
    expect(methods.some((m) => m.name === "Mercado Pago" && m.isActive)).toBe(
      true,
    );
  });

  it("renews a token close to expiring and keeps the new refresh token", async () => {
    await connect(new Date("2026-11-20T00:00:00Z"));
    const mp = fakeMercadoPago();
    const token = await accessTokenFor(CLINIC, mp.fetchImpl, NOW);
    expect(token).toBe("APP_USR-novo-1");
    expect(mp.calls[0]).toMatchObject({
      path: "/oauth/token",
      body: {
        grant_type: "refresh_token",
        refresh_token: "TG-refresh-da-clinica",
      },
    });
    // The next call uses the renewed token without asking again.
    expect(await accessTokenFor(CLINIC, mp.fetchImpl, NOW)).toBe(
      "APP_USR-novo-1",
    );
    expect(mp.calls).toHaveLength(1);
  });

  it("refuses a link when the clinic is not connected", async () => {
    const sale = await saleWithInstallments();
    const mp = fakeMercadoPago();
    await expect(
      createCharge(
        CLINIC,
        { installmentId: sale.installments[0]!.id, clinicName: "Grais" },
        actorId,
        mp.fetchImpl,
        NOW,
      ),
    ).rejects.toThrow(/Conecte o Mercado Pago/);
  });
});

describe("payment links", () => {
  it("creates an order for what is left and reuses an open link", async () => {
    await connect();
    const sale = await saleWithInstallments();
    const part = sale.installments[0]!;
    const mp = fakeMercadoPago();

    const first = await createCharge(
      CLINIC,
      { installmentId: part.id, clinicName: "Grais" },
      actorId,
      mp.fetchImpl,
      NOW,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.link.amountCents).toBe(part.amountCents);
    expect(first.link.checkoutUrl).toMatch(/^https:\/\/www\.mercadopago/);
    const created = mp.calls.find((c) => c.path === "/v1/orders")!;
    expect(created.token).toBe("APP_USR-token-da-clinica");
    expect(created.body).toMatchObject({
      type: "online",
      total_amount: "150.00",
      external_reference: first.link.id,
      items: [
        { title: "Grais · parcela 1", quantity: 1, unit_price: "150.00" },
      ],
    });

    const again = await createCharge(
      CLINIC,
      { installmentId: part.id, clinicName: "Grais" },
      actorId,
      mp.fetchImpl,
      NOW,
    );
    expect(again.ok && again.link.id).toBe(first.link.id);
    expect(mp.calls.filter((c) => c.path === "/v1/orders")).toHaveLength(1);
  });

  it("records the payment once when the order is paid", async () => {
    await connect();
    const sale = await saleWithInstallments();
    const part = sale.installments[0]!;
    const mp = fakeMercadoPago();
    const charge = await createCharge(
      CLINIC,
      { installmentId: part.id, clinicName: "Grais" },
      actorId,
      mp.fetchImpl,
      NOW,
    );
    if (!charge.ok) throw new Error(charge.formError);
    const [row] = await db.select().from(mercadoPagoCharges);

    // Still waiting: nothing happens.
    expect(await handleOrderNotification(row!.orderId, mp.fetchImpl, NOW)).toBe(
      "unchanged",
    );

    mp.setStatus(row!.orderId, "processed", "accredited");
    expect(await handleOrderNotification(row!.orderId, mp.fetchImpl, NOW)).toBe(
      "paid",
    );
    // Mercado Pago repeats notifications: the second changes nothing.
    expect(await handleOrderNotification(row!.orderId, mp.fetchImpl, NOW)).toBe(
      "unchanged",
    );

    const after = await getSale(CLINIC, sale.id, TODAY);
    expect(after!.installments[0]!.state).toBe("paid");
    expect(after!.payments).toHaveLength(1);
    expect(after!.payments[0]).toMatchObject({
      methodName: "Mercado Pago",
      amountCents: part.amountCents,
    });
    const [paid] = await db.select().from(mercadoPagoCharges);
    expect(paid).toMatchObject({ status: "paid", statusDetail: "accredited" });
    expect(paid!.paymentId).toBe((await db.select().from(payments))[0]!.id);
  });

  it("marks a conflict when the installment was paid by hand meanwhile", async () => {
    await connect();
    const sale = await saleWithInstallments();
    const part = sale.installments[0]!;
    const mp = fakeMercadoPago();
    await createCharge(
      CLINIC,
      { installmentId: part.id, clinicName: "Grais" },
      actorId,
      mp.fetchImpl,
      NOW,
    );
    const pix = (
      await db
        .select()
        .from(paymentMethods)
        .where(eq(paymentMethods.clinicId, CLINIC))
    ).find((m) => m.name === "Pix")!;
    const manual = await receivePayment(
      CLINIC,
      paymentSchema.parse({
        installmentId: part.id,
        paidOn: TODAY,
        amount: "150,00",
        paymentMethodId: pix.id,
        notes: "",
      }),
      actorId,
    );
    expect(manual.ok).toBe(true);

    const [row] = await db.select().from(mercadoPagoCharges);
    mp.setStatus(row!.orderId, "processed", "accredited");
    expect(await handleOrderNotification(row!.orderId, mp.fetchImpl, NOW)).toBe(
      "conflict",
    );
    expect(await db.select().from(payments)).toHaveLength(1);
  });

  it("reverses the payment when Mercado Pago refunds it", async () => {
    await connect();
    const sale = await saleWithInstallments();
    const mp = fakeMercadoPago();
    await createCharge(
      CLINIC,
      { installmentId: sale.installments[0]!.id, clinicName: "Grais" },
      actorId,
      mp.fetchImpl,
      NOW,
    );
    const [row] = await db.select().from(mercadoPagoCharges);
    mp.setStatus(row!.orderId, "processed", "accredited");
    await handleOrderNotification(row!.orderId, mp.fetchImpl, NOW);

    mp.setStatus(row!.orderId, "refunded");
    expect(await handleOrderNotification(row!.orderId, mp.fetchImpl, NOW)).toBe(
      "refunded",
    );
    const [payment] = await db.select().from(payments);
    expect(payment!.reversedAt).not.toBeNull();
    expect(payment!.reversalReason).toBe("Devolvido pelo Mercado Pago");
    const after = await getSale(CLINIC, sale.id, TODAY);
    expect(after!.installments[0]!.paidCents).toBe(0);
  });

  it("refunds at Mercado Pago when the owner reverses a link payment", async () => {
    await connect();
    const sale = await saleWithInstallments();
    const mp = fakeMercadoPago();
    await createCharge(
      CLINIC,
      { installmentId: sale.installments[0]!.id, clinicName: "Grais" },
      actorId,
      mp.fetchImpl,
      NOW,
    );
    const [row] = await db.select().from(mercadoPagoCharges);
    mp.setStatus(row!.orderId, "processed", "accredited");
    await handleOrderNotification(row!.orderId, mp.fetchImpl, NOW);
    const [payment] = await db.select().from(payments);

    const result = await reverseWithRefund(
      CLINIC,
      payment!.id,
      "Paciente desistiu",
      actorId,
      mp.fetchImpl,
    );
    expect(result.ok).toBe(true);
    expect(
      mp.calls.some((c) => c.method === "POST" && c.path.endsWith("/refund")),
    ).toBe(true);
    const [reversed] = await db.select().from(payments);
    expect(reversed!.reversalReason).toBe("Paciente desistiu");
    const [charge] = await db.select().from(mercadoPagoCharges);
    expect(charge!.status).toBe("refunded");

    // The refund notification that follows changes nothing more.
    expect(await handleOrderNotification(row!.orderId, mp.fetchImpl, NOW)).toBe(
      "unchanged",
    );
  });

  it("ignores orders it does not know", async () => {
    const mp = fakeMercadoPago();
    expect(await handleOrderNotification("ORDDESCONHECIDA", mp.fetchImpl)).toBe(
      "unknown",
    );
    expect(mp.calls).toHaveLength(0);
  });
});
