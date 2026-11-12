import "server-only";

import { and, asc, count, eq, sql } from "drizzle-orm";

import { inClinic, type Tx } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import {
  auditLogs,
  PRODUCT_OTHER_CATEGORY_NAME,
  productCategories,
  products,
  quoteItems,
  saleItems,
  stockMovements,
} from "@/db/schema";

import type {
  ProductCategoryFormInput,
  ProductCategoryFormValues,
  ProductFormInput,
  ProductFormValues,
} from "./fields";

// Data functions for the products catalog of one clinic, as app_panel inside
// the clinic (inClinic). Every function takes the clinicId from the session
// and never reads or writes another clinic. Values never go to audit_logs or
// into error messages.

export type ProductResult =
  | { ok: true; id: string }
  | {
      ok: false;
      fieldErrors: Partial<
        Record<keyof ProductFormInput | keyof ProductCategoryFormInput, string>
      >;
    };

export type DeleteProductResult =
  { ok: true } | { ok: false; reason: "not_found" | "in_use" };

export type ProductRecord = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  showOnPage: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type ProductListItem = {
  id: string;
  name: string;
  priceCents: number | null;
  showOnPage: boolean;
  isActive: boolean;
  // Units in stock (products.stock_quantity).
  stockQuantity: number;
  // Cited by a quote, a sale or a stock movement: it can be deactivated but
  // never deleted.
  inUse: boolean;
};

export type ProductCatalogCategory = {
  id: string;
  name: string;
  isActive: boolean;
  products: ProductListItem[];
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CATEGORY_TAKEN = "Já existe uma categoria com este nome.";
const CATEGORY_MISSING = "Escolha uma categoria existente.";

const EXAMPLE_PRODUCTS = [
  { name: "Protetor solar FPS 50", priceCents: 7990 },
  { name: "Hidratante facial", priceCents: 6990 },
  { name: "Sérum de vitamina C", priceCents: 9500 },
] as const;

const PRODUCT_KEYS = [
  "categoryId",
  "name",
  "description",
  "priceCents",
  "showOnPage",
  "isActive",
] as const satisfies readonly (keyof ProductFormValues)[];

// Never lets driver details (which can echo values) out of this module.
function unexpected(error: unknown): Error {
  return new Error("Não foi possível salvar o cadastro.", { cause: error });
}

// The clinic's "Outros" category. A clinic created by older code, before the
// category existed, gets it here; two requests at once make one.
async function otherCategoryId(tx: Tx, clinicId: string): Promise<string> {
  await tx
    .insert(productCategories)
    .values({
      clinicId,
      name: PRODUCT_OTHER_CATEGORY_NAME,
      sortOrder: 999,
    })
    .onConflictDoNothing({
      target: [productCategories.clinicId, productCategories.name],
    });
  const [row] = await tx
    .select({ id: productCategories.id })
    .from(productCategories)
    .where(
      and(
        eq(productCategories.clinicId, clinicId),
        eq(productCategories.name, PRODUCT_OTHER_CATEGORY_NAME),
      ),
    )
    .limit(1);
  return row!.id;
}

async function categoryExists(tx: Tx, clinicId: string, id: string) {
  const [row] = await tx
    .select({ id: productCategories.id })
    .from(productCategories)
    .where(
      and(
        eq(productCategories.id, id),
        eq(productCategories.clinicId, clinicId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

// New products go to the end of the list.
async function nextSortOrder(tx: Tx, clinicId: string): Promise<number> {
  const [row] = await tx
    .select({ next: sql<number>`coalesce(max(${products.sortOrder}), -1) + 1` })
    .from(products)
    .where(eq(products.clinicId, clinicId));
  return Number(row?.next ?? 0);
}

export async function createProduct(
  clinicId: string,
  values: ProductFormValues,
  actorUserId: string,
): Promise<ProductResult> {
  try {
    return await inClinic(clinicId, async (tx): Promise<ProductResult> => {
      if (!(await categoryExists(tx, clinicId, values.categoryId))) {
        return { ok: false, fieldErrors: { categoryId: CATEGORY_MISSING } };
      }
      const [row] = await tx
        .insert(products)
        .values({
          ...values,
          clinicId,
          sortOrder: await nextSortOrder(tx, clinicId),
        })
        .returning({ id: products.id });
      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: "product.created",
        entityType: "product",
        entityId: row!.id,
      });
      return { ok: true, id: row!.id };
    });
  } catch (error) {
    throw unexpected(error);
  }
}

// A missing id returns { ok: false, fieldErrors: {} } and writes nothing.
export async function updateProduct(
  clinicId: string,
  id: string,
  values: ProductFormValues,
  actorUserId: string,
): Promise<ProductResult> {
  if (!UUID_PATTERN.test(id)) return { ok: false, fieldErrors: {} };
  try {
    return await inClinic(clinicId, async (tx): Promise<ProductResult> => {
      const [current] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, id), eq(products.clinicId, clinicId)))
        .for("update");
      if (!current) return { ok: false, fieldErrors: {} };
      if (!(await categoryExists(tx, clinicId, values.categoryId))) {
        return { ok: false, fieldErrors: { categoryId: CATEGORY_MISSING } };
      }

      const fields = PRODUCT_KEYS.filter((key) => current[key] !== values[key]);
      if (fields.length === 0) return { ok: true, id };

      await tx
        .update(products)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(products.id, id), eq(products.clinicId, clinicId)));
      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: "product.updated",
        entityType: "product",
        entityId: id,
        changes: { fields },
      });
      return { ok: true, id };
    });
  } catch (error) {
    throw unexpected(error);
  }
}

