import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { clientDb, inClinic } from "@/db/client";
import { findPgError } from "@/db/errors";
import { db, endPools } from "@/db/owner";

import { CLINIC, otherClinic, productCategory } from "../helpers/clinic";

// Migration 0029: products.stock_quantity and the stock movements history.
// Every record is fictitious.

let other: string;
let patientId: string;
let serviceId: string;
let productId: string;
let otherProductId: string;
let appointmentId: string;
let quoteId: string;
let saleId: string;
let saleItemId: string;

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const pg = findPgError(error) as
      (Error & { code: string; constraint?: string }) | undefined;
    return { code: pg?.code, constraint: pg?.constraint };
  }
  throw new Error("expected the query to fail");
}

async function one<T>(query: ReturnType<typeof sql>) {
  const result = await db.execute<T & Record<string, unknown>>(query);
  return result.rows[0]!;
}

type Movement = {
  clinic?: string;
  product?: string;
  kind: "entry" | "usage" | "handover" | "reversal";
  quantity: number;
  appointment?: string | null;
  saleItem?: string | null;
  reverses?: string | null;
  note?: string | null;
};

function movementSql(m: Movement) {
  return sql`insert into stock_movements (clinic_id, product_id, kind, quantity,
                appointment_id, sale_item_id, reverses_id, note)
              values (${m.clinic ?? CLINIC}, ${m.product ?? productId}, ${m.kind},
                ${m.quantity}, ${m.appointment ?? null}, ${m.saleItem ?? null},
                ${m.reverses ?? null}, ${m.note ?? null})
              returning id`;
}

async function movement(m: Movement) {
  return (await one<{ id: string }>(movementSql(m))).id;
}

beforeAll(async () => {
  other = await otherClinic("clinica-estoque-teste");
  patientId = (
    await one<{ id: string }>(
      sql`insert into patients (clinic_id, name, name_normalized, phone)
          values (${CLINIC}, 'Paciente Estoque', 'paciente estoque', '+5511900000401')
          returning id`,
    )
  ).id;
  serviceId = (
    await one<{ id: string }>(
      sql`select id from services where clinic_id = ${CLINIC} limit 1`,
    )
  ).id;
  productId = (
    await one<{ id: string }>(
      sql`insert into products (clinic_id, category_id, name)
          values (${CLINIC}, ${await productCategory(CLINIC)}, 'Creme Estoque')
          returning id`,
    )
  ).id;
  otherProductId = (
    await one<{ id: string }>(
      sql`insert into products (clinic_id, category_id, name)
          values (${other}, ${await productCategory(other)}, 'Creme Alheio')
          returning id`,
    )
  ).id;
  appointmentId = (
    await one<{ id: string }>(
      sql`insert into appointments (clinic_id, patient_id, service_id, service_name,
            service_duration_minutes, starts_at, ends_at, occupied_from,
            occupied_until, status, source)
          values (${CLINIC}, ${patientId}, ${serviceId}, 'Serviço', 30,
            '2034-03-01T13:00Z', '2034-03-01T13:30Z',
            '2034-03-01T13:00Z', '2034-03-01T13:30Z', 'confirmed', 'admin')
          returning id`,
    )
  ).id;
  quoteId = (
    await one<{ id: string }>(
      sql`insert into quotes (clinic_id, number, patient_id, valid_until)
          values (${CLINIC}, 9401, ${patientId}, '2034-01-01') returning id`,
    )
  ).id;
  saleId = (
    await one<{ id: string }>(
      sql`insert into sales (clinic_id, quote_id, patient_id, payment_plan, total_cents)
          values (${CLINIC}, ${quoteId}, ${patientId}, 'upfront', 0) returning id`,
    )
  ).id;
  saleItemId = (
    await one<{ id: string }>(
      sql`insert into sale_items (clinic_id, sale_id, product_id, service_name,
            sessions, total_cents)
          values (${CLINIC}, ${saleId}, ${productId}, 'Creme Estoque', 2, 0)
          returning id`,
    )
  ).id;
});

afterAll(async () => {
  await db.execute(
    sql`delete from stock_movements where product_id in (${productId}, ${otherProductId})
          and reverses_id is not null`,
  );
  await db.execute(
    sql`delete from stock_movements where product_id in (${productId}, ${otherProductId})`,
  );
  if (saleId) {
    await db.execute(sql`delete from sale_items where sale_id = ${saleId}`);
    await db.execute(sql`delete from sales where id = ${saleId}`);
  }
  if (quoteId) await db.execute(sql`delete from quotes where id = ${quoteId}`);
  if (appointmentId) {
    await db.execute(sql`delete from appointments where id = ${appointmentId}`);
  }
  await db.execute(
    sql`delete from products where id in (${productId}, ${otherProductId})`,
  );
  if (patientId) {
    await db.execute(sql`delete from patients where id = ${patientId}`);
  }
  await endPools();
});

