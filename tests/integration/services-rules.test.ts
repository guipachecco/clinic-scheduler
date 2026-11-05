import { readFileSync } from "node:fs";
import { join } from "node:path";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/owner";
import {
  FLEXIBLE_SERVICE_SLUG,
  OTHER_CATEGORY_SLUG,
  serviceCategories,
  services,
  users,
} from "@/db/schema";
import { createClinic } from "@/modules/clinics/clinics";

afterAll(async () => {
  await endPools();
});

describe("migrations", () => {
  it("registers the service migrations in order and applies all of them", async () => {
    const journal = JSON.parse(
      readFileSync(
        join(process.cwd(), "drizzle", "meta", "_journal.json"),
        "utf8",
      ),
    ) as { entries: { tag: string }[] };
    const tags = journal.entries.map((entry) => entry.tag);
    const start = tags.indexOf("0003_patient_registry");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(tags.slice(start + 1, start + 3)).toEqual([
      "0004_service_flexible",
      "0005_flexible_service_seed",
    ]);

    const result = await db.execute(
      sql`select count(*)::int as count from drizzle.__drizzle_migrations`,
    );
    expect(result.rows[0].count).toBe(tags.length);
  });
});

// Every clinic starts with the "Outros" category and the flexible service:
// the first clinic from migration 0005, new ones from createClinic.
describe("flexible service seed", () => {
  async function newClinic(slug: string) {
    const [root] = await db
      .insert(users)
      .values({ name: "Root", email: `${slug}@example.com`, role: "root" })
      .returning({ id: users.id });
    const result = await createClinic(
      { name: "Clínica fictícia", slug },
      root!.id,
    );
    if (!result.ok) throw new Error("expected ok");
    return result.id;
  }

  it("seeds the Outros category and the flexible service", async () => {
    const clinicId = await newClinic("seed-flexivel");

    const [row] = await db
      .select({
        service: services,
        categorySlug: serviceCategories.slug,
      })
      .from(services)
      .innerJoin(
        serviceCategories,
        eq(services.categoryId, serviceCategories.id),
      )
      .where(
        and(
          eq(services.clinicId, clinicId),
          eq(services.slug, FLEXIBLE_SERVICE_SLUG),
        ),
      );

    expect(row.categorySlug).toBe(OTHER_CATEGORY_SLUG);
    expect(row.service).toMatchObject({
      name: "Avaliação / encaixe",
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      priceDisplay: "hidden",
      priceCents: null,
      requiresApproval: false,
      onlineBookingEnabled: false,
      isActive: true,
      isFlexible: true,
      sortOrder: 0,
    });
    const categories = await db
      .select()
      .from(serviceCategories)
      .where(
        and(
          eq(serviceCategories.clinicId, clinicId),
          eq(serviceCategories.slug, OTHER_CATEGORY_SLUG),
        ),
      );
    expect(categories).toHaveLength(1);
    expect(categories[0]).toMatchObject({ isActive: true, sortOrder: 999 });
  });

  it("refuses a second clinic with the same address", async () => {
    await newClinic("endereco-repetido");
    const [root] = await db
      .insert(users)
      .values({ name: "Root", email: "root2@example.com", role: "root" })
      .returning({ id: users.id });
    const result = await createClinic(
      { name: "Outra", slug: "endereco-repetido" },
      root!.id,
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: { slug: "Já existe uma clínica com este endereço." },
    });
  });

  it("defaults is_flexible to false", async () => {
    const clinicId = await newClinic("seed-padrao");
    const [category] = await db
      .select()
      .from(serviceCategories)
      .where(
        and(
          eq(serviceCategories.clinicId, clinicId),
          eq(serviceCategories.slug, OTHER_CATEGORY_SLUG),
        ),
      );
    const [service] = await db
      .insert(services)
      .values({
        clinicId,
        categoryId: category.id,
        name: "Serviço comum",
        slug: "servico-comum-flex-test",
        durationMinutes: 45,
      })
      .returning();
    expect(service.isFlexible).toBe(false);
  });
});
