import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/owner";
import {
  appointments,
  auditLogs,
  patients,
  products,
  quotes,
  saleItems,
  sales,
  serviceCategories,
  services,
  stockMovements,
  users,
} from "@/db/schema";
import { deleteProduct, listProductCatalog } from "@/modules/products/products";
import { entrySchema, usageSchema } from "@/modules/stock/fields";
import {
  getProductStock,
  handOverAll,
  listAppointmentUsage,
  listOpenSaleItems,
  recordEntry,
  recordUsage,
  reverseMovement,
  saleProductProgress,
} from "@/modules/stock/stock";

import { CLINIC, productCategory } from "../helpers/clinic";

// Stock entries, usages in appointments, handovers of sold products and
// their reversals. Every record here is fictitious and exists only during
// the test.

let actorId: string;
let patientId: string;
let otherPatientId: string;
let serviceId: string;
let productId: string;
let appointmentId: string;
let quoteNumber = 7000;
let slot = 0;

async function newProduct(name = "Creme Fictício", isActive = true) {
  const [row] = await db
    .insert(products)
    .values({
      clinicId: CLINIC,
      categoryId: await productCategory(CLINIC),
      name,
      isActive,
    })
    .returning({ id: products.id });
  return row!.id;
}

async function newAppointment(
  status: (typeof appointments.$inferInsert)["status"] = "confirmed",
  patient = patientId,
) {
  // One hour apart, so they never overlap.
  const startsAt = new Date(Date.UTC(2034, 2, 1, 0) + slot++ * 3_600_000);
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
  const [row] = await db
    .insert(appointments)
    .values({
      clinicId: CLINIC,
      patientId: patient,
      serviceId,
      serviceName: "Drenagem",
      serviceDurationMinutes: 30,
      startsAt,
      endsAt,
      occupiedFrom: startsAt,
      occupiedUntil: endsAt,
      status,
      source: "admin",
      ...(status === "cancelled"
        ? { cancelledAt: new Date(), cancelledBy: "clinic" as const }
        : {}),
    })
    .returning({ id: appointments.id });
  return row!.id;
}

// A sale of the given products, straight in the database (the finance
// module is tested elsewhere).
async function newSale(
  items: { productId: string; sold: number; name?: string }[],
  options: { patient?: string; cancelled?: boolean } = {},
) {
  const number = quoteNumber++;
  const patient = options.patient ?? patientId;
  const [quote] = await db
    .insert(quotes)
    .values({
      clinicId: CLINIC,
      number,
      patientId: patient,
      validUntil: "2034-01-01",
    })
    .returning({ id: quotes.id });
  const [sale] = await db
    .insert(sales)
    .values({
      clinicId: CLINIC,
      quoteId: quote!.id,
      patientId: patient,
      paymentPlan: "upfront",
      totalCents: 0,
      ...(options.cancelled
        ? { cancelledAt: new Date(), cancellationReason: "Teste" }
        : {}),
    })
    .returning({ id: sales.id });
  const rows = await db
    .insert(saleItems)
    .values(
      items.map((item, index) => ({
        clinicId: CLINIC,
        saleId: sale!.id,
        productId: item.productId,
        serviceName: item.name ?? "Produto",
        sessions: item.sold,
        totalCents: 0,
        sortOrder: index,
      })),
    )
    .returning({ id: saleItems.id });
  return { saleId: sale!.id, number, itemIds: rows.map((row) => row.id) };
}

async function stockOf(id: string) {
  const [row] = await db
    .select({ quantity: products.stockQuantity })
    .from(products)
    .where(eq(products.id, id));
  return row!.quantity;
}

async function movementSum(id: string) {
  const result = await db.execute<{ total: number }>(
    sql`select coalesce(sum(quantity), 0)::int as total from stock_movements where product_id = ${id}`,
  );
  return result.rows[0]!.total;
}

const entry = (quantity: number, note?: string) =>
  entrySchema.parse({ quantity: String(quantity), note });

const usage = (
  quantity: number,
  saleItemId: string | null = null,
  product = productId,
) =>
  usageSchema.parse({
    productId: product,
    quantity: String(quantity),
    saleItemId: saleItemId ?? "",
  });

async function ok(promise: Promise<{ ok: boolean }>) {
  const result = await promise;
  expect(result).toEqual({ ok: true });
}

const insufficient = (n: number) =>
  `Estoque insuficiente: há ${n}. Lance uma entrada primeiro.`;

