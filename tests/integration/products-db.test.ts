import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { clientDb, inClinic } from "@/db/client";
import { findPgError } from "@/db/errors";
import { db, endPools } from "@/db/owner";
import { createClinic } from "@/modules/clinics/clinics";

import { CLINIC, otherClinic, productCategory } from "../helpers/clinic";

// Migration 0028: product categories, "show on page", and products as quote
// and sale items. Every record is fictitious.

let other: string;
let patientId: string;
let serviceId: string;
let productId: string;
let quoteId: string;
let saleId: string;

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

// The "Outros" category, created for a clinic made by otherClinic.
const otherCategory = productCategory;

beforeAll(async () => {
  other = await otherClinic("clinica-produtos-teste");
  await otherCategory(other);
  patientId = (
    await one<{ id: string }>(
      sql`insert into patients (clinic_id, name, name_normalized, phone)
          values (${CLINIC}, 'Paciente Produto', 'paciente produto', '+5511900000301')
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
      sql`insert into products (clinic_id, category_id, name, price_cents)
          values (${CLINIC}, ${await otherCategory(CLINIC)}, 'Sérum Fictício', 5000)
          returning id`,
    )
  ).id;
  quoteId = (
    await one<{ id: string }>(
      sql`insert into quotes (clinic_id, number, patient_id, valid_until)
          values (${CLINIC}, 9301, ${patientId}, '2033-01-01') returning id`,
    )
  ).id;
  saleId = (
    await one<{ id: string }>(
      sql`insert into sales (clinic_id, quote_id, patient_id, payment_plan, total_cents)
          values (${CLINIC}, ${quoteId}, ${patientId}, 'upfront', 0) returning id`,
    )
  ).id;
});

afterAll(async () => {
  if (saleId) {
    await db.execute(sql`delete from sale_items where sale_id = ${saleId}`);
    await db.execute(sql`delete from sales where id = ${saleId}`);
  }
  if (quoteId) {
    await db.execute(sql`delete from quote_items where quote_id = ${quoteId}`);
    await db.execute(sql`delete from quotes where id = ${quoteId}`);
  }
  await db.execute(
    sql`delete from products
        where clinic_id = ${CLINIC} and name in ('Sérum Fictício', 'Fora da página')`,
  );
  if (patientId) {
    await db.execute(sql`delete from patients where id = ${patientId}`);
  }
  await endPools();
});

describe("products database", () => {
  it("every clinic has the Outros product category and old products are in it", async () => {
    // The clinic the migrations made (other test clinics skip createClinic).
    const grais = await db.execute(
      sql`select name, sort_order from product_categories
          where clinic_id = ${CLINIC}`,
    );
    expect(grais.rows).toEqual([{ name: "Outros", sort_order: 999 }]);

    // Every clinic and the backfill, on a database of its own with the
    // migrations up to 0027 and products the way the old code made them.
    const migrated = await migrateOldProducts();
    expect(migrated).toEqual([
      {
        name: "Ativo",
        category: "Outros",
        same_clinic: true,
        is_active: true,
        show_on_page: true,
      },
      {
        name: "Inativo",
        category: "Outros",
        same_clinic: true,
        is_active: true,
        show_on_page: false,
      },
      {
        name: "Outra clínica",
        category: "Outros",
        same_clinic: true,
        is_active: true,
        show_on_page: true,
      },
    ]);
  }, 120_000); // replays every migration on a database of its own

  it("a clinic cannot see another clinic's product categories", async () => {
    const theirs = await otherCategory(other);
    const seen = await inClinic(CLINIC, (tx) =>
      tx.execute(sql`select id from product_categories where id = ${theirs}`),
    );
    expect(seen.rows).toEqual([]);

    const insert = await failure(
      inClinic(CLINIC, (tx) =>
        tx.execute(
          sql`insert into product_categories (clinic_id, name)
              values (${other}, 'Intrusa')`,
        ),
      ),
    );
    expect(insert.code).toBe("42501");

    const mine = await inClinic(CLINIC, (tx) =>
      tx.execute(
        sql`select name from product_categories where clinic_id = ${CLINIC}`,
      ),
    );
    expect(mine.rows).toContainEqual({ name: "Outros" });
  });

  it("app_client does not see an active product hidden from the page", async () => {
    const category = await otherCategory(CLINIC);
    const hidden = await one<{ id: string }>(
      sql`insert into products (clinic_id, category_id, name, show_on_page)
          values (${CLINIC}, ${category}, 'Fora da página', false) returning id`,
    );
    const rows = await clientDb.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.clinic_id', ${CLINIC}, true)`,
      );
      const result = await tx.execute<{ id: string; show_on_page: boolean }>(
        sql`select id, show_on_page from products`,
      );
      return result.rows;
    });
    expect(rows.map((row) => row.id)).toContain(productId);
    expect(rows.map((row) => row.id)).not.toContain(hidden.id);
  });

  it("a quote item must have exactly one of service or product", async () => {
    const quoteItem = (service: string | null, product: string | null) =>
      db.execute(
        sql`insert into quote_items (clinic_id, quote_id, service_id, product_id,
              service_name, sessions, unit_price_cents)
            values (${CLINIC}, ${quoteId}, ${service}, ${product}, 'Item', 1, 100)`,
      );
    for (const [service, product] of [
      [serviceId, productId],
      [null, null],
    ] as const) {
      expect(await failure(quoteItem(service, product))).toEqual({
        code: "23514",
        constraint: "quote_items_kind_check",
      });
    }
    await quoteItem(serviceId, null);
    await quoteItem(null, productId);
    // The old code never names product_id.
    await db.execute(
      sql`insert into quote_items (clinic_id, quote_id, service_id,
            service_name, sessions, unit_price_cents)
          values (${CLINIC}, ${quoteId}, ${serviceId}, 'Antigo', 1, 100)`,
    );

    const saleItem = (service: string | null, product: string | null) =>
      db.execute(
        sql`insert into sale_items (clinic_id, sale_id, service_id, product_id,
              service_name, sessions, total_cents)
            values (${CLINIC}, ${saleId}, ${service}, ${product}, 'Item', 1, 100)`,
      );
    for (const [service, product] of [
      [serviceId, productId],
      [null, null],
    ] as const) {
      expect(await failure(saleItem(service, product))).toEqual({
        code: "23514",
        constraint: "sale_items_kind_check",
      });
    }
    await saleItem(serviceId, null);
    await saleItem(null, productId);

    // A product of the item is never deleted.
    expect(
      (
        await failure(
          db.execute(sql`delete from products where id = ${productId}`),
        )
      ).code,
    ).toBe("23503");
  });

  it("createClinic creates the Outros product category", async () => {
    const root = await one<{ id: string }>(
      sql`insert into users (name, email, role)
          values ('Root', 'produtos-root@example.com', 'root') returning id`,
    );
    const result = await createClinic(
      { name: "Clínica Produtos Nova", slug: "clinica-produtos-nova" },
      root.id,
    );
    if (!result.ok) throw new Error("expected ok");
    const categories = await db.execute(
      sql`select name from product_categories where clinic_id = ${result.id}`,
    );
    expect(categories.rows).toEqual([{ name: "Outros" }]);
  });
});

