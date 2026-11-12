import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/owner";
import {
  appointments,
  businessHours,
  expenseCategories,
  installments,
  patients,
  paymentMethods,
  quotes,
  serviceCategories,
  services,
  users,
} from "@/db/schema";
import {
  changeAppointmentStatus,
  rescheduleAppointment,
} from "@/modules/appointments/appointments";
import { cancelExpense, createExpense } from "@/modules/finance/expenses";
import {
  approveSchema,
  expenseSchema,
  paymentSchema,
  quoteFormSchema,
  reviseSchema,
  scheduleSessionsSchema,
} from "@/modules/finance/fields";
import {
  approveQuote,
  createQuote,
  getQuote,
  listQuotes,
  setQuoteStatus,
} from "@/modules/finance/quotes";
import {
  financeSummary,
  listCash,
  listReceivables,
} from "@/modules/finance/reports";
import {
  cancelSale,
  getSale,
  receivePayment,
  reversePayment,
  reviseSale,
  scheduleSessions,
} from "@/modules/finance/sales";

import { CLINIC, otherClinic } from "../helpers/clinic";

// Every record here is fictitious and exists only during the test.

const TODAY = "2026-11-04";
// Wednesday 2026-11-04, 09:00 in São Paulo.
const NOW = new Date("2026-11-04T12:00:00Z");

let actorId: string;
let patientId: string;
let serviceId: string;
let pixId: string;
let cashId: string;

async function fixtures(clinicId: string, suffix = "") {
  const [category] = await db
    .insert(serviceCategories)
    .values({ clinicId, name: `Estética${suffix}`, slug: `estetica${suffix}` })
    .returning();
  const [service] = await db
    .insert(services)
    .values({
      clinicId,
      categoryId: category!.id,
      name: `Drenagem${suffix}`,
      slug: `drenagem${suffix}`,
      durationMinutes: 60,
      priceCents: 15000,
      priceDisplay: "fixed",
      isActive: true,
    })
    .returning();
  const [patient] = await db
    .insert(patients)
    .values({
      clinicId,
      name: `Joana Fictícia${suffix}`,
      nameNormalized: `joana ficticia${suffix}`,
      phone: "+5548999990001",
    })
    .returning();
  return { serviceId: service!.id, patientId: patient!.id };
}

function quoteForm(overrides: Record<string, unknown> = {}) {
  return quoteFormSchema.parse({
    patientId,
    validUntil: "2026-11-19",
    discount: "",
    notes: "",
    items: [
      {
        kind: "service",
        serviceId,
        sessions: "4",
        unitPrice: "150,00",
        discount: "",
      },
    ],
    ...overrides,
  });
}

async function approved(
  plan: Record<string, unknown>,
  form = quoteForm(),
): Promise<string> {
  const quote = await createQuote(CLINIC, form, actorId);
  if (!quote.ok) throw new Error(JSON.stringify(quote));
  const result = await approveQuote(
    CLINIC,
    quote.id,
    approveSchema.parse({ firstDueDate: TODAY, ...plan }),
    actorId,
    TODAY,
  );
  if (!result.ok || !result.saleId) throw new Error(JSON.stringify(result));
  return result.saleId;
}

async function pay(installmentId: string, amount: string, paidOn = TODAY) {
  return receivePayment(
    CLINIC,
    paymentSchema.parse({
      installmentId,
      paidOn,
      amount,
      paymentMethodId: pixId,
      notes: "",
    }),
    actorId,
  );
}

async function sale(id: string) {
  const found = await getSale(CLINIC, id, TODAY);
  if (!found) throw new Error("sale not found");
  return found;
}

async function schedule(
  saleId: string,
  dates: string[],
  options: { startTime?: string; acknowledgeWarnings?: boolean } = {},
) {
  const item = (await sale(saleId)).items[0]!;
  return scheduleSessions(
    CLINIC,
    scheduleSessionsSchema.parse({
      saleItemId: item.id,
      durationMinutes: "60",
      slots: dates.map((date) => ({
        date,
        startTime: options.startTime ?? "10:00",
      })),
      acknowledgeWarnings: options.acknowledgeWarnings ?? false,
    }),
    actorId,
    NOW,
  );
}