const clear = () =>
  db.execute(
    sql`truncate table stock_movements, sale_revisions, payments, installments, sale_sessions, sale_items, sales, quote_items, quotes, audit_logs, appointments, patients, products, services, service_categories, users cascade`,
  );

beforeEach(async () => {
  await clear();
  const [user] = await db
    .insert(users)
    .values({
      name: "Admin Fictícia",
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
      durationMinutes: 30,
      priceCents: 15000,
      priceDisplay: "fixed",
      isActive: true,
    })
    .returning();
  serviceId = service!.id;
  const people = await db
    .insert(patients)
    .values([
      {
        clinicId: CLINIC,
        name: "Joana Fictícia",
        nameNormalized: "joana ficticia",
        phone: "+5548999990001",
      },
      {
        clinicId: CLINIC,
        name: "Maria Fictícia",
        nameNormalized: "maria ficticia",
        phone: "+5548999990002",
      },
    ])
    .returning();
  patientId = people[0]!.id;
  otherPatientId = people[1]!.id;
  productId = await newProduct();
  appointmentId = await newAppointment();
});

afterAll(async () => {
  await clear();
  await endPools();
});

describe("stock", () => {
  it("entries and usages keep stock_quantity equal to the sum of movements", async () => {
    await ok(recordEntry(CLINIC, productId, entry(10, "Lote 1"), actorId));
    await ok(recordUsage(CLINIC, appointmentId, usage(3), actorId));
    expect(await stockOf(productId)).toBe(7);
    expect(await movementSum(productId)).toBe(7);

    // Up to the last unit, never below it.
    expect(await recordUsage(CLINIC, appointmentId, usage(8), actorId)).toEqual(
      { ok: false, formError: insufficient(7) },
    );
    await ok(recordUsage(CLINIC, appointmentId, usage(7), actorId));
    expect(await stockOf(productId)).toBe(0);
    expect(await movementSum(productId)).toBe(0);

    const stock = await getProductStock(CLINIC, productId);
    expect(stock!.quantity).toBe(0);
    expect(stock!.history.map((m) => [m.kind, m.quantity])).toEqual([
      ["usage", -7],
      ["usage", -3],
      ["entry", 10],
    ]);
    expect(stock!.history[2]).toMatchObject({
      note: "Lote 1",
      actorName: "Admin Fictícia",
      origin: { type: "entry" },
      reversed: false,
    });
    expect(stock!.history[0]!.origin).toMatchObject({
      type: "appointment",
      appointmentId,
      patientName: "Joana Fictícia",
    });

    expect(await listAppointmentUsage(CLINIC, appointmentId)).toEqual([
      expect.objectContaining({ productName: "Creme Fictício", quantity: 7 }),
      expect.objectContaining({ productName: "Creme Fictício", quantity: 3 }),
    ]);

    // Ids and quantities only.
    const logs = await db
      .select({ action: auditLogs.action, changes: auditLogs.changes })
      .from(auditLogs)
      .where(eq(auditLogs.entityType, "stock_movement"));
    expect(logs.map((log) => log.action).sort()).toEqual([
      "stock.entry",
      "stock.usage",
      "stock.usage",
    ]);
    expect(JSON.stringify(logs)).not.toContain("Lote 1");

    // A product of another clinic, or inactive, is refused.
    const inactive = await newProduct("Inativo", false);
    await ok(recordEntry(CLINIC, inactive, entry(1), actorId));
    expect(
      (
        await recordUsage(
          CLINIC,
          appointmentId,
          usage(1, null, inactive),
          actorId,
        )
      ).ok,
    ).toBe(false);
    expect(await getProductStock(CLINIC, crypto.randomUUID())).toBeNull();
  });

  it("two concurrent usages with stock 1: one succeeds, one gets Estoque insuficiente", async () => {
    await ok(recordEntry(CLINIC, productId, entry(1), actorId));
    const results = await Promise.all([
      recordUsage(CLINIC, appointmentId, usage(1), actorId),
      recordUsage(CLINIC, appointmentId, usage(1), actorId),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, formError: insufficient(0) },
    ]);
    expect(await stockOf(productId)).toBe(0);
    expect(await movementSum(productId)).toBe(0);
  });

  it("usage linked to a sale cannot exceed what is left", async () => {
    await ok(recordEntry(CLINIC, productId, entry(20), actorId));
    const sale = await newSale([{ productId, sold: 3 }]);
    const [item] = sale.itemIds;

    expect(await listOpenSaleItems(CLINIC, patientId)).toEqual([
      {
        saleItemId: item,
        saleId: sale.saleId,
        saleNumber: sale.number,
        productId,
        productName: "Creme Fictício",
        remaining: 3,
      },
    ]);

    await ok(recordUsage(CLINIC, appointmentId, usage(2, item!), actorId));
    expect(
      await recordUsage(CLINIC, appointmentId, usage(2, item!), actorId),
    ).toEqual({
      ok: false,
      formError: `Na venda nº ${sale.number} faltam só 1.`,
    });
    expect(await listOpenSaleItems(CLINIC, patientId)).toEqual([
      expect.objectContaining({ saleItemId: item, remaining: 1 }),
    ]);
    expect(await saleProductProgress(CLINIC, sale.saleId)).toEqual([
      {
        saleItemId: item,
        productName: "Creme Fictício",
        sold: 3,
        done: 2,
        remaining: 1,
      },
    ]);
    expect(await listAppointmentUsage(CLINIC, appointmentId)).toEqual([
      expect.objectContaining({ quantity: 2, saleNumber: sale.number }),
    ]);

    await ok(recordUsage(CLINIC, appointmentId, usage(1, item!), actorId));
    expect(await listOpenSaleItems(CLINIC, patientId)).toEqual([]);
    expect(await stockOf(productId)).toBe(17);
  });

  it("usage refuses a sale item of another patient, another product or a cancelled sale", async () => {
    await ok(recordEntry(CLINIC, productId, entry(20), actorId));
    const otherProduct = await newProduct("Sérum Fictício");
    const theirs = await newSale([{ productId, sold: 5 }], {
      patient: otherPatientId,
    });
    const wrongProduct = await newSale([{ productId: otherProduct, sold: 5 }]);
    const cancelled = await newSale([{ productId, sold: 5 }], {
      cancelled: true,
    });

    for (const item of [theirs.itemIds[0]!, wrongProduct.itemIds[0]!]) {
      const result = await recordUsage(
        CLINIC,
        appointmentId,
        usage(1, item),
        actorId,
      );
      expect(result.ok).toBe(false);
    }
    expect(
      await recordUsage(
        CLINIC,
        appointmentId,
        usage(1, cancelled.itemIds[0]!),
        actorId,
      ),
    ).toEqual({ ok: false, formError: "Esta venda foi cancelada." });
    expect(
      (
        await recordUsage(
          CLINIC,
          appointmentId,
          usage(1, crypto.randomUUID()),
          actorId,
        )
      ).ok,
    ).toBe(false);

    // A cancelled sale never shows up to be picked.
    expect(await listOpenSaleItems(CLINIC, patientId)).toEqual([
      expect.objectContaining({ saleId: wrongProduct.saleId }),
    ]);
    expect(await stockOf(productId)).toBe(20);
    expect(await movementSum(productId)).toBe(20);
  });

  it("usage refuses an appointment that is not confirmed or completed", async () => {
    await ok(recordEntry(CLINIC, productId, entry(5), actorId));
    for (const status of ["requested", "cancelled", "no_show"] as const) {
      const id = await newAppointment(status);
      expect(await recordUsage(CLINIC, id, usage(1), actorId)).toEqual({
        ok: false,
        formError:
          "Só dá para registrar produto em atendimento confirmado ou concluído.",
      });
    }
    await ok(
      recordUsage(CLINIC, await newAppointment("completed"), usage(1), actorId),
    );
    expect(
      (await recordUsage(CLINIC, crypto.randomUUID(), usage(1), actorId)).ok,
    ).toBe(false);
    expect(await stockOf(productId)).toBe(4);
  });

  it("handOverAll is all or nothing and names the product without stock", async () => {
    const serum = await newProduct("Sérum Fictício");
    await ok(recordEntry(CLINIC, productId, entry(5), actorId));
    await ok(recordEntry(CLINIC, serum, entry(1), actorId));
    const sale = await newSale([
      { productId, sold: 3 },
      { productId: serum, sold: 2 },
    ]);
    await ok(
      recordUsage(CLINIC, appointmentId, usage(1, sale.itemIds[0]!), actorId),
    );

    expect(await handOverAll(CLINIC, sale.saleId, actorId)).toEqual({
      ok: false,
      formError:
        "Sérum Fictício: estoque insuficiente: há 1. Lance uma entrada primeiro.",
    });
    expect(await stockOf(productId)).toBe(4);
    expect(await stockOf(serum)).toBe(1);

    await ok(recordEntry(CLINIC, serum, entry(1), actorId));
    await ok(handOverAll(CLINIC, sale.saleId, actorId));
    expect(await stockOf(productId)).toBe(2);
    expect(await stockOf(serum)).toBe(0);
    expect(await movementSum(productId)).toBe(2);
    expect(await movementSum(serum)).toBe(0);
    expect(
      (await saleProductProgress(CLINIC, sale.saleId)).map((p) => [
        p.sold,
        p.done,
        p.remaining,
      ]),
    ).toEqual([
      [3, 3, 0],
      [2, 2, 0],
    ]);
    const history = (await getProductStock(CLINIC, serum))!.history;
    expect(history[0]).toMatchObject({
      kind: "handover",
      quantity: -2,
      origin: { type: "sale", saleId: sale.saleId, saleNumber: sale.number },
    });

    // Nothing is left, and a cancelled sale hands nothing over.
    expect((await handOverAll(CLINIC, sale.saleId, actorId)).ok).toBe(false);
    const cancelled = await newSale([{ productId, sold: 1 }], {
      cancelled: true,
    });
    expect(await handOverAll(CLINIC, cancelled.saleId, actorId)).toEqual({
      ok: false,
      formError: "Esta venda foi cancelada.",
    });
    expect(await stockOf(productId)).toBe(2);
  });

  it("reversing twice is refused", async () => {
    await ok(recordEntry(CLINIC, productId, entry(5), actorId));
    const sale = await newSale([{ productId, sold: 2 }]);
    await ok(
      recordUsage(CLINIC, appointmentId, usage(2, sale.itemIds[0]!), actorId),
    );
    const [used] = (await getProductStock(CLINIC, productId))!.history;
    expect(used!.kind).toBe("usage");

    // Clicked twice at once: one reversal.
    const results = await Promise.all([
      reverseMovement(CLINIC, used!.id, actorId),
      reverseMovement(CLINIC, used!.id, actorId),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, formError: "Esta baixa já foi desfeita." },
    ]);
    expect(await reverseMovement(CLINIC, used!.id, actorId)).toEqual({
      ok: false,
      formError: "Esta baixa já foi desfeita.",
    });
    expect(await stockOf(productId)).toBe(5);
    expect(await movementSum(productId)).toBe(5);

    // The reversal copies the links and gives the sale its units back.
    const [reversal] = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.reversesId, used!.id));
    expect(reversal).toMatchObject({
      kind: "reversal",
      quantity: 2,
      productId,
      appointmentId,
      saleItemId: sale.itemIds[0],
    });
    expect((await saleProductProgress(CLINIC, sale.saleId))[0]).toMatchObject({
      done: 0,
      remaining: 2,
    });
    const stock = (await getProductStock(CLINIC, productId))!;
    expect(stock.history.find((m) => m.id === used!.id)!.reversed).toBe(true);
    expect(
      (await listAppointmentUsage(CLINIC, appointmentId))[0]!.reversed,
    ).toBe(true);

    // A reversal is never reversed.
    expect((await reverseMovement(CLINIC, reversal!.id, actorId)).ok).toBe(
      false,
    );
    expect(
      (await reverseMovement(CLINIC, crypto.randomUUID(), actorId)).ok,
    ).toBe(false);
    expect(await stockOf(productId)).toBe(5);
  });

  it("reversing an entry cannot make stock negative", async () => {
    await ok(recordEntry(CLINIC, productId, entry(3), actorId));
    const [entered] = (await getProductStock(CLINIC, productId))!.history;
    await ok(recordUsage(CLINIC, appointmentId, usage(2), actorId));

    expect(await reverseMovement(CLINIC, entered!.id, actorId)).toEqual({
      ok: false,
      formError: insufficient(1),
    });
    expect(await stockOf(productId)).toBe(1);

    await ok(recordEntry(CLINIC, productId, entry(2), actorId));
    await ok(reverseMovement(CLINIC, entered!.id, actorId));
    expect(await stockOf(productId)).toBe(0);
    expect(await movementSum(productId)).toBe(0);
  });

  it("a product with stock history cannot be deleted", async () => {
    await ok(recordEntry(CLINIC, productId, entry(4), actorId));
    const listed = (await listProductCatalog(CLINIC))
      .flatMap((category) => category.products)
      .find((product) => product.id === productId);
    expect(listed).toMatchObject({ inUse: true, stockQuantity: 4 });
    expect(await deleteProduct(CLINIC, productId, actorId)).toEqual({
      ok: false,
      reason: "in_use",
    });
    expect(await stockOf(productId)).toBe(4);
  });
});
