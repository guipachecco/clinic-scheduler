import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/owner";
import {
  appointments,
  businessHours,
  patients,
  products,
  quoteItems,
  quotes,
  saleItems,
  serviceCategories,
  services,
  users,
} from "@/db/schema";
import { MODULE_OFF_ERROR } from "@/modules/clinics/modules";
import {
  approveSchema,
  quoteFormSchema,
  reviseSchema,
  scheduleSessionsSchema,
} from "@/modules/finance/fields";
import {
  approveQuote,
  createQuote,
  duplicateQuote,
  getQuote,
  updateQuote,
} from "@/modules/finance/quotes";
import { getSale, reviseSale, scheduleSessions } from "@/modules/finance/sales";

import { CLINIC, otherClinic, productCategory } from "../helpers/clinic";

// Products as items of a quote and of the sale it becomes. Every record here
// is fictitious and exists only during the test.

const TODAY = "2026-11-04";
const NOW = new Date("2026-11-04T12:00:00Z");
const ON = { productsOn: true };

let actorId: string;
let patientId: string;
let serviceId: string;
let productId: string;

async function newProduct(
  clinicId: string,
  overrides: Partial<typeof products.$inferInsert> = {},
) {
  const [row] = await db
    .insert(products)
    .values({
      clinicId,
      categoryId: await productCategory(clinicId),
      name: "Hidratante Fictício",
      priceCents: 5990,
      ...overrides,
    })
    .returning({ id: products.id });
  return row!.id;
}

const serviceItem = (sessions = "4", unitPrice = "150,00") => ({
  kind: "service",
  serviceId,
  sessions,
  unitPrice,
  discount: "",
});

const productItem = (id = productId, sessions = "2", unitPrice = "59,90") => ({
  kind: "product",
  productId: id,
  sessions,
  unitPrice,
  discount: "",
});

function form(items: unknown[], overrides: Record<string, unknown> = {}) {
  return quoteFormSchema.parse({
    patientId,
    validUntil: "2026-11-19",
    discount: "",
    notes: "",
    items,
    ...overrides,
  });
}

async function created(items: unknown[]) {
  const quote = await createQuote(CLINIC, form(items), actorId, ON);
  if (!quote.ok) throw new Error(JSON.stringify(quote));
  return quote.id;
}

async function approve(quoteId: string, plan: Record<string, unknown>) {
  const result = await approveQuote(
    CLINIC,
    quoteId,
    approveSchema.parse({ firstDueDate: TODAY, ...plan }),
    actorId,
    TODAY,
  );
  if (!result.ok || !result.saleId) throw new Error(JSON.stringify(result));
  return result.saleId;
}

async function sale(id: string) {
  const found = await getSale(CLINIC, id, TODAY);
  if (!found) throw new Error("sale not found");
  return found;
}

// The products made here are active and on the page: they must not reach
// the other test files, which share the clinic.
const clear = () =>
  db.execute(
    sql`truncate table sale_revisions, payments, installments, sale_sessions, sale_items, sales, quote_items, quotes, audit_logs, business_hours, appointments, patients, products, services, service_categories, users cascade`,
  );

beforeEach(async () => {
  await clear();
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
  const [category] = await db
    .insert(serviceCategories)
    .values({ clinicId: CLINIC, name: "Estética", slug: "estetica" })
    .returning();
  const [service] = await db
    .insert(services)
    .values({
      clinicId: CLINIC,
      categoryId: category!.id,
      name: "Drenagem",
      slug: "drenagem",
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
      name: "Joana Fictícia",
      nameNormalized: "joana ficticia",
      phone: "+5548999990001",
    })
    .returning();
  patientId = patient!.id;
  productId = await newProduct(CLINIC);
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
  await clear();
  await endPools();
});

