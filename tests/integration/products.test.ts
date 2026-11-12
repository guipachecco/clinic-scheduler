import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/owner";
import {
  auditLogs,
  clinics,
  PRODUCT_OTHER_CATEGORY_NAME,
  productCategories,
  products,
  users,
} from "@/db/schema";
import { getClinicPage } from "@/modules/clinic-page/public";
import {
  productCategoryFormSchema,
  productFormSchema,
} from "@/modules/products/fields";
import {
  addExampleProducts,
  createProduct,
  createProductCategory,
  deleteProduct,
  getProduct,
  listActiveProducts,
  listProductCatalog,
  updateProduct,
  updateProductCategory,
} from "@/modules/products/products";

import { otherClinic, productCategory } from "../helpers/clinic";

// The products module: catalog, categories and the delete rule. Every record
// is fictitious and lives in clinics of its own, cleaned up at the end.

const SLUG_A = "clinica-modulo-produtos-a";
const SLUG_B = "clinica-modulo-produtos-b";
const SLUG_OLD = "clinica-modulo-produtos-antiga";

let clinicA: string;
let clinicB: string;
let actorId: string;
let outrosA: string;
let outrosB: string;

function form(categoryId: string, overrides: Record<string, unknown> = {}) {
  return productFormSchema.parse({
    name: "Hidratante Fictício",
    categoryId,
    description: "",
    price: "59,90",
    showOnPage: true,
    isActive: true,
    ...overrides,
  });
}

function catForm(name: string) {
  return productCategoryFormSchema.parse({ name });
}

async function newCategory(clinicId: string, name: string) {
  const result = await createProductCategory(clinicId, catForm(name), actorId);
  if (!result.ok) throw new Error("expected the category to be created");
  return result.id;
}

async function newProduct(
  clinicId: string,
  categoryId: string,
  overrides: Record<string, unknown> = {},
) {
  const result = await createProduct(
    clinicId,
    form(categoryId, overrides),
    actorId,
  );
  if (!result.ok) throw new Error("expected the product to be created");
  return result.id;
}

async function clearClinic(clinicId: string) {
  await db.execute(sql`delete from quote_items where clinic_id = ${clinicId}`);
  await db.execute(sql`delete from quotes where clinic_id = ${clinicId}`);
  await db.delete(products).where(eq(products.clinicId, clinicId));
  await db
    .delete(productCategories)
    .where(
      and(
        eq(productCategories.clinicId, clinicId),
        sql`${productCategories.name} <> ${PRODUCT_OTHER_CATEGORY_NAME}`,
      ),
    );
  await db.delete(auditLogs).where(eq(auditLogs.clinicId, clinicId));
}

beforeAll(async () => {
  clinicA = await otherClinic(SLUG_A);
  clinicB = await otherClinic(SLUG_B);
  outrosA = await productCategory(clinicA);
  outrosB = await productCategory(clinicB);
  await clearClinic(clinicA);
  await clearClinic(clinicB);
  const [admin] = await db
    .insert(users)
    .values({
      name: "Admin Produtos",
      email: "admin@modulo-produtos.example.test",
      role: "admin",
      clinicId: clinicA,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: { clinicId: clinicA },
    })
    .returning({ id: users.id });
  actorId = admin!.id;
});

afterAll(async () => {
  for (const id of [clinicA, clinicB]) await clearClinic(id);
  const [old] = await db
    .select({ id: clinics.id })
    .from(clinics)
    .where(eq(clinics.slug, SLUG_OLD));
  if (old) {
    await db.delete(products).where(eq(products.clinicId, old.id));
    await db
      .delete(productCategories)
      .where(eq(productCategories.clinicId, old.id));
  }
  await db.delete(auditLogs).where(eq(auditLogs.actorUserId, actorId));
  await db.delete(users).where(eq(users.id, actorId));
  await endPools();
});

