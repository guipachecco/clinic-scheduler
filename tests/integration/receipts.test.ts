import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { inClinic } from "@/db/client";
import { db, endPools } from "@/db/owner";
import {
  appointments,
  auditLogs,
  businessHours,
  patients,
  paymentMethods,
  receipts,
  serviceCategories,
  services,
  users,
} from "@/db/schema";
import {
  approveSchema,
  quoteFormSchema,
  receiptSchema,
  scheduleSessionsSchema,
} from "@/modules/finance/fields";
import { approveQuote, createQuote } from "@/modules/finance/quotes";
import {
  createReceipt,
  getAppointmentBilling,
  reverseReceipt,
} from "@/modules/finance/receipts";
import { financeSummary, listCash } from "@/modules/finance/reports";
import { getSale, scheduleSessions } from "@/modules/finance/sales";

import { CLINIC, otherClinic } from "../helpers/clinic";

// Receipts: money received outside a sale. Every record is fictitious.

const TODAY = "2026-11-04";
const NOW = new Date("2026-11-04T12:00:00Z");
const MONTH = { from: "2026-11-01", to: "2026-12-01" };

let actorId: string;
let patientId: string;
let serviceId: string;
let pixId: string;

async function appointment(
  status: "requested" | "confirmed" | "completed" | "cancelled",
  hour = 13,
) {
  const startsAt = new Date(Date.UTC(2026, 10, 4, hour));
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
  const [row] = await db
    .insert(appointments)
    .values({
      clinicId: CLINIC,
      patientId,
      serviceId,
      serviceName: "Manicure Tradicional",
      serviceDurationMinutes: 30,
      startsAt,
      endsAt,
      occupiedFrom: startsAt,
      occupiedUntil: endsAt,
      status,
      source: "admin",
      ...(status === "cancelled"
        ? { cancelledAt: NOW, cancelledBy: "clinic" as const }
        : {}),
    })
    .returning({ id: appointments.id });
  return row!.id;
}

function values(overrides: Record<string, unknown> = {}) {
  return receiptSchema.parse({
    appointmentId: "",
    description: "",
    amount: "35,00",
    receivedOn: TODAY,
    paymentMethodId: pixId,
    notes: "",
    ...overrides,
  });
}

beforeEach(async () => {
  await db.execute(
    sql`truncate table receipts, sale_revisions, payments, expenses, installments, sale_sessions, sale_items, sales, quote_items, quotes, audit_logs, time_blocks, business_hours, appointments, patients, services, service_categories, users cascade`,
  );
  const [user] = await db
    .insert(users)
    .values({
      name: "Admin",
      email: "admin-entradas@example.com",
      role: "admin",
      clinicId: CLINIC,
    })
    .returning();
  actorId = user!.id;
  const [category] = await db
    .insert(serviceCategories)
    .values({ clinicId: CLINIC, name: "Mãos", slug: "maos" })
    .returning();
  const [service] = await db
    .insert(services)
    .values({
      clinicId: CLINIC,
      categoryId: category!.id,
      name: "Manicure Tradicional",
      slug: "manicure-tradicional",
      durationMinutes: 30,
      priceCents: 3500,
      priceDisplay: "fixed",
      isActive: true,
    })
    .returning();
  serviceId = service!.id;
  const [patient] = await db
    .insert(patients)
    .values({
      clinicId: CLINIC,
      name: "Ana Fictícia",
      nameNormalized: "ana ficticia",
      phone: "+5547999990001",
    })
    .returning();
  patientId = patient!.id;
  await db.insert(businessHours).values(
    [1, 2, 3, 4, 5, 6].map((weekday) => ({
      clinicId: CLINIC,
      weekday,
      startTime: "08:00",
      endTime: "18:00",
    })),
  );
  const [pix] = await db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.clinicId, CLINIC))
    .then((rows) => rows.filter((m) => m.name === "Pix"));
  pixId = pix!.id;
});

afterAll(async () => {
  await endPools();
});

