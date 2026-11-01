import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, pool } from "@/db/client";
import { auditLogs, serviceCategories, services, users } from "@/db/schema";
import {
  categoryFormSchema,
  serviceFormSchema,
  type CategoryFormValues,
  type ServiceFormValues,
} from "@/modules/services/fields";
import {
  createCategory,
  createService,
  getService,
  listActiveServices,
  listCatalog,
  updateCategory,
  updateService,
} from "@/modules/services/services";

let actorId: string;
let categoryId: string;

function form(overrides: Record<string, unknown> = {}): ServiceFormValues {
  return serviceFormSchema.parse({
    categoryId,
    name: "Limpeza de Pele",
    description: "Limpeza profunda.",
    durationMinutes: "75",
    bufferBeforeMinutes: "5",
    bufferAfterMinutes: "10",
    price: "1.250,00",
    priceDisplay: "starting_at",
    requiresApproval: "on",
    onlineBookingEnabled: "on",
    preparationInstructions: "Vir sem maquiagem.",
    isActive: "on",
    sortOrder: "3",
    ...overrides,
  });
}

function catForm(overrides: Record<string, unknown> = {}): CategoryFormValues {
  return categoryFormSchema.parse({
    name: "Facial",
    isActive: "on",
    sortOrder: "1",
    ...overrides,
  });
}

async function createdService(overrides: Record<string, unknown> = {}) {
  const r = await createService(form(overrides), actorId);
  if (!r.ok) throw new Error("expected create to succeed");
  return r.id;
}

beforeEach(async () => {
  await db.execute(
    sql`truncate table audit_logs, appointments, services, service_categories, users cascade`,
  );
  const [user] = await db
    .insert(users)
    .values({ name: "Admin", email: "admin@example.com", role: "admin" })
    .returning();
  actorId = user!.id;
  const r = await createCategory(catForm(), actorId);
  if (!r.ok) throw new Error("category");
  categoryId = r.id;
  await db.delete(auditLogs);
});

afterAll(async () => {
  await pool.end();
});

describe("createService / getService", () => {
  it("round-trips every field", async () => {
    const id = await createdService();
    expect(await getService(id)).toMatchObject({
      id,
      categoryId,
      name: "Limpeza de Pele",
      slug: "limpeza-de-pele",
      description: "Limpeza profunda.",
      durationMinutes: 75,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 10,
      priceCents: 125000,
      priceDisplay: "starting_at",
      requiresApproval: true,
      onlineBookingEnabled: true,
      preparationInstructions: "Vir sem maquiagem.",
      isFlexible: false,
      isActive: true,
      sortOrder: 3,
    });
  });

  it("returns null for a non-UUID or missing id", async () => {
    expect(await getService("nope")).toBeNull();
    expect(await getService("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("writes an audit row without values", async () => {
    const id = await createdService();
    const rows = await db.select().from(auditLogs);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "service.created",
      actorType: "admin",
      actorUserId: actorId,
      entityType: "service",
      entityId: id,
    });
    expect(rows[0]!.changes ?? null).toBeNull();
    expect(JSON.stringify(rows[0])).not.toContain("Limpeza");
  });

  it("rejects a duplicate name with a name error", async () => {
    await createdService();
    const r = await createService(form({ name: "LIMPEZA de pele" }), actorId);
    expect(r).toEqual({
      ok: false,
      fieldErrors: { name: "Já existe um serviço com este nome." },
    });
  });

  it("reports a missing category", async () => {
    const r = await createService(
      form({ categoryId: "00000000-0000-4000-8000-000000000000" }),
      actorId,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.categoryId).toBeDefined();
  });
});

describe("updateService", () => {
  it("writes the changed field names and keeps the slug on rename", async () => {
    const id = await createdService();
    await db.delete(auditLogs);
    const r = await updateService(
      id,
      form({ name: "Limpeza Profunda", durationMinutes: "80" }),
      actorId,
    );
    expect(r).toEqual({ ok: true, id });
    const rec = await getService(id);
    expect(rec!.slug).toBe("limpeza-de-pele");
    expect(rec!.name).toBe("Limpeza Profunda");
    const [row] = await db.select().from(auditLogs);
    expect(row).toMatchObject({
      action: "service.updated",
      entityId: id,
      actorUserId: actorId,
      actorType: "admin",
    });
    expect((row!.changes as { fields: string[] }).fields.sort()).toEqual([
      "durationMinutes",
      "name",
    ]);
  });

  it("writes nothing when nothing changed", async () => {
    const id = await createdService();
    await db.delete(auditLogs);
    expect(await updateService(id, form(), actorId)).toEqual({ ok: true, id });
    expect(await db.select().from(auditLogs)).toHaveLength(0);
  });

  it("rejects renaming to another service's name", async () => {
    await createdService();
    const id = await createdService({ name: "Peeling" });
    const r = await updateService(
      id,
      form({ name: "limpeza de pele" }),
      actorId,
    );
    expect(r).toEqual({
      ok: false,
      fieldErrors: { name: "Já existe um serviço com este nome." },
    });
  });

  it("returns an empty failure for a missing id", async () => {
    expect(await updateService("nope", form(), actorId)).toEqual({
      ok: false,
      fieldErrors: {},
    });
  });

  it("keeps isFlexible true", async () => {
    const [row] = await db
      .insert(services)
      .values({
        categoryId,
        name: "Avaliação / encaixe",
        slug: "avaliacao-encaixe",
        durationMinutes: 30,
        isFlexible: true,
      })
      .returning();
    const r = await updateService(
      row!.id,
      form({ name: "Avaliação / encaixe" }),
      actorId,
    );
    expect(r.ok).toBe(true);
    const [after] = await db
      .select()
      .from(services)
      .where(eq(services.id, row!.id));
    expect(after!.isFlexible).toBe(true);
  });
});

