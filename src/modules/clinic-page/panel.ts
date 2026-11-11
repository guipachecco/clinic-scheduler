import "server-only";

import { and, asc, count, desc, eq, sql } from "drizzle-orm";

import { inClinic, type Tx } from "@/db/client";
import {
  appointments,
  clinics,
  loyaltyRedemptions,
  patients,
  products,
  reviews,
} from "@/db/schema";

import type {
  Amenity,
  ClinicPageInput,
  LoyaltyInput,
  ProductInput,
} from "./fields";

// The owner's side of the clinic page, as app_panel inside the clinic
// (inClinic). Inputs are already parsed by the schemas in ./fields. Actor ids
// come from the server session, never from the browser.

const EXAMPLE_PRODUCTS = [
  { name: "Protetor solar FPS 50", priceCents: 7990 },
  { name: "Hidratante facial", priceCents: 6990 },
  { name: "Sérum de vitamina C", priceCents: 9500 },
] as const;

export type ClinicPageSettings = ClinicPageInput & {
  loyaltyEnabled: boolean;
  loyaltyVisits: number;
  loyaltyReward: string | null;
};

export async function getClinicPageSettings(
  clinicId: string,
): Promise<ClinicPageSettings | null> {
  return inClinic(clinicId, async (tx) => {
    const [row] = await tx
      .select({
        whatsappPhone: clinics.whatsappPhone,
        contactEmail: clinics.contactEmail,
        address: clinics.address,
        mapsUrl: clinics.mapsUrl,
        instagramHandle: clinics.instagramHandle,
        amenities: clinics.amenities,
        onlineBookingEnabled: clinics.onlineBookingEnabled,
        loyaltyEnabled: clinics.loyaltyEnabled,
        loyaltyVisits: clinics.loyaltyVisits,
        loyaltyReward: clinics.loyaltyReward,
      })
      .from(clinics)
      .where(eq(clinics.id, clinicId));
    return row ? { ...row, amenities: row.amenities as Amenity[] } : null;
  });
}

export async function updateClinicPage(
  clinicId: string,
  input: ClinicPageInput,
): Promise<void> {
  await inClinic(clinicId, (tx) =>
    tx
      .update(clinics)
      .set({
        whatsappPhone: input.whatsappPhone,
        contactEmail: input.contactEmail,
        address: input.address,
        mapsUrl: input.mapsUrl,
        instagramHandle: input.instagramHandle,
        amenities: input.amenities,
        onlineBookingEnabled: input.onlineBookingEnabled,
        updatedAt: new Date(),
      })
      .where(eq(clinics.id, clinicId)),
  );
}

export async function updateLoyalty(
  clinicId: string,
  input: LoyaltyInput,
): Promise<void> {
  await inClinic(clinicId, (tx) =>
    tx
      .update(clinics)
      .set({
        loyaltyEnabled: input.enabled,
        loyaltyVisits: input.visits,
        loyaltyReward: input.reward === "" ? null : input.reward,
        updatedAt: new Date(),
      })
      .where(eq(clinics.id, clinicId)),
  );
}

export type PanelProduct = {
  id: string;
  name: string;
  priceCents: number | null;
  description: string | null;
  isActive: boolean;
};

const productColumns = {
  id: products.id,
  name: products.name,
  priceCents: products.priceCents,
  description: products.description,
  isActive: products.isActive,
};

export async function listProducts(clinicId: string): Promise<PanelProduct[]> {
  return inClinic(clinicId, (tx) =>
    tx
      .select(productColumns)
      .from(products)
      .where(eq(products.clinicId, clinicId))
      .orderBy(asc(products.sortOrder), asc(products.name), asc(products.id)),
  );
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
  input: ProductInput,
): Promise<string> {
  return inClinic(clinicId, async (tx) => {
    const [row] = await tx
      .insert(products)
      .values({
        clinicId,
        name: input.name,
        priceCents: input.price,
        description: input.description,
        isActive: input.isActive,
        sortOrder: await nextSortOrder(tx, clinicId),
      })
      .returning({ id: products.id });
    return row!.id;
  });
}

// False when the product is not in this clinic.
export async function updateProduct(
  clinicId: string,
  id: string,
  input: ProductInput,
): Promise<boolean> {
  return inClinic(clinicId, async (tx) => {
    const rows = await tx
      .update(products)
      .set({
        name: input.name,
        priceCents: input.price,
        description: input.description,
        isActive: input.isActive,
        updatedAt: new Date(),
      })
      .where(and(eq(products.clinicId, clinicId), eq(products.id, id)))
      .returning({ id: products.id });
    return rows.length > 0;
  });
}

export async function deleteProduct(
  clinicId: string,
  id: string,
): Promise<boolean> {
  return inClinic(clinicId, async (tx) => {
    const rows = await tx
      .delete(products)
      .where(and(eq(products.clinicId, clinicId), eq(products.id, id)))
      .returning({ id: products.id });
    return rows.length > 0;
  });
}