describe("products in a quote", () => {
  it("quote with a service and a product saves, totals and approves", async () => {
    const quoteId = await created([serviceItem(), productItem()]);
    const quote = await getQuote(CLINIC, quoteId, TODAY);
    expect(quote!.totalCents).toBe(60000 + 11980);
    expect(
      quote!.items.map((i) => [i.kind, i.serviceId, i.productId, i.sessions]),
    ).toEqual([
      ["service", serviceId, null, 4],
      ["product", null, productId, 2],
    ]);
    expect(quote!.items[1]!.serviceName).toBe("Hidratante Fictício");

    const saleId = await approve(quoteId, { plan: "upfront" });
    const found = await sale(saleId);
    expect(found.totalCents).toBe(71980);
    expect(
      found.items.map((i) => [i.kind, i.serviceId, i.productId, i.sessions]),
    ).toEqual([
      ["service", serviceId, null, 4],
      ["product", null, productId, 2],
    ]);
    expect(found.items[1]!.totalCents).toBe(11980);
    expect(found.items[1]!.remaining).toBe(0);
    expect(found.installments.map((i) => i.amountCents)).toEqual([71980]);
  });

  it("per-session plan gives one installment per product, due on the sale date", async () => {
    const other = await newProduct(CLINIC, { name: "Sérum Fictício" });
    const free = await newProduct(CLINIC, { name: "Brinde Fictício" });
    const quoteId = await created([
      serviceItem("2"),
      productItem(productId, "2"),
      productItem(other, "1", "30,00"),
      productItem(free, "1", "0,00"),
    ]);
    const saleId = await approve(quoteId, { plan: "per_session" });
    const found = await sale(saleId);
    const [svc, prod, prod2] = found.items;
    expect(
      found.installments.map((i) => [i.saleItemId, i.amountCents, i.dueDate]),
    ).toEqual([
      [svc!.id, 15000, null],
      [svc!.id, 15000, null],
      [prod!.id, 11980, TODAY],
      [prod2!.id, 3000, TODAY],
    ]);
    expect(found.totalCents).toBe(30000 + 11980 + 3000);
  });

  it("a per-session sale of products only has nothing to schedule", async () => {
    const quoteId = await created([productItem()]);
    const saleId = await approve(quoteId, { plan: "per_session" });
    const found = await sale(saleId);
    expect(found.installments.map((i) => [i.amountCents, i.dueDate])).toEqual([
      [11980, TODAY],
    ]);
    expect(found.items.map((i) => i.remaining)).toEqual([0]);
  });

  it("old quotes with service items still edit and approve", async () => {
    // A draft as the old code wrote it: only service_id on the item.
    const [quote] = await db
      .insert(quotes)
      .values({
        clinicId: CLINIC,
        number: 1,
        patientId,
        validUntil: "2026-11-19",
        createdByUserId: actorId,
      })
      .returning({ id: quotes.id });
    await db.execute(
      sql`insert into quote_items (clinic_id, quote_id, service_id, service_name, sessions, unit_price_cents)
          values (${CLINIC}, ${quote!.id}, ${serviceId}, 'Drenagem', 3, 15000)`,
    );

    const loaded = await getQuote(CLINIC, quote!.id, TODAY);
    expect(
      loaded!.items.map((i) => [i.kind, i.serviceId, i.productId]),
    ).toEqual([["service", serviceId, null]]);
    // Saved again from the edit page, with products off.
    const saved = await updateQuote(
      CLINIC,
      quote!.id,
      form(
        loaded!.items.map((i) => ({
          kind: i.kind,
          serviceId: i.serviceId,
          sessions: String(i.sessions),
          unitPrice: "150,00",
          discount: "",
        })),
      ),
      actorId,
      { productsOn: false },
    );
    expect(saved.ok).toBe(true);
    const saleId = await approve(quote!.id, { plan: "per_session" });
    const found = await sale(saleId);
    expect(found.items.map((i) => [i.kind, i.sessions])).toEqual([
      ["service", 3],
    ]);
    expect(found.installments).toHaveLength(3);
  });

  it("saving a quote with an inactive product is refused", async () => {
    const quoteId = await created([serviceItem(), productItem()]);
    await db
      .update(products)
      .set({ isActive: false })
      .where(eq(products.id, productId));

    const again = await updateQuote(
      CLINIC,
      quoteId,
      form([serviceItem(), productItem()]),
      actorId,
      ON,
    );
    expect(again).toEqual({
      ok: false,
      formError: "Este produto não está mais ativo.",
    });
    const fresh = await createQuote(CLINIC, form([productItem()]), actorId, ON);
    expect(fresh.ok).toBe(false);
    const copy = await duplicateQuote(
      CLINIC,
      quoteId,
      "2026-11-30",
      actorId,
      ON,
    );
    expect(copy.ok).toBe(false);

    // A product of another clinic is never accepted either.
    const foreign = await newProduct(await otherClinic());
    const stranger = await createQuote(
      CLINIC,
      form([productItem(foreign)]),
      actorId,
      ON,
    );
    expect(stranger).toEqual({
      ok: false,
      formError: "Este produto não está mais ativo.",
    });
    expect(await db.select().from(quotes)).toHaveLength(1);
  });

  it("approving a saved quote whose product was deactivated still works", async () => {
    const quoteId = await created([productItem()]);
    await db
      .update(products)
      .set({ isActive: false, name: "Nome Novo" })
      .where(eq(products.id, productId));
    const saleId = await approve(quoteId, { plan: "upfront" });
    const found = await sale(saleId);
    expect(found.items.map((i) => [i.productId, i.serviceName])).toEqual([
      [productId, "Hidratante Fictício"],
    ]);
  });

  it("product item is refused while products module is off", async () => {
    const off = await createQuote(
      CLINIC,
      form([serviceItem(), productItem()]),
      actorId,
      { productsOn: false },
    );
    expect(off).toEqual({ ok: false, formError: MODULE_OFF_ERROR });
    // The default is off too.
    const byDefault = await createQuote(CLINIC, form([productItem()]), actorId);
    expect(byDefault).toEqual({ ok: false, formError: MODULE_OFF_ERROR });

    const quoteId = await created([serviceItem()]);
    const update = await updateQuote(
      CLINIC,
      quoteId,
      form([serviceItem(), productItem()]),
      actorId,
      { productsOn: false },
    );
    expect(update).toEqual({ ok: false, formError: MODULE_OFF_ERROR });
    expect(await db.select().from(quoteItems)).toHaveLength(1);

    // Services alone still save with products off.
    const services = await createQuote(CLINIC, form([serviceItem()]), actorId, {
      productsOn: false,
    });
    expect(services.ok).toBe(true);
  });

  it("scheduling sessions on a product item is refused", async () => {
    const quoteId = await created([serviceItem("2"), productItem()]);
    const saleId = await approve(quoteId, { plan: "per_session" });
    const product = (await sale(saleId)).items[1]!;

    const scheduled = await scheduleSessions(
      CLINIC,
      scheduleSessionsSchema.parse({
        saleItemId: product.id,
        durationMinutes: "60",
        slots: [{ date: "2026-11-05", startTime: "10:00" }],
      }),
      actorId,
      NOW,
    );
    expect(scheduled).toEqual({
      ok: false,
      formError: "Produto não tem sessões.",
    });
    expect(await db.select().from(appointments)).toHaveLength(0);

    for (const action of ["add_sessions", "remove_sessions"]) {
      const revised = await reviseSale(
        CLINIC,
        saleId,
        reviseSchema.parse({
          reason: "Teste",
          action,
          saleItemId: product.id,
          sessions: "1",
          sessionPrice: "59,90",
        }),
        actorId,
        TODAY,
        NOW,
      );
      expect(revised).toEqual({
        ok: false,
        formError: "Produto não tem sessões.",
      });
    }
    const [item] = await db
      .select()
      .from(saleItems)
      .where(eq(saleItems.id, product.id));
    expect(item!.sessions).toBe(2);
  });
});
