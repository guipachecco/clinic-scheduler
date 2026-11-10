import "server-only";

import { asc, eq } from "drizzle-orm";

import { inClinic, platformDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import {
  auditLogs,
  clinics,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_PAYMENT_METHODS,
  expenseCategories,
  FLEXIBLE_SERVICE_SLUG,
  OTHER_CATEGORY_SLUG,
  paymentMethods,
  serviceCategories,
  services,
} from "@/db/schema";

import { CLINIC_BRANDING, resolvePalette } from "@/modules/branding/palettes";

import {
  RESERVED_SLUG_ERROR,
  RESERVED_SLUGS,
  type ClinicFormValues,
} from "./fields";

// Data functions for the clinics themselves. Only root creates or changes
// clinics (as app_platform); every other module receives a clinicId and stays
// inside it (as app_panel, through inClinic).

export type ClinicSummary = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  anamnesisTemplate: string | null;
};

export type ClinicResult =
  | { ok: true; id: string }
  | { ok: false; fieldErrors: Partial<Record<keyof ClinicFormValues, string>> };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SLUG_TAKEN = "Já existe uma clínica com este endereço.";

const summaryColumns = {
  id: clinics.id,
  slug: clinics.slug,
  name: clinics.name,
  isActive: clinics.isActive,
  anamnesisTemplate: clinics.anamnesisTemplate,
};

export async function getClinic(id: string): Promise<ClinicSummary | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const [row] = await inClinic(id, (tx) =>
    tx.select(summaryColumns).from(clinics).where(eq(clinics.id, id)).limit(1),
  );
  return row ?? null;
}

export async function getClinicBySlug(
  slug: string,
): Promise<ClinicSummary | null> {
  // The slug is all there is before the clinic is known: app_platform.
  const [row] = await platformDb
    .select(summaryColumns)
    .from(clinics)
    .where(eq(clinics.slug, slug))
    .limit(1);
  return row ?? null;
}

// The addresses of the clinics whose page is public, for the sitemap.
export async function listActiveClinicSlugs(): Promise<string[]> {
  const rows = await platformDb
    .select({ slug: clinics.slug })
    .from(clinics)
    .where(eq(clinics.isActive, true))
    .orderBy(asc(clinics.slug));
  return rows.map((row) => row.slug);
}

export async function listClinics(): Promise<ClinicSummary[]> {
  return platformDb
    .select(summaryColumns)
    .from(clinics)
    .orderBy(asc(clinics.name));
}

// Creates the clinic with what every clinic needs to start: the "Outros"
// category and the flexible "Avaliação / encaixe" service (as migration 0005
// did for the first clinic), plus the default payment methods and expense
// categories (as migration 0009 did).
export async function createClinic(
  values: ClinicFormValues,
  actorUserId: string,
): Promise<ClinicResult> {
  // Also checked by the form schema; repeated here for every other caller.
  if (RESERVED_SLUGS.has(values.slug)) {
    return { ok: false, fieldErrors: { slug: RESERVED_SLUG_ERROR } };
  }
  try {
    return await platformDb.transaction(async (tx): Promise<ClinicResult> => {
      const [taken] = await tx
        .select({ id: clinics.id })
        .from(clinics)
        .where(eq(clinics.slug, values.slug))
        .limit(1);
      if (taken) return { ok: false, fieldErrors: { slug: SLUG_TAKEN } };

      const [clinic] = await tx
        .insert(clinics)
        .values({
          name: values.name,
          slug: values.slug,
          theme: { paletteId: resolvePalette(values.slug, undefined).id },
          displayName: CLINIC_BRANDING[values.slug]?.displayName ?? null,
          areaLabel: CLINIC_BRANDING[values.slug]?.areaLabel ?? null,
        })
        .returning({ id: clinics.id });
      const clinicId = clinic!.id;

      const [category] = await tx
        .insert(serviceCategories)
        .values({
          clinicId,
          name: "Outros",
          slug: OTHER_CATEGORY_SLUG,
          sortOrder: 999,
          isActive: true,
        })
        .returning({ id: serviceCategories.id });
      await tx.insert(services).values({
        clinicId,
        categoryId: category!.id,
        name: "Avaliação / encaixe",
        slug: FLEXIBLE_SERVICE_SLUG,
        durationMinutes: 30,
        priceCents: null,
        priceDisplay: "hidden",
        requiresApproval: false,
        onlineBookingEnabled: false,
        isActive: true,
        isFlexible: true,
        sortOrder: 0,
      });
      await tx.insert(paymentMethods).values(
        DEFAULT_PAYMENT_METHODS.map((name, sortOrder) => ({
          clinicId,
          name,
          sortOrder,
        })),
      );
      await tx.insert(expenseCategories).values(
        DEFAULT_EXPENSE_CATEGORIES.map((name, sortOrder) => ({
          clinicId,
          name,
          sortOrder,
        })),
      );

      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: "clinic.created",
        entityType: "clinic",
        entityId: clinicId,
      });
      return { ok: true, id: clinicId };
    });
  } catch (error) {
    if (isUniqueViolation(error, "clinics_slug_unique")) {
      return { ok: false, fieldErrors: { slug: SLUG_TAKEN } };
    }
    throw new Error("Não foi possível criar a clínica.", { cause: error });
  }
}

export async function setClinicActive(
  id: string,
  isActive: boolean,
  actorUserId: string,
): Promise<{ ok: boolean }> {
  if (!UUID_PATTERN.test(id)) return { ok: false };
  return platformDb.transaction(async (tx) => {
    const updated = await tx
      .update(clinics)
      .set({ isActive })
      .where(eq(clinics.id, id))
      .returning({ id: clinics.id });
    if (updated.length === 0) return { ok: false };
    await tx.insert(auditLogs).values({
      clinicId: id,
      actorType: "admin",
      actorUserId,
      action: isActive ? "clinic.activated" : "clinic.deactivated",
      entityType: "clinic",
      entityId: id,
    });
    return { ok: true };
  });
}
