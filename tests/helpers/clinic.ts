import { and, eq } from "drizzle-orm";

import { db } from "@/db/owner";
import {
  clinics,
  GRAIS_CLINIC_ID,
  PRODUCT_OTHER_CATEGORY_NAME,
  productCategories,
} from "@/db/schema";

// The clinic every integration test works in: the one migration 0007 creates
// from the old single-clinic data.
export const CLINIC = GRAIS_CLINIC_ID;

// A second clinic, for tests that check one clinic never sees another's data.
export async function otherClinic(slug = "outra-clinica-teste") {
  const [existing] = await db
    .select({ id: clinics.id })
    .from(clinics)
    .where(eq(clinics.slug, slug));
  // Like createClinic, every clinic has the "Outros" product category.
  if (existing) {
    await productCategory(existing.id);
    return existing.id;
  }
  const [row] = await db
    .insert(clinics)
    .values({ slug, name: "Outra Clínica Fictícia" })
    .returning({ id: clinics.id });
  await productCategory(row!.id);
  return row!.id;
}

// The clinic's "Outros" product category (migration 0028, createClinic),
// created here for clinics the tests insert directly.
export async function productCategory(clinicId: string) {
  await db
    .insert(productCategories)
    .values({ clinicId, name: PRODUCT_OTHER_CATEGORY_NAME, sortOrder: 999 })
    .onConflictDoNothing();
  const [row] = await db
    .select({ id: productCategories.id })
    .from(productCategories)
    .where(
      and(
        eq(productCategories.clinicId, clinicId),
        eq(productCategories.name, PRODUCT_OTHER_CATEGORY_NAME),
      ),
    );
  return row!.id;
}