beforeEach(async () => {
  await db.execute(
    sql`truncate table sale_revisions, payments, expenses, installments, sale_sessions, sale_items, sales, quote_items, quotes, audit_logs, time_blocks, business_hours, appointments, patients, services, service_categories, users cascade`,
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
  ({ serviceId, patientId } = await fixtures(CLINIC));
  await db.insert(businessHours).values(
    [1, 2, 3, 4, 5, 6].map((weekday) => ({
      clinicId: CLINIC,
      weekday,
      startTime: "08:00",
      endTime: "18:00",
    })),
  );
  const methods = await db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.clinicId, CLINIC));
  pixId = methods.find((m) => m.name === "Pix")!.id;
  cashId = methods.find((m) => m.name === "Dinheiro")!.id;
});

afterAll(async () => {
  await endPools();
});

describe("quotes", () => {
  it("numbers quotes per clinic and computes the total", async () => {
    const first = await createQuote(CLINIC, quoteForm(), actorId);
    const second = await createQuote(
      CLINIC,
      quoteForm({ discount: "60,00" }),
      actorId,
    );
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    const a = await getQuote(CLINIC, first.id, TODAY);
    const b = await getQuote(CLINIC, second.id, TODAY);
    expect(a).toMatchObject({ number: 1, totalCents: 60000, status: "draft" });
    expect(b).toMatchObject({ number: 2, totalCents: 54000 });
    const list = await listQuotes(CLINIC, { today: TODAY });
    expect(list.map((q) => [q.number, q.totalCents])).toEqual([
      [2, 54000],
      [1, 60000],
    ]);
  });

  it("refuses a patient of another clinic", async () => {
    const clinicB = await otherClinic();
    const other = await fixtures(clinicB, "-b");
    const result = await createQuote(
      CLINIC,
      quoteForm({ patientId: other.patientId }),
      actorId,
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { patientId: expect.any(String) },
    });
    expect(
      await getQuote(clinicB, "00000000-0000-4000-8000-000000000000", TODAY),
    ).toBeNull();
  });

  it("only approves an expired quote when confirmed", async () => {
    const quote = await createQuote(
      CLINIC,
      quoteForm({ validUntil: "2026-11-01" }),
      actorId,
    );
    if (!quote.ok) throw new Error("quote");
    await setQuoteStatus(CLINIC, quote.id, "sent", actorId, NOW);
    const refused = await approveQuote(
      CLINIC,
      quote.id,
      approveSchema.parse({ plan: "upfront", firstDueDate: TODAY }),
      actorId,
      TODAY,
    );
    expect(refused.ok).toBe(false);
    const accepted = await approveQuote(
      CLINIC,
      quote.id,
      approveSchema.parse({
        plan: "upfront",
        firstDueDate: TODAY,
        acknowledgeExpired: true,
      }),
      actorId,
      TODAY,
    );
    expect(accepted.ok).toBe(true);
    const [row] = await db.select().from(quotes).where(eq(quotes.id, quote.id));
    expect(row!.status).toBe("approved");
  });
});

