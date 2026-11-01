import { readFileSync } from "node:fs";
import { join } from "node:path";

import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { db, pool } from "@/db/client";
import {
  FLEXIBLE_SERVICE_SLUG,
  OTHER_CATEGORY_SLUG,
  serviceCategories,
  services,
} from "@/db/schema";

afterAll(async () => {
  await pool.end();
});

// Other test files truncate services and service_categories, and file order
// is not guaranteed. The seed migration is idempotent (on conflict do
// nothing), so running its SQL again restores the rows exactly as the
// migration leaves them, and checks the SQL itself.
async function applySeedMigration() {
  const file = readFileSync(
    join(process.cwd(), "drizzle", "0005_flexible_service_seed.sql"),
    "utf8",
  );
  for (const statement of file.split("--> statement-breakpoint")) {
    if (statement.trim()) await db.execute(sql.raw(statement));
  }
}

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

describe("flexible service seed", () => {
  it("seeds the Outros category and the flexible service", async () => {
    await applySeedMigration();
    await applySeedMigration(); // idempotent

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
      .where(eq(services.slug, FLEXIBLE_SERVICE_SLUG));

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
      .where(eq(serviceCategories.slug, OTHER_CATEGORY_SLUG));
    expect(categories).toHaveLength(1);
    expect(categories[0]).toMatchObject({ isActive: true, sortOrder: 999 });
  });

  it("defaults is_flexible to false", async () => {
    await applySeedMigration();
    const [category] = await db
      .select()
      .from(serviceCategories)
      .where(eq(serviceCategories.slug, OTHER_CATEGORY_SLUG));
    try {
      const [service] = await db
        .insert(services)
        .values({
          categoryId: category.id,
          name: "Serviço comum",
          slug: "servico-comum-flex-test",
          durationMinutes: 45,
        })
        .returning();
      expect(service.isFlexible).toBe(false);
    } finally {
      await db
        .delete(services)
        .where(eq(services.slug, "servico-comum-flex-test"));
    }
  });
});
