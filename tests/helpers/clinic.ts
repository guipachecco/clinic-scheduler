import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { clinics, GRAIS_CLINIC_ID } from "@/db/schema";

// The clinic every integration test works in: the one migration 0007 creates
// from the old single-clinic data.
export const CLINIC = GRAIS_CLINIC_ID;

// A second clinic, for tests that check one clinic never sees another's data.
export async function otherClinic(slug = "outra-clinica-teste") {
  const [existing] = await db
    .select({ id: clinics.id })
    .from(clinics)
    .where(eq(clinics.slug, slug));
  if (existing) return existing.id;
  const [row] = await db
    .insert(clinics)
    .values({ slug, name: "Outra Clínica Fictícia" })
    .returning({ id: clinics.id });
  return row!.id;
}