describe("approval plans", () => {
  it("upfront is one installment with the total", async () => {
    const saleId = await approved({ plan: "upfront" });
    const found = await sale(saleId);
    expect(found.totalCents).toBe(60000);
    expect(found.installments.map((i) => [i.amountCents, i.dueDate])).toEqual([
      [60000, TODAY],
    ]);
  });

  it("parcelado splits the total monthly, with the remainder first", async () => {
    const saleId = await approved(
      {
        plan: "installments",
        installmentsCount: "3",
        firstDueDate: "2026-11-10",
      },
      quoteForm({ discount: "0,01" }),
    );
    const found = await sale(saleId);
    expect(found.installments.map((i) => [i.amountCents, i.dueDate])).toEqual([
      [20000, "2026-11-10"],
      [20000, "2026-12-10"],
      [19999, "2027-01-10"],
    ]);
  });

  it("parcelado accepts a down payment and refuses a sum that does not match", async () => {
    const saleId = await approved({
      plan: "installments",
      installmentsCount: "2",
      amounts: ["300,00", ""],
    });
    expect((await sale(saleId)).installments.map((i) => i.amountCents)).toEqual(
      [30000, 30000],
    );

    const quote = await createQuote(CLINIC, quoteForm(), actorId);
    if (!quote.ok) throw new Error("quote");
    const result = await approveQuote(
      CLINIC,
      quote.id,
      approveSchema.parse({
        plan: "installments",
        installmentsCount: "2",
        amounts: ["300,00", "200,00"],
        firstDueDate: TODAY,
      }),
      actorId,
      TODAY,
    );
    expect(result.ok).toBe(false);
    expect(await db.select().from(installments)).toHaveLength(2);
  });

  it("por sessão creates one undated installment per session", async () => {
    const saleId = await approved(
      { plan: "per_session" },
      quoteForm({ discount: "10,00" }),
    );
    const found = await sale(saleId);
    expect(found.installments.map((i) => [i.amountCents, i.dueDate])).toEqual([
      [14750, null],
      [14750, null],
      [14750, null],
      [14750, null],
    ]);
  });
});

describe("payments", () => {
  it("takes partial payments, refuses too much and reverses", async () => {
    const saleId = await approved({ plan: "upfront" });
    const part = (await sale(saleId)).installments[0]!;

    expect((await pay(part.id, "200,00")).ok).toBe(true);
    expect((await sale(saleId)).installments[0]!.state).toBe("partial");

    const tooMuch = await pay(part.id, "400,01");
    expect(tooMuch).toMatchObject({
      ok: false,
      fieldErrors: { amount: expect.any(String) },
    });

    const rest = await pay(part.id, "400,00");
    expect(rest.ok).toBe(true);
    let found = await sale(saleId);
    expect(found.installments[0]!.state).toBe("paid");
    expect(found.outstandingCents).toBe(0);

    if (!rest.ok) return;
    expect(
      (await reversePayment(CLINIC, rest.id, "Lançado errado", actorId, NOW))
        .ok,
    ).toBe(true);
    expect(
      (await reversePayment(CLINIC, rest.id, "De novo", actorId, NOW)).ok,
    ).toBe(false);
    found = await sale(saleId);
    expect(found.paidCents).toBe(20000);
    expect(found.outstandingCents).toBe(40000);
    expect(found.payments).toHaveLength(2);
  });

  it("never pays an installment of another clinic", async () => {
    const saleId = await approved({ plan: "upfront" });
    const part = (await sale(saleId)).installments[0]!;
    const clinicB = await otherClinic();
    const [methodB] = await db
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.clinicId, clinicB));
    const result = await receivePayment(
      clinicB,
      paymentSchema.parse({
        installmentId: part.id,
        paidOn: TODAY,
        amount: "10,00",
        paymentMethodId: methodB?.id ?? pixId,
        notes: "",
      }),
      actorId,
    );
    expect(result.ok).toBe(false);
    expect(await getSale(clinicB, saleId, TODAY)).toBeNull();
  });
});