describe("product catalog", () => {
  it("groups products by category, empty categories included", async () => {
    await clearClinic(clinicA);
    const cremes = await newCategory(clinicA, "Cremes");
    await newCategory(clinicA, "Vazia");
    await newProduct(clinicA, cremes, { name: "Creme B" });
    await newProduct(clinicA, cremes, { name: "Creme A", price: "" });
    await newProduct(clinicA, outrosA, { name: "Brinde", isActive: false });

    const catalog = await listProductCatalog(clinicA);
    expect(catalog.map((c) => c.name)).toEqual([
      "Cremes",
      "Vazia",
      PRODUCT_OTHER_CATEGORY_NAME,
    ]);
    expect(catalog[0]!.products.map((p) => p.name)).toEqual([
      "Creme B",
      "Creme A",
    ]);
    expect(catalog[0]!.products[0]).toMatchObject({
      priceCents: 5990,
      showOnPage: true,
      isActive: true,
      inUse: false,
    });
    expect(catalog[1]!.products).toEqual([]);
    expect(catalog[2]!.products).toMatchObject([
      { name: "Brinde", isActive: false },
    ]);
  });

  it("never lists another clinic's products or categories", async () => {
    await newProduct(clinicB, outrosB, { name: "Só da B" });
    const names = (await listProductCatalog(clinicA)).flatMap((c) =>
      c.products.map((p) => p.name),
    );
    expect(names).not.toContain("Só da B");
    const active = await listActiveProducts(clinicA);
    expect(active.map((p) => p.name)).not.toContain("Só da B");
    expect(active.map((p) => p.name)).not.toContain("Brinde");
  });

  it("refuses a category of another clinic or a missing one", async () => {
    const before = (await listProductCatalog(clinicA)).flatMap(
      (c) => c.products,
    ).length;
    for (const categoryId of [
      outrosB,
      "00000000-0000-4000-8000-000000000000",
    ]) {
      expect(
        await createProduct(clinicA, form(categoryId, { name: "X" }), actorId),
      ).toEqual({
        ok: false,
        fieldErrors: { categoryId: "Escolha uma categoria existente." },
      });
    }
    const id = await newProduct(clinicA, outrosA, { name: "Para mover" });
    expect(
      await updateProduct(clinicA, id, form(outrosB), actorId),
    ).toMatchObject({
      ok: false,
      fieldErrors: { categoryId: expect.any(String) },
    });
    expect((await getProduct(clinicA, id))?.categoryId).toBe(outrosA);
    const after = (await listProductCatalog(clinicA)).flatMap(
      (c) => c.products,
    ).length;
    expect(after).toBe(before + 1);
  });

  it("updates a product, audits the fields and skips no-op saves", async () => {
    const id = await newProduct(clinicA, outrosA, { name: "Auditado" });
    await db.delete(auditLogs).where(eq(auditLogs.entityId, id));
    expect(
      await updateProduct(
        clinicA,
        id,
        form(outrosA, { name: "Auditado", price: "10,00", showOnPage: false }),
        actorId,
      ),
    ).toEqual({ ok: true, id });
    expect(await getProduct(clinicA, id)).toMatchObject({
      priceCents: 1000,
      showOnPage: false,
      isActive: true,
    });
    const rows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "product.updated",
      changes: { fields: ["priceCents", "showOnPage"] },
    });
    // Saving the same values writes nothing.
    await updateProduct(
      clinicA,
      id,
      form(outrosA, { name: "Auditado", price: "10,00", showOnPage: false }),
      actorId,
    );
    expect(
      await db.select().from(auditLogs).where(eq(auditLogs.entityId, id)),
    ).toHaveLength(1);
    expect(await updateProduct(clinicB, id, form(outrosB), actorId)).toEqual({
      ok: false,
      fieldErrors: {},
    });
  });

  it("deletes only a product that was never quoted", async () => {
    const free = await newProduct(clinicA, outrosA, { name: "Sem uso" });
    expect(await deleteProduct(clinicA, free, actorId)).toEqual({ ok: true });
    expect(await getProduct(clinicA, free)).toBeNull();
    expect(await deleteProduct(clinicA, free, actorId)).toEqual({
      ok: false,
      reason: "not_found",
    });

    const used = await newProduct(clinicA, outrosA, { name: "Com uso" });
    const patient = (
      await db.execute<{ id: string }>(
        sql`insert into patients (clinic_id, name, name_normalized, phone)
            values (${clinicA}, 'Paciente Produtos', 'paciente produtos', '+5511900000377')
            on conflict do nothing returning id`,
      )
    ).rows[0];
    const patientId =
      patient?.id ??
      (
        await db.execute<{ id: string }>(
          sql`select id from patients where clinic_id = ${clinicA} and phone = '+5511900000377'`,
        )
      ).rows[0]!.id;
    const quote = (
      await db.execute<{ id: string }>(
        sql`insert into quotes (clinic_id, number, patient_id, valid_until)
            values (${clinicA}, 9401, ${patientId}, '2033-01-01') returning id`,
      )
    ).rows[0]!;
    await db.execute(
      sql`insert into quote_items (clinic_id, quote_id, product_id, service_name, sessions, unit_price_cents)
          values (${clinicA}, ${quote.id}, ${used}, 'Com uso', 1, 5000)`,
    );
    try {
      expect(await deleteProduct(clinicA, used, actorId)).toEqual({
        ok: false,
        reason: "in_use",
      });
      expect(await getProduct(clinicA, used)).not.toBeNull();
      const item = (await listProductCatalog(clinicA))
        .flatMap((c) => c.products)
        .find((p) => p.id === used);
      expect(item?.inUse).toBe(true);
    } finally {
      await db.execute(
        sql`delete from quote_items where quote_id = ${quote.id}`,
      );
      await db.execute(sql`delete from quotes where id = ${quote.id}`);
      await db.execute(sql`delete from patients where id = ${patientId}`);
    }
  });
});