export async function getProduct(
  clinicId: string,
  id: string,
): Promise<ProductRecord | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const [row] = await inClinic(clinicId, (tx) =>
    tx
      .select({
        id: products.id,
        categoryId: products.categoryId,
        name: products.name,
        description: products.description,
        priceCents: products.priceCents,
        showOnPage: products.showOnPage,
        isActive: products.isActive,
        sortOrder: products.sortOrder,
      })
      .from(products)
      .where(and(eq(products.id, id), eq(products.clinicId, clinicId)))
      .limit(1),
  );
  return row ?? null;
}

// A product cited by a quote, a sale or a stock movement is never deleted
// (deactivate it).
export async function deleteProduct(
  clinicId: string,
  id: string,
  actorUserId: string,
): Promise<DeleteProductResult> {
  if (!UUID_PATTERN.test(id)) return { ok: false, reason: "not_found" };
  try {
    return await inClinic(
      clinicId,
      async (tx): Promise<DeleteProductResult> => {
        const [current] = await tx
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.id, id), eq(products.clinicId, clinicId)))
          .for("update");
        if (!current) return { ok: false, reason: "not_found" };
        const [quoted] = await tx
          .select({ total: count() })
          .from(quoteItems)
          .where(
            and(
              eq(quoteItems.clinicId, clinicId),
              eq(quoteItems.productId, id),
            ),
          );
        const [sold] = await tx
          .select({ total: count() })
          .from(saleItems)
          .where(
            and(eq(saleItems.clinicId, clinicId), eq(saleItems.productId, id)),
          );
        const [moved] = await tx
          .select({ total: count() })
          .from(stockMovements)
          .where(
            and(
              eq(stockMovements.clinicId, clinicId),
              eq(stockMovements.productId, id),
            ),
          );
        if (
          Number(quoted?.total ?? 0) +
            Number(sold?.total ?? 0) +
            Number(moved?.total ?? 0) >
          0
        ) {
          return { ok: false, reason: "in_use" };
        }
        await tx
          .delete(products)
          .where(and(eq(products.id, id), eq(products.clinicId, clinicId)));
        await tx.insert(auditLogs).values({
          clinicId,
          actorType: "admin",
          actorUserId,
          action: "product.deleted",
          entityType: "product",
          entityId: id,
        });
        return { ok: true };
      },
    );
  } catch (error) {
    throw unexpected(error);
  }
}

async function categoryNameTaken(
  tx: Tx,
  clinicId: string,
  name: string,
  excludeId?: string,
) {
  const [row] = await tx
    .select({ id: productCategories.id })
    .from(productCategories)
    .where(
      and(
        eq(productCategories.clinicId, clinicId),
        sql`lower(${productCategories.name}) = lower(${name})`,
        excludeId ? sql`${productCategories.id} <> ${excludeId}` : undefined,
      ),
    )
    .limit(1);
  return Boolean(row);
}

const nameTaken = (): ProductResult => ({
  ok: false,
  fieldErrors: { name: CATEGORY_TAKEN },
});

export async function createProductCategory(
  clinicId: string,
  values: ProductCategoryFormValues,
  actorUserId: string,
): Promise<ProductResult> {
  try {
    return await inClinic(clinicId, async (tx): Promise<ProductResult> => {
      if (await categoryNameTaken(tx, clinicId, values.name)) {
        return nameTaken();
      }
      // New categories go before "Outros" (sort order 999).
      const [last] = await tx
        .select({
          next: sql<number>`coalesce(max(${productCategories.sortOrder}) filter (where ${productCategories.sortOrder} < 999), -1) + 1`,
        })
        .from(productCategories)
        .where(eq(productCategories.clinicId, clinicId));
      const [row] = await tx
        .insert(productCategories)
        .values({
          clinicId,
          name: values.name,
          sortOrder: Number(last?.next ?? 0),
        })
        .returning({ id: productCategories.id });
      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: "product_category.created",
        entityType: "product_category",
        entityId: row!.id,
      });
      return { ok: true, id: row!.id };
    });
  } catch (error) {
    if (isUniqueViolation(error, "product_categories_clinic_name_unique")) {
      return nameTaken();
    }
    throw unexpected(error);
  }
}