// Applies every migration before 0028 to a fresh database, inserts products
// as the old code did (no category, no show_on_page), applies 0028 and returns
// the products afterwards.
async function migrateOldProducts() {
  const databaseName = "clinic_scheduler_products_migration_test";
  const adminUrl = new URL(process.env.DATABASE_URL!);
  adminUrl.pathname = "/postgres";
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${databaseName}`;

  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`drop database if exists ${databaseName} with (force)`);
  await admin.query(`create database ${databaseName}`);
  await admin.end();

  const tags = readdirSync(join(process.cwd(), "drizzle"))
    .filter((file) => file.endsWith(".sql"))
    .map((file) => file.slice(0, -4))
    .sort();
  const before = tags.filter((tag) => tag < "0028");
  const target = tags.find((tag) => tag.startsWith("0028"));
  if (!target) throw new Error("migration 0028 not found");

  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const apply = async (tag: string) => {
      const statements = readFileSync(
        join(process.cwd(), "drizzle", `${tag}.sql`),
        "utf8",
      )
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter(Boolean);
      for (const statement of statements) await client.query(statement);
    };
    for (const tag of before) await apply(tag);

    const otherId = "00000000-0000-4000-8000-0000000003c1";
    await client.query(
      `insert into clinics (id, slug, name) values ($1, 'outra-produtos', 'Outra')`,
      [otherId],
    );
    await client.query(
      `insert into products (clinic_id, name, is_active) values
       ('00000000-0000-4000-8000-000000000100', 'Ativo', true),
       ('00000000-0000-4000-8000-000000000100', 'Inativo', false),
       ($1, 'Outra clínica', true)`,
      [otherId],
    );

    await client.query("begin");
    await apply(target);
    await client.query("commit");

    const { rows } = await client.query(
      `select p.name, pc.name as category, pc.clinic_id = p.clinic_id as same_clinic,
              p.is_active, p.show_on_page
       from products p join product_categories pc on pc.id = p.category_id
       order by p.name`,
    );
    return rows;
  } finally {
    await client.end();
    const cleanup = new Client({ connectionString: adminUrl.toString() });
    await cleanup.connect();
    await cleanup.query(`drop database if exists ${databaseName} with (force)`);
    await cleanup.end();
  }
}