describe("product categories", () => {
  it("refuses a repeated name and allows the same name in another clinic", async () => {
    await newCategory(clinicA, "Maquiagem");
    const expected = {
      ok: false,
      fieldErrors: { name: "Já existe uma categoria com este nome." },
    };
    expect(
      await createProductCategory(clinicA, catForm("Maquiagem"), actorId),
    ).toEqual(expected);
    expect(
      await createProductCategory(clinicA, catForm("maquiagem"), actorId),
    ).toEqual(expected);
    expect(
      (await createProductCategory(clinicB, catForm("Maquiagem"), actorId)).ok,
    ).toBe(true);
  });

  it("renames a category and refuses a name already taken", async () => {
    const id = await newCategory(clinicA, "Corpo");
    expect(
      await updateProductCategory(
        clinicA,
        id,
        catForm("Corpo e banho"),
        actorId,
      ),
    ).toEqual({ ok: true, id });
    expect((await listProductCatalog(clinicA)).map((c) => c.name)).toContain(
      "Corpo e banho",
    );
    expect(
      await updateProductCategory(
        clinicA,
        id,
        catForm(PRODUCT_OTHER_CATEGORY_NAME),
        actorId,
      ),
    ).toMatchObject({ ok: false, fieldErrors: { name: expect.any(String) } });
    expect(
      await updateProductCategory(clinicB, id, catForm("Outro"), actorId),
    ).toEqual({ ok: false, fieldErrors: {} });
  });
});

describe("example products", () => {
  it("adds three examples to Outros, once", async () => {
    const throwaway = await otherClinic(SLUG_OLD);
    expect(await addExampleProducts(throwaway)).toBe(3);
    expect(await addExampleProducts(throwaway)).toBe(0);
    const catalog = await listProductCatalog(throwaway);
    const outros = catalog.find((c) => c.name === PRODUCT_OTHER_CATEGORY_NAME);
    expect(outros!.products.map((p) => p.priceCents).sort()).toEqual([
      6990, 7990, 9500,
    ]);
  });

  it("makes Outros for a clinic created by older code", async () => {
    const throwaway = await otherClinic(SLUG_OLD);
    await db.delete(products).where(eq(products.clinicId, throwaway));
    await db
      .delete(productCategories)
      .where(eq(productCategories.clinicId, throwaway));
    expect(await addExampleProducts(throwaway)).toBe(3);
    const rows = await db
      .select({ name: productCategories.name })
      .from(productCategories)
      .where(inArray(productCategories.clinicId, [throwaway]));
    expect(rows).toEqual([{ name: PRODUCT_OTHER_CATEGORY_NAME }]);
  });

  it("lists Outros for a clinic without product categories", async () => {
    const throwaway = await otherClinic(SLUG_OLD);
    await db.delete(products).where(eq(products.clinicId, throwaway));
    await db
      .delete(productCategories)
      .where(eq(productCategories.clinicId, throwaway));
    const catalog = await listProductCatalog(throwaway);
    expect(catalog.map((c) => c.name)).toEqual([PRODUCT_OTHER_CATEGORY_NAME]);
    // Listing again does not make a second one.
    expect(await listProductCatalog(throwaway)).toHaveLength(1);
  });
});

describe("clinic page", () => {
  it("shows only products that are active and shown on the page", async () => {
    await clearClinic(clinicA);
    await newProduct(clinicA, outrosA, { name: "Visível" });
    await newProduct(clinicA, outrosA, {
      name: "Escondido",
      showOnPage: false,
    });
    await newProduct(clinicA, outrosA, { name: "Inativo", isActive: false });
    const page = (await getClinicPage(SLUG_A))!;
    expect(page.products.map((p) => p.name)).toEqual(["Visível"]);
  });
});
