import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { auditLogs, serviceCategories, services } from "@/db/schema";

import {
  slugify,
  type CategoryFormInput,
  type CategoryFormValues,
  type ServiceFormInput,
  type ServiceFormValues,
} from "./fields";

// Data functions for the services catalog. Nothing is ever deleted and the
// panel never touches is_flexible. No field values go to audit_logs or into
// error messages.

export type ServiceResult =
  | { ok: true; id: string }
  | {
      ok: false;
      fieldErrors: Partial<
        Record<keyof ServiceFormInput | keyof CategoryFormInput, string>
      >;
    };

export type ServiceRecord = {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  priceCents: number | null;
  priceDisplay: ServiceFormValues["priceDisplay"];
  requiresApproval: boolean;
  onlineBookingEnabled: boolean;
  preparationInstructions: string | null;
  isFlexible: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type ServiceListItem = {
  id: string;
  name: string;
  slug: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  priceCents: number | null;
  priceDisplay: ServiceFormValues["priceDisplay"];
  isFlexible: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type CatalogCategory = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder: number;
  services: ServiceListItem[];
};

export type ActiveService = {
  id: string;
  name: string;
  categoryName: string;
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  isFlexible: boolean;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SERVICE_TAKEN = "Já existe um serviço com este nome.";
const CATEGORY_TAKEN = "Já existe uma categoria com este nome.";
const CATEGORY_MISSING = "Escolha uma categoria existente.";

const SERVICE_KEYS = [
  "categoryId",
  "name",
  "description",
  "durationMinutes",
  "bufferBeforeMinutes",
  "bufferAfterMinutes",
  "priceCents",
  "priceDisplay",
  "requiresApproval",
  "onlineBookingEnabled",
  "preparationInstructions",
  "isActive",
  "sortOrder",
] as const satisfies readonly (keyof ServiceFormValues)[];

const CATEGORY_KEYS = [
  "name",
  "isActive",
  "sortOrder",
] as const satisfies readonly (keyof CategoryFormValues)[];

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const nameFail = (message: string): ServiceResult => ({
  ok: false,
  fieldErrors: { name: message },
});

// Never lets driver details (which can echo values) out of this module.
function unexpected(error: unknown): Error {
  return new Error("Não foi possível salvar o cadastro.", { cause: error });
}

async function serviceNameTaken(
  tx: Pick<Tx, "select">,
  name: string,
  excludeId?: string,
) {
  const [row] = await tx
    .select({ id: services.id })
    .from(services)
    .where(
      and(
        sql`(${services.slug} = ${slugify(name)} or lower(${services.name}) = lower(${name}))`,
        excludeId ? sql`${services.id} <> ${excludeId}` : undefined,
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function categoryNameTaken(
  tx: Pick<Tx, "select">,
  name: string,
  excludeId?: string,
) {
  const [row] = await tx
    .select({ id: serviceCategories.id })
    .from(serviceCategories)
    .where(
      and(
        sql`(${serviceCategories.slug} = ${slugify(name)} or lower(${serviceCategories.name}) = lower(${name}))`,
        excludeId ? sql`${serviceCategories.id} <> ${excludeId}` : undefined,
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function createService(
  values: ServiceFormValues,
  actorUserId: string,
): Promise<ServiceResult> {
  try {
    return await db.transaction(async (tx): Promise<ServiceResult> => {
      const [category] = await tx
        .select({ id: serviceCategories.id })
        .from(serviceCategories)
        .where(eq(serviceCategories.id, values.categoryId))
        .limit(1);
      if (!category) {
        return { ok: false, fieldErrors: { categoryId: CATEGORY_MISSING } };
      }
      if (await serviceNameTaken(tx, values.name)) {
        return nameFail(SERVICE_TAKEN);
      }
      const [row] = await tx
        .insert(services)
        .values({ ...values, slug: slugify(values.name) })
        .returning({ id: services.id });
      await tx.insert(auditLogs).values({
        actorType: "admin",
        actorUserId,
        action: "service.created",
        entityType: "service",
        entityId: row!.id,
      });
      return { ok: true, id: row!.id };
    });
  } catch (error) {
    if (isUniqueViolation(error, "services_slug_unique")) {
      return nameFail(SERVICE_TAKEN);
    }
    throw unexpected(error);
  }
}

// A missing id returns { ok: false, fieldErrors: {} } and writes nothing.
// The slug and is_flexible are never changed.
export async function updateService(
  id: string,
  values: ServiceFormValues,
  actorUserId: string,
): Promise<ServiceResult> {
  if (!UUID_PATTERN.test(id)) return { ok: false, fieldErrors: {} };
  try {
    return await db.transaction(async (tx): Promise<ServiceResult> => {
      const [current] = await tx
        .select()
        .from(services)
        .where(eq(services.id, id))
        .for("update");
      if (!current) return { ok: false, fieldErrors: {} };

      const [category] = await tx
        .select({ id: serviceCategories.id })
        .from(serviceCategories)
        .where(eq(serviceCategories.id, values.categoryId))
        .limit(1);
      if (!category) {
        return { ok: false, fieldErrors: { categoryId: CATEGORY_MISSING } };
      }
      if (await serviceNameTaken(tx, values.name, id)) {
        return nameFail(SERVICE_TAKEN);
      }

      const fields = SERVICE_KEYS.filter((key) => current[key] !== values[key]);
      if (fields.length === 0) return { ok: true, id };

      await tx.update(services).set(values).where(eq(services.id, id));
      await tx.insert(auditLogs).values({
        actorType: "admin",
        actorUserId,
        action: "service.updated",
        entityType: "service",
        entityId: id,
        changes: { fields },
      });
      return { ok: true, id };
    });
  } catch (error) {
    throw unexpected(error);
  }
}

export async function createCategory(
  values: CategoryFormValues,
  actorUserId: string,
): Promise<ServiceResult> {
  try {
    return await db.transaction(async (tx): Promise<ServiceResult> => {
      if (await categoryNameTaken(tx, values.name)) {
        return nameFail(CATEGORY_TAKEN);
      }
      const [row] = await tx
        .insert(serviceCategories)
        .values({ ...values, slug: slugify(values.name) })
        .returning({ id: serviceCategories.id });
      await tx.insert(auditLogs).values({
        actorType: "admin",
        actorUserId,
        action: "service_category.created",
        entityType: "service_category",
        entityId: row!.id,
      });
      return { ok: true, id: row!.id };
    });
  } catch (error) {
    if (isUniqueViolation(error, "service_categories_slug_unique")) {
      return nameFail(CATEGORY_TAKEN);
    }
    throw unexpected(error);
  }
}

export async function updateCategory(
  id: string,
  values: CategoryFormValues,
  actorUserId: string,
): Promise<ServiceResult> {
  if (!UUID_PATTERN.test(id)) return { ok: false, fieldErrors: {} };
  try {
    return await db.transaction(async (tx): Promise<ServiceResult> => {
      const [current] = await tx
        .select()
        .from(serviceCategories)
        .where(eq(serviceCategories.id, id))
        .for("update");
      if (!current) return { ok: false, fieldErrors: {} };
      if (await categoryNameTaken(tx, values.name, id)) {
        return nameFail(CATEGORY_TAKEN);
      }

      const fields = CATEGORY_KEYS.filter(
        (key) => current[key] !== values[key],
      );
      if (fields.length === 0) return { ok: true, id };

      await tx
        .update(serviceCategories)
        .set(values)
        .where(eq(serviceCategories.id, id));
      await tx.insert(auditLogs).values({
        actorType: "admin",
        actorUserId,
        action: "service_category.updated",
        entityType: "service_category",
        entityId: id,
        changes: { fields },
      });
      return { ok: true, id };
    });
  } catch (error) {
    throw unexpected(error);
  }
}

export async function getService(id: string): Promise<ServiceRecord | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const [row] = await db
    .select({
      id: services.id,
      categoryId: services.categoryId,
      name: services.name,
      slug: services.slug,
      description: services.description,
      durationMinutes: services.durationMinutes,
      bufferBeforeMinutes: services.bufferBeforeMinutes,
      bufferAfterMinutes: services.bufferAfterMinutes,
      priceCents: services.priceCents,
      priceDisplay: services.priceDisplay,
      requiresApproval: services.requiresApproval,
      onlineBookingEnabled: services.onlineBookingEnabled,
      preparationInstructions: services.preparationInstructions,
      isFlexible: services.isFlexible,
      isActive: services.isActive,
      sortOrder: services.sortOrder,
    })
    .from(services)
    .where(eq(services.id, id))
    .limit(1);
  return row ?? null;
}

// Every category and service, inactive ones included, for the admin list.
export async function listCatalog(): Promise<CatalogCategory[]> {
  const [categories, rows] = await Promise.all([
    db
      .select()
      .from(serviceCategories)
      .orderBy(asc(serviceCategories.sortOrder), asc(serviceCategories.name)),
    db
      .select({
        id: services.id,
        categoryId: services.categoryId,
        name: services.name,
        slug: services.slug,
        durationMinutes: services.durationMinutes,
        bufferBeforeMinutes: services.bufferBeforeMinutes,
        bufferAfterMinutes: services.bufferAfterMinutes,
        priceCents: services.priceCents,
        priceDisplay: services.priceDisplay,
        isFlexible: services.isFlexible,
        isActive: services.isActive,
        sortOrder: services.sortOrder,
      })
      .from(services)
      .orderBy(asc(services.sortOrder), asc(services.name)),
  ]);
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    isActive: category.isActive,
    sortOrder: category.sortOrder,
    services: rows
      .filter((row) => row.categoryId === category.id)
      .map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        durationMinutes: row.durationMinutes,
        bufferBeforeMinutes: row.bufferBeforeMinutes,
        bufferAfterMinutes: row.bufferAfterMinutes,
        priceCents: row.priceCents,
        priceDisplay: row.priceDisplay,
        isFlexible: row.isFlexible,
        isActive: row.isActive,
        sortOrder: row.sortOrder,
      })),
  }));
}

// Active services in active categories, for scheduling.
export async function listActiveServices(): Promise<ActiveService[]> {
  return db
    .select({
      id: services.id,
      name: services.name,
      categoryName: serviceCategories.name,
      durationMinutes: services.durationMinutes,
      bufferBeforeMinutes: services.bufferBeforeMinutes,
      bufferAfterMinutes: services.bufferAfterMinutes,
      isFlexible: services.isFlexible,
    })
    .from(services)
    .innerJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
    .where(
      and(eq(services.isActive, true), eq(serviceCategories.isActive, true)),
    )
    .orderBy(
      asc(serviceCategories.sortOrder),
      asc(serviceCategories.name),
      asc(services.sortOrder),
      asc(services.name),
    );
}