describe("stock database", () => {
  it("app_panel cannot update or delete stock movements", async () => {
    const id = await movement({ kind: "entry", quantity: 5 });

    // It reads and inserts them in its own clinic.
    const seen = await inClinic(CLINIC, (tx) =>
      tx.execute(sql`select quantity from stock_movements where id = ${id}`),
    );
    expect(seen.rows).toEqual([{ quantity: 5 }]);
    await inClinic(CLINIC, (tx) =>
      tx.execute(movementSql({ kind: "entry", quantity: 1 })),
    );

    for (const statement of [
      sql`update stock_movements set quantity = 50 where id = ${id}`,
      sql`delete from stock_movements where id = ${id}`,
    ]) {
      expect(
        (await failure(inClinic(CLINIC, (tx) => tx.execute(statement)))).code,
      ).toBe("42501");
    }
  });

  it("stock_quantity cannot go below zero", async () => {
    const row = await one<{ stock_quantity: number }>(
      sql`select stock_quantity from products where id = ${productId}`,
    );
    expect(row.stock_quantity).toBe(0);

    // The panel keeps the balance (Task 2 updates it with each movement).
    await inClinic(CLINIC, (tx) =>
      tx.execute(
        sql`update products set stock_quantity = 3 where id = ${productId}`,
      ),
    );
    expect(
      await failure(
        inClinic(CLINIC, (tx) =>
          tx.execute(
            sql`update products set stock_quantity = stock_quantity - 4
                where id = ${productId}`,
          ),
        ),
      ),
    ).toEqual({ code: "23514", constraint: "products_stock_check" });
    await db.execute(
      sql`update products set stock_quantity = 0 where id = ${productId}`,
    );
  });

  it("app_client cannot read stock_quantity nor stock_movements", async () => {
    const asClient = (statement: ReturnType<typeof sql>) =>
      clientDb.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('app.clinic_id', ${CLINIC}, true)`,
        );
        return tx.execute(statement);
      });

    // The products page still works.
    const page = await asClient(sql`select id, name from products`);
    expect(page.rows.map((row) => row.id)).toContain(productId);

    for (const statement of [
      sql`select stock_quantity from products`,
      sql`select id from stock_movements`,
    ]) {
      expect((await failure(asClient(statement))).code).toBe("42501");
    }
  });

  it("movement checks: usage needs an appointment, handover needs a sale item, entry is positive, a movement is reversed at most once", async () => {
    const rejected = async (m: Movement, constraint: string) =>
      expect(await failure(db.execute(movementSql(m)))).toEqual({
        code: "23514",
        constraint,
      });
    const quantity = "stock_movements_quantity_check";
    const links = "stock_movements_links_check";
    const reverses = "stock_movements_reverses_check";

    // Sign of the quantity.
    await rejected({ kind: "entry", quantity: 0 }, quantity);
    await rejected({ kind: "entry", quantity: -1 }, quantity);
    await rejected(
      { kind: "usage", quantity: 1, appointment: appointmentId },
      quantity,
    );
    await rejected(
      { kind: "handover", quantity: 1, saleItem: saleItemId },
      quantity,
    );

    // Links.
    await rejected({ kind: "usage", quantity: -1 }, links);
    await rejected(
      { kind: "usage", quantity: -1, saleItem: saleItemId },
      links,
    );
    await rejected({ kind: "handover", quantity: -1 }, links);
    await rejected(
      {
        kind: "handover",
        quantity: -1,
        saleItem: saleItemId,
        appointment: appointmentId,
      },
      links,
    );
    await rejected(
      { kind: "entry", quantity: 1, appointment: appointmentId },
      links,
    );
    await rejected({ kind: "entry", quantity: 1, saleItem: saleItemId }, links);

    // Notes up to 200 characters.
    await rejected(
      { kind: "entry", quantity: 1, note: "x".repeat(201) },
      "stock_movements_note_check",
    );
    await movement({ kind: "entry", quantity: 1, note: "x".repeat(200) });

    // What is valid.
    const usage = await movement({
      kind: "usage",
      quantity: -1,
      appointment: appointmentId,
    });
    await movement({
      kind: "usage",
      quantity: -1,
      appointment: appointmentId,
      saleItem: saleItemId,
    });
    await movement({ kind: "handover", quantity: -1, saleItem: saleItemId });

    // Only a reversal points to the movement it reverses.
    await rejected({ kind: "reversal", quantity: 1 }, reverses);
    await rejected({ kind: "entry", quantity: 1, reverses: usage }, reverses);
    await rejected(
      { kind: "reversal", quantity: 0, reverses: usage },
      quantity,
    );

    await movement({
      kind: "reversal",
      quantity: 1,
      appointment: appointmentId,
      reverses: usage,
    });
    expect(
      await failure(
        db.execute(
          movementSql({
            kind: "reversal",
            quantity: 1,
            appointment: appointmentId,
            reverses: usage,
          }),
        ),
      ),
    ).toEqual({ code: "23505", constraint: "stock_movements_reverses_unique" });

    // The product, appointment and sale item are never deleted under it.
    for (const statement of [
      sql`delete from products where id = ${productId}`,
      sql`delete from appointments where id = ${appointmentId}`,
      sql`delete from sale_items where id = ${saleItemId}`,
      sql`delete from stock_movements where id = ${usage}`,
    ]) {
      expect((await failure(db.execute(statement))).code).toBe("23503");
    }
  });

  it("a clinic cannot see another clinic's movements", async () => {
    const theirs = await movement({
      clinic: other,
      product: otherProductId,
      kind: "entry",
      quantity: 2,
    });
    const seen = await inClinic(CLINIC, (tx) =>
      tx.execute(sql`select id from stock_movements where id = ${theirs}`),
    );
    expect(seen.rows).toEqual([]);

    // Not into another clinic, and never pointing to another clinic's rows.
    expect(
      (
        await failure(
          inClinic(CLINIC, (tx) =>
            tx.execute(
              movementSql({
                clinic: other,
                product: otherProductId,
                kind: "entry",
                quantity: 1,
              }),
            ),
          ),
        )
      ).code,
    ).toBe("42501");
    expect(
      (
        await failure(
          db.execute(
            movementSql({
              product: otherProductId,
              kind: "entry",
              quantity: 1,
            }),
          ),
        )
      ).code,
    ).toBe("23503");
    expect(
      (
        await failure(
          db.execute(
            movementSql({
              clinic: other,
              product: otherProductId,
              kind: "reversal",
              quantity: -1,
              reverses: await movement({ kind: "entry", quantity: 1 }),
            }),
          ),
        )
      ).code,
    ).toBe("23503");
  });
});