describe("package sessions", () => {
  it("schedules weekly sessions and gives each its installment and due date", async () => {
    const saleId = await approved({ plan: "per_session" });
    const result = await schedule(saleId, ["2026-11-10", "2026-11-17"]);
    expect(result.ok).toBe(true);
    const found = await sale(saleId);
    expect(found.items[0]).toMatchObject({
      sessions: 4,
      used: 2,
      remaining: 2,
    });
    expect(found.installments.map((i) => i.dueDate)).toEqual([
      "2026-11-10",
      "2026-11-17",
      null,
      null,
    ]);
  });

  it("refuses more sessions than were sold", async () => {
    const saleId = await approved({ plan: "per_session" });
    const result = await schedule(saleId, [
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
    ]);
    expect(result.ok).toBe(false);
    expect(await db.select().from(appointments)).toHaveLength(0);
  });

  it("saves nothing when one date conflicts, and says which", async () => {
    const saleId = await approved({ plan: "per_session" });
    expect((await schedule(saleId, ["2026-11-10"])).ok).toBe(true);
    const other = await approved({ plan: "per_session" });
    const result = await schedule(other, ["2026-11-09", "2026-11-10"]);
    expect(result).toMatchObject({
      ok: false,
      problems: [{ index: 1, kind: "conflict" }],
    });
    expect(await db.select().from(appointments)).toHaveLength(1);
  });

  it("asks before a date outside business hours", async () => {
    const saleId = await approved({ plan: "per_session" });
    const sunday = await schedule(saleId, ["2026-11-15"]);
    expect(sunday).toMatchObject({
      ok: false,
      problems: [{ index: 0, kind: "warning" }],
    });
    expect(
      (await schedule(saleId, ["2026-11-15"], { acknowledgeWarnings: true }))
        .ok,
    ).toBe(true);
  });

  it("a cancelled session goes back to the package and its paid installment is credit", async () => {
    const saleId = await approved({ plan: "per_session" });
    await schedule(saleId, ["2026-11-10", "2026-11-17"]);
    let found = await sale(saleId);
    const first = found.installments[0]!;
    await pay(first.id, "150,00");
    const appointmentId = found.items[0]!.appointments[0]!.id;

    expect(
      (
        await changeAppointmentStatus(
          CLINIC,
          appointmentId,
          { to: "cancelled", reason: "patient_request" },
          actorId,
          NOW,
        )
      ).ok,
    ).toBe(true);
    found = await sale(saleId);
    expect(found.items[0]).toMatchObject({ used: 1, remaining: 3 });
    expect(found.installments[0]).toMatchObject({
      dueDate: null,
      state: "paid",
    });

    // The next session uses the paid installment first.
    await schedule(saleId, ["2026-11-24"]);
    found = await sale(saleId);
    const paidPart = found.installments.find((i) => i.id === first.id)!;
    expect(paidPart.dueDate).toBe("2026-11-24");
  });

  it("rescheduling a session moves its due date", async () => {
    const saleId = await approved({ plan: "per_session" });
    await schedule(saleId, ["2026-11-10"]);
    const appointmentId = (await sale(saleId)).items[0]!.appointments[0]!.id;
    const result = await rescheduleAppointment(
      CLINIC,
      appointmentId,
      {
        startsAt: new Date("2026-11-12T13:00:00Z"),
        endsAt: new Date("2026-11-12T14:00:00Z"),
        acknowledgeWarnings: false,
      },
      actorId,
      NOW,
    );
    expect(result.ok).toBe(true);
    expect((await sale(saleId)).installments[0]!.dueDate).toBe("2026-11-12");
  });
});

describe("changing a sale", () => {
  it("adds sessions and replans what is still owed", async () => {
    const saleId = await approved({
      plan: "installments",
      installmentsCount: "2",
    });
    const before = await sale(saleId);
    await pay(before.installments[0]!.id, "300,00");

    const result = await reviseSale(
      CLINIC,
      saleId,
      reviseSchema.parse({
        reason: "Cliente quis mais 2 sessões",
        action: "add_sessions",
        saleItemId: before.items[0]!.id,
        sessions: "2",
        sessionPrice: "150,00",
        installmentsCount: "2",
        firstDueDate: "2026-12-04",
      }),
      actorId,
      TODAY,
      NOW,
    );
    expect(result.ok).toBe(true);
    const after = await sale(saleId);
    expect(after.totalCents).toBe(90000);
    expect(after.items[0]!.sessions).toBe(6);
    expect(
      after.installments
        .filter((i) => i.state !== "cancelled")
        .map((i) => [i.amountCents, i.dueDate]),
    ).toEqual([
      [30000, TODAY],
      [30000, "2026-12-04"],
      [30000, "2027-01-04"],
    ]);
    expect(after.revisions).toHaveLength(1);
    expect(after.revisions[0]!.before.totalCents).toBe(60000);
  });

  it("never lets the total go below what was paid", async () => {
    const saleId = await approved({ plan: "upfront" });
    const found = await sale(saleId);
    await pay(found.installments[0]!.id, "600,00");
    const result = await reviseSale(
      CLINIC,
      saleId,
      reviseSchema.parse({
        reason: "Desistiu de uma sessão",
        action: "remove_sessions",
        saleItemId: found.items[0]!.id,
        sessions: "1",
      }),
      actorId,
      TODAY,
      NOW,
    );
    expect(result.ok).toBe(false);
    expect((await sale(saleId)).totalCents).toBe(60000);
  });

  it("cancelling keeps what was paid and cancels the future sessions", async () => {
    const saleId = await approved({ plan: "per_session" });
    await schedule(saleId, ["2026-11-10", "2026-11-17"]);
    const found = await sale(saleId);
    await pay(found.installments[0]!.id, "150,00");

    const result = await cancelSale(
      CLINIC,
      saleId,
      { reason: "Mudou de cidade", cancelFutureSessions: true },
      actorId,
      NOW,
    );
    expect(result.ok).toBe(true);
    const after = await sale(saleId);
    expect(after.cancelledAt).not.toBeNull();
    expect(after.outstandingCents).toBe(0);
    expect(after.installments.map((i) => i.state)).toEqual([
      "paid",
      "cancelled",
      "cancelled",
      "cancelled",
    ]);
    const statuses = await db
      .select({ status: appointments.status })
      .from(appointments);
    expect(statuses.every((s) => s.status === "cancelled")).toBe(true);
    expect(await listReceivables(CLINIC, TODAY)).toEqual([]);
  });
});