export async function updateProductCategory(
  clinicId: string,
  id: string,
  values: ProductCategoryFormValues,
  actorUserId: string,
): Promise<ProductResult> {
  if (!UUID_PATTERN.test(id)) return { ok: false, fieldErrors: {} };
  try {
    return await inClinic(clinicId, async (tx): Promise<ProductResult> => {
      const [current] = await tx
        .select()
        .from(productCategories)
        .where(
          and(
            eq(productCategories.id, id),
            eq(productCategories.clinicId, clinicId),
          ),
        )
        .for("update");
      if (!current) return { ok: false, fieldErrors: {} };
      if (await categoryNameTaken(tx, clinicId, values.name, id)) {
        return nameTaken();
      }
      if (current.name === values.name) return { ok: true, id };

      await tx
        .update(productCategories)
        .set({ name: values.name, updatedAt: new Date() })
        .where(
          and(
            eq(productCategories.id, id),
            eq(productCategories.clinicId, clinicId),
          ),
        );
      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: "product_category.updated",
        entityType: "product_category",
        entityId: id,
        changes: { fields: ["name"] },
      });
      return { ok: true, id };
    });
  } catch (error) {
    if (isUniqueViolation(error, "product_categories_clinic_name_unique")) {
      return nameTaken();
    }
    throw unexpected(error);
  }
}

// Every category (empty ones too) with its products, inactive ones included,
// for the admin list.
export async function listProductCatalog(
  clinicId: string,
): Promise<ProductCatalogCategory[]> {
  // One transaction runs one query at a time: each is awaited in turn.
  const [categories, rows] = await inClinic(clinicId, async (tx) => {
    // A clinic created by older code has no "Outros" yet: make it, so the
    // new-product form never offers an empty select.
    await otherCategoryId(tx, clinicId);
    const categoryRows = await tx
      .select()
      .from(productCategories)
      .where(eq(productCategories.clinicId, clinicId))
      .orderBy(
        asc(productCategories.sortOrder),
        asc(productCategories.name),
        asc(productCategories.id),
      );
    const productRows = await tx
      .select({
        id: products.id,
        categoryId: products.categoryId,
        name: products.name,
        priceCents: products.priceCents,
        showOnPage: products.showOnPage,
        isActive: products.isActive,
        stockQuantity: products.stockQuantity,
        // Column names are written out: inside the subquery an unqualified
        // clinic_id would mean the subquery's own table.
        inUse: sql<boolean>`(
          exists (select 1 from quote_items qi where qi.clinic_id = "products"."clinic_id" and qi.product_id = "products"."id")
          or exists (select 1 from sale_items si where si.clinic_id = "products"."clinic_id" and si.product_id = "products"."id")
          or exists (select 1 from stock_movements sm where sm.clinic_id = "products"."clinic_id" and sm.product_id = "products"."id")
        )`,
      })
      .from(products)
      .where(eq(products.clinicId, clinicId))
      .orderBy(asc(products.sortOrder), asc(products.name), asc(products.id));
    return [categoryRows, productRows] as const;
  });
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    isActive: category.isActive,
    products: rows
      .filter((row) => row.categoryId === category.id)
      .map((row) => ({
        id: row.id,
        name: row.name,
        priceCents: row.priceCents,
        showOnPage: row.showOnPage,
        isActive: row.isActive,
        stockQuantity: row.stockQuantity,
        inUse: row.inUse,
      })),
  }));
}

// Active products, for the quote.
export async function listActiveProducts(
  clinicId: string,
): Promise<{ id: string; name: string; priceCents: number | null }[]> {
  return inClinic(clinicId, (tx) =>
    tx
      .select({
        id: products.id,
        name: products.name,
        priceCents: products.priceCents,
      })
      .from(products)
      .where(and(eq(products.clinicId, clinicId), eq(products.isActive, true)))
      .orderBy(asc(products.sortOrder), asc(products.name), asc(products.id)),
  );
}

// Fills an empty product list with three examples, all in "Outros"; returns
// how many it added.
export async function addExampleProducts(clinicId: string): Promise<number> {
  return inClinic(clinicId, async (tx) => {
    // Two clicks at once must not both see an empty list.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('products'), hashtext(${clinicId}))`,
    );
    const [existing] = await tx
      .select({ total: count() })
      .from(products)
      .where(eq(products.clinicId, clinicId));
    if (Number(existing?.total ?? 0) > 0) return 0;
    const categoryId = await otherCategoryId(tx, clinicId);
    await tx.insert(products).values(
      EXAMPLE_PRODUCTS.map((product, index) => ({
        clinicId,
        categoryId,
        name: product.name,
        priceCents: product.priceCents,
        isActive: true,
        showOnPage: true,
        sortOrder: index,
      })),
    );
    return EXAMPLE_PRODUCTS.length;
  });
}