describe("listCatalog", () => {
  it("orders categories and services and includes inactive ones", async () => {
    const b = await createCategory(
      catForm({ name: "Corporal", sortOrder: "0", isActive: false }),
      actorId,
    );
    if (!b.ok) throw new Error("cat");
    await createdService({ name: "Zeta", sortOrder: "0" });
    await createdService({ name: "Alfa", sortOrder: "0" });
    await createdService({ name: "Beta", sortOrder: "1", isActive: false });
    await createdService({ name: "Massagem", categoryId: b.id });

    const catalog = await listCatalog();
    expect(catalog.map((c) => c.name)).toEqual(["Corporal", "Facial"]);
    expect(catalog[0]!.isActive).toBe(false);
    expect(catalog[0]!.services.map((s) => s.name)).toEqual(["Massagem"]);
    expect(catalog[1]!.services.map((s) => s.name)).toEqual([
      "Alfa",
      "Zeta",
      "Beta",
    ]);
  });
});

describe("listActiveServices", () => {
  it("excludes inactive services and services in inactive categories", async () => {
    await createdService({ name: "Ativo" });
    await createdService({ name: "Inativo", isActive: false });
    const c = await createCategory(
      catForm({ name: "Off", isActive: false }),
      actorId,
    );
    if (!c.ok) throw new Error("cat");
    await createdService({ name: "Em categoria off", categoryId: c.id });

    const list = await listActiveServices();
    expect(list).toEqual([
      {
        id: expect.any(String),
        name: "Ativo",
        categoryName: "Facial",
        durationMinutes: 75,
        bufferBeforeMinutes: 5,
        bufferAfterMinutes: 10,
        isFlexible: false,
      },
    ]);
  });
});

describe("categories", () => {
  it("creates with an audit row", async () => {
    const r = await createCategory(catForm({ name: "Capilar" }), actorId);
    if (!r.ok) throw new Error("cat");
    const [row] = await db
      .select()
      .from(serviceCategories)
      .where(eq(serviceCategories.id, r.id));
    expect(row).toMatchObject({
      name: "Capilar",
      slug: "capilar",
      isActive: true,
      sortOrder: 1,
    });
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, r.id));
    expect(logs[0]).toMatchObject({
      action: "service_category.created",
      entityType: "service_category",
      actorType: "admin",
      actorUserId: actorId,
    });
  });

  it("renames keeping the slug, deactivates, and audits the fields", async () => {
    const r = await createCategory(catForm({ name: "Capilar" }), actorId);
    if (!r.ok) throw new Error("cat");
    const u = await updateCategory(
      r.id,
      catForm({ name: "Cabelo", isActive: false }),
      actorId,
    );
    expect(u).toEqual({ ok: true, id: r.id });
    const [row] = await db
      .select()
      .from(serviceCategories)
      .where(eq(serviceCategories.id, r.id));
    expect(row).toMatchObject({
      name: "Cabelo",
      slug: "capilar",
      isActive: false,
    });
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "service_category.updated"));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      entityId: r.id,
      actorUserId: actorId,
      actorType: "admin",
    });
    expect((logs[0]!.changes as { fields: string[] }).fields.sort()).toEqual([
      "isActive",
      "name",
    ]);
  });

  it("rejects duplicate names on create and rename", async () => {
    const msg = { name: "Já existe uma categoria com este nome." };
    expect(await createCategory(catForm({ name: "FACIAL" }), actorId)).toEqual({
      ok: false,
      fieldErrors: msg,
    });
    const r = await createCategory(catForm({ name: "Capilar" }), actorId);
    if (!r.ok) throw new Error("cat");
    expect(
      await updateCategory(r.id, catForm({ name: "facial" }), actorId),
    ).toEqual({ ok: false, fieldErrors: msg });
  });
});