describe("cash", () => {
  it("counts a reversal on the day it was made, not on the payment's day", async () => {
    const saleId = await approved({ plan: "upfront" });
    const part = (await sale(saleId)).installments[0]!;
    const payment = await pay(part.id, "600,00", "2026-10-30");
    if (!payment.ok) throw new Error("payment");
    await reversePayment(CLINIC, payment.id, "Erro", actorId, NOW);

    const october = await listCash(CLINIC, {
      from: "2026-10-01",
      to: "2026-11-01",
    });
    expect(october.map((e) => [e.kind, e.amountCents, e.backdated])).toEqual([
      ["payment", 60000, true],
    ]);
    const november = await listCash(CLINIC, {
      from: "2026-11-01",
      to: "2026-12-01",
    });
    expect(november.map((e) => [e.kind, e.date, e.amountCents])).toEqual([
      ["reversal", TODAY, -60000],
    ]);
  });

  it("sums the month, expenses and what is owed", async () => {
    const saleId = await approved({
      plan: "installments",
      installmentsCount: "2",
      firstDueDate: "2026-10-20",
    });
    const found = await sale(saleId);
    await pay(found.installments[0]!.id, "100,00");
    await receivePayment(
      CLINIC,
      paymentSchema.parse({
        installmentId: found.installments[0]!.id,
        paidOn: TODAY,
        amount: "50,00",
        paymentMethodId: cashId,
        notes: "",
      }),
      actorId,
    );
    const [rent] = await db
      .select()
      .from(expenseCategories)
      .where(
        and(
          eq(expenseCategories.clinicId, CLINIC),
          eq(expenseCategories.name, "Aluguel"),
        ),
      );
    const expense = await createExpense(
      CLINIC,
      expenseSchema.parse({
        spentOn: TODAY,
        amount: "80,00",
        categoryId: rent!.id,
        paymentMethodId: pixId,
        description: "",
      }),
      actorId,
    );
    expect(expense.ok).toBe(true);

    const summary = await financeSummary(CLINIC, {
      today: TODAY,
      month: { from: "2026-11-01", to: "2026-12-01" },
    });
    expect(summary).toMatchObject({
      receivedTodayCents: 15000,
      receivedMonthCents: 15000,
      spentMonthCents: 8000,
      balanceMonthCents: 7000,
      overdueCount: 1,
      overdueCents: 15000,
      receivableDatedCents: 45000,
      receivableUnscheduledCents: 0,
    });

    if (!expense.ok) return;
    expect(
      (await cancelExpense(CLINIC, expense.id, "Duplicada", actorId, NOW)).ok,
    ).toBe(true);
    const after = await financeSummary(CLINIC, {
      today: TODAY,
      month: { from: "2026-11-01", to: "2026-12-01" },
    });
    expect(after.spentMonthCents).toBe(0);
  });
});