// Fills an empty product list with three examples; returns how many it added.
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
    await tx.insert(products).values(
      EXAMPLE_PRODUCTS.map((product, index) => ({
        clinicId,
        name: product.name,
        priceCents: product.priceCents,
        isActive: true,
        sortOrder: index,
      })),
    );
    return EXAMPLE_PRODUCTS.length;
  });
}

export type PanelReview = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  isHidden: boolean;
  patientId: string;
  patientName: string;
};

// Every review, hidden ones included, newest first, with the full name.
export async function listReviews(clinicId: string): Promise<PanelReview[]> {
  return inClinic(clinicId, async (tx) => {
    const rows = await tx
      .select({
        id: reviews.id,
        rating: reviews.rating,
        comment: reviews.comment,
        createdAt: reviews.createdAt,
        isHidden: reviews.isHidden,
        patientId: reviews.patientId,
        patientName: patients.name,
      })
      .from(reviews)
      .innerJoin(
        patients,
        and(
          eq(patients.clinicId, reviews.clinicId),
          eq(patients.id, reviews.patientId),
        ),
      )
      .where(eq(reviews.clinicId, clinicId))
      .orderBy(desc(reviews.createdAt), asc(reviews.id));
    return rows;
  });
}

// The clinic's time zone, to show the review dates on its own calendar.
export async function getClinicTimezone(clinicId: string): Promise<string> {
  const [row] = await inClinic(clinicId, (tx) =>
    tx
      .select({ timezone: clinics.timezone })
      .from(clinics)
      .where(eq(clinics.id, clinicId)),
  );
  return row?.timezone ?? "America/Sao_Paulo";
}

// Hides or shows a review; false when it is not in this clinic. actorUserId
// is the signed-in owner's id from the session.
export async function setReviewHidden(
  clinicId: string,
  reviewId: string,
  hidden: boolean,
  actorUserId: string,
): Promise<boolean> {
  return inClinic(clinicId, async (tx) => {
    const rows = await tx
      .update(reviews)
      .set(
        hidden
          ? { isHidden: true, hiddenAt: new Date(), hiddenBy: actorUserId }
          : { isHidden: false, hiddenAt: null, hiddenBy: null },
      )
      .where(and(eq(reviews.clinicId, clinicId), eq(reviews.id, reviewId)))
      .returning({ id: reviews.id });
    return rows.length > 0;
  });
}

export type PatientLoyalty = {
  enabled: boolean;
  visits: number;
  reward: string | null;
  stamps: number;
  prize: boolean;
};

async function readLoyalty(
  tx: Tx,
  clinicId: string,
  patientId: string,
): Promise<PatientLoyalty> {
  const [clinic] = await tx
    .select({
      enabled: clinics.loyaltyEnabled,
      visits: clinics.loyaltyVisits,
      reward: clinics.loyaltyReward,
    })
    .from(clinics)
    .where(eq(clinics.id, clinicId));
  if (!clinic)
    return {
      enabled: false,
      visits: 10,
      reward: null,
      stamps: 0,
      prize: false,
    };
  const [done] = await tx
    .select({ total: count() })
    .from(appointments)
    .where(
      and(
        eq(appointments.clinicId, clinicId),
        eq(appointments.patientId, patientId),
        eq(appointments.status, "completed"),
      ),
    );
  const [given] = await tx
    .select({ total: count() })
    .from(loyaltyRedemptions)
    .where(
      and(
        eq(loyaltyRedemptions.clinicId, clinicId),
        eq(loyaltyRedemptions.patientId, patientId),
      ),
    );
  const progress = Math.max(
    0,
    Number(done?.total ?? 0) - clinic.visits * Number(given?.total ?? 0),
  );
  return {
    ...clinic,
    stamps: Math.min(progress, clinic.visits),
    prize: progress >= clinic.visits,
  };
}

export async function getPatientLoyalty(
  clinicId: string,
  patientId: string,
): Promise<PatientLoyalty> {
  return inClinic(clinicId, (tx) => readLoyalty(tx, clinicId, patientId));
}

// Records that the patient received the reward. Refused without a prize
// (card off, or fewer completed visits than the card asks for).
export async function redeemLoyalty(
  clinicId: string,
  patientId: string,
  actorUserId: string,
): Promise<{ ok: true } | { ok: false; reason: "no_prize" }> {
  return inClinic(clinicId, async (tx) => {
    // Serializes redemptions of one patient so a double click gives one reward.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('loyalty'), hashtext(${patientId}))`,
    );
    const loyalty = await readLoyalty(tx, clinicId, patientId);
    if (!loyalty.enabled || !loyalty.prize) {
      return { ok: false as const, reason: "no_prize" as const };
    }
    await tx
      .insert(loyaltyRedemptions)
      .values({ clinicId, patientId, createdBy: actorUserId });
    return { ok: true as const };
  });
}