describe("receipts", () => {
  it("receives an appointment: service and client come from it, and it counts", async () => {
    const id = await appointment("confirmed");
    const billing = await getAppointmentBilling(CLINIC, id);
    expect(billing).toEqual({
      inPackage: false,
      receipt: null,
      servicePriceCents: 3500,
    });

    // Whatever the form says, the appointment decides who and what.
    const result = await createReceipt(
      CLINIC,
      values({ appointmentId: id, description: "Outra coisa" }),
      actorId,
    );
    expect(result.ok).toBe(true);
    const [row] = await db.select().from(receipts);
    expect(row).toMatchObject({
      appointmentId: id,
      patientId,
      description: "Manicure Tradicional",
      amountCents: 3500,
      receivedOn: TODAY,
    });

    const cash = await listCash(CLINIC, MONTH);
    expect(cash).toEqual([
      expect.objectContaining({
        kind: "receipt",
        amountCents: 3500,
        methodName: "Pix",
        label: "Manicure Tradicional · Ana Fictícia",
        canReverse: true,
      }),
    ]);
    const summary = await financeSummary(CLINIC, {
      today: TODAY,
      month: MONTH,
    });
    expect(summary.receivedTodayCents).toBe(3500);
    expect(summary.receivedMonthCents).toBe(3500);
    expect(summary.receivedMonthByMethod).toEqual([
      { methodName: "Pix", amountCents: 3500 },
    ]);
    expect((await getAppointmentBilling(CLINIC, id))?.receipt).toMatchObject({
      amountCents: 3500,
      methodName: "Pix",
      receivedOn: TODAY,
    });
    const [log] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "receipt.created"));
    expect(log).toMatchObject({ actorUserId: actorId, entityId: row!.id });
  });

  it("an appointment is received once; a reversal frees it", async () => {
    const id = await appointment("completed");
    const first = await createReceipt(
      CLINIC,
      values({ appointmentId: id }),
      actorId,
    );
    expect(first.ok).toBe(true);
    expect(
      await createReceipt(CLINIC, values({ appointmentId: id }), actorId),
    ).toEqual({ ok: false, formError: "Este atendimento já foi recebido." });

    if (!first.ok) return;
    const reversed = await reverseReceipt(
      CLINIC,
      first.id,
      "Valor errado",
      actorId,
      NOW,
    );
    expect(reversed.ok).toBe(true);
    expect(
      await reverseReceipt(CLINIC, first.id, "De novo", actorId, NOW),
    ).toEqual({ ok: false, formError: "Esta entrada já foi estornada." });

    const cash = await listCash(CLINIC, MONTH);
    expect(cash.map((e) => [e.kind, e.amountCents, e.canReverse])).toEqual([
      ["receipt", 3500, false],
      ["receipt_reversal", -3500, false],
    ]);
    const summary = await financeSummary(CLINIC, {
      today: TODAY,
      month: MONTH,
    });
    expect(summary.receivedMonthCents).toBe(0);
    expect((await getAppointmentBilling(CLINIC, id))?.receipt).toBeNull();

    const again = await createReceipt(
      CLINIC,
      values({ appointmentId: id, amount: "30,00" }),
      actorId,
    );
    expect(again.ok).toBe(true);
  });

  it("refuses appointments not confirmed or completed", async () => {
    for (const status of ["requested", "cancelled"] as const) {
      const id = await appointment(status, status === "requested" ? 14 : 15);
      expect(
        await createReceipt(CLINIC, values({ appointmentId: id }), actorId),
      ).toEqual({
        ok: false,
        formError: "Só dá para receber um atendimento confirmado ou concluído.",
      });
    }
  });

  it("refuses a session of a package, even when its installment is paid", async () => {
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
            unitPrice: "35,00",
            discount: "",
          },
        ],
      }),
      actorId,
    );
    if (!quote.ok) throw new Error("quote");
    const sale = await approveQuote(
      CLINIC,
      quote.id,
      approveSchema.parse({ plan: "per_session", firstDueDate: TODAY }),
      actorId,
      TODAY,
    );
    if (!sale.ok || !sale.saleId) throw new Error(JSON.stringify(sale));
    const item = (await getSale(CLINIC, sale.saleId, TODAY))!.items[0]!;
    const scheduled = await scheduleSessions(
      CLINIC,
      scheduleSessionsSchema.parse({
        saleItemId: item.id,
        durationMinutes: "30",
        slots: [{ date: "2026-11-06", startTime: "10:00" }],
        acknowledgeWarnings: true,
      }),
      actorId,
      NOW,
    );
    expect(scheduled.ok).toBe(true);
    const [session] = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(eq(appointments.patientId, patientId));
    await db
      .update(appointments)
      .set({ status: "confirmed" })
      .where(eq(appointments.id, session!.id));

    expect((await getAppointmentBilling(CLINIC, session!.id))?.inPackage).toBe(
      true,
    );
    expect(
      await createReceipt(
        CLINIC,
        values({ appointmentId: session!.id }),
        actorId,
      ),
    ).toEqual({
      ok: false,
      formError:
        "Este atendimento é sessão de um pacote: receba pela parcela dele.",
    });
  });

  it("a new entry without an appointment needs a description", async () => {
    expect(await createReceipt(CLINIC, values(), actorId)).toEqual({
      ok: false,
      fieldErrors: { description: "Diga o que foi pago." },
    });
    const result = await createReceipt(
      CLINIC,
      values({ description: "Esmalte vinho", amount: "18,90" }),
      actorId,
    );
    expect(result.ok).toBe(true);
    const cash = await listCash(CLINIC, MONTH);
    expect(cash[0]).toMatchObject({
      kind: "receipt",
      label: "Esmalte vinho",
      amountCents: 1890,
    });
  });

  it("stays inside the clinic", async () => {
    const clinicB = await otherClinic("entradas-outra-clinica");
    const [methodB] = await db
      .insert(paymentMethods)
      .values({ clinicId: clinicB, name: "Pix da outra" })
      .onConflictDoNothing()
      .returning();
    const [anyMethodB] = methodB
      ? [methodB]
      : await db
          .select()
          .from(paymentMethods)
          .where(eq(paymentMethods.clinicId, clinicB));
    // Another clinic's payment method is refused.
    expect(
      await createReceipt(
        CLINIC,
        values({ description: "Esmalte", paymentMethodId: anyMethodB!.id }),
        actorId,
      ),
    ).toEqual({
      ok: false,
      fieldErrors: { paymentMethodId: "Escolha a forma de pagamento." },
    });

    // Another clinic's appointment is not found.
    const id = await appointment("confirmed");
    expect(
      await createReceipt(clinicB, values({ appointmentId: id }), actorId),
    ).toMatchObject({ ok: false });

    const ok = await createReceipt(
      CLINIC,
      values({ description: "Esmalte" }),
      actorId,
    );
    expect(ok.ok).toBe(true);
    // The panel of clinic B sees none of clinic A's receipts.
    const seen = await inClinic(clinicB, (tx) => tx.select().from(receipts));
    expect(seen).toEqual([]);
    expect(await listCash(clinicB, MONTH)).toEqual([]);
  });

  it("the panel cannot delete a receipt", async () => {
    const result = await createReceipt(
      CLINIC,
      values({ description: "Esmalte" }),
      actorId,
    );
    if (!result.ok) throw new Error("receipt");
    await expect(
      inClinic(CLINIC, (tx) =>
        tx.delete(receipts).where(eq(receipts.id, result.id)),
      ),
    ).rejects.toThrow();
  });
});
