import "server-only";

import { and, asc, eq, sql, type SQL } from "drizzle-orm";

import { asClient, clientDb, type Tx } from "@/db/client";
import { findPgError } from "@/db/errors";
import { appointments, clinics, products, services } from "@/db/schema";
import type { ClinicTheme } from "@/db/schema/clinic";
import type { BookingContext } from "@/modules/booking/booking";
import type { BusinessType } from "@/modules/business-type/vocabulary";
import type { PublicClinic } from "@/modules/clients/context";
import type { DayHours } from "@/modules/schedule/schedule";

import { type Amenity, type ReviewInput } from "./fields";

// The clinic's public page, read as app_client. Anonymous visitors and signed
// in clients see the same page; what needs a client (reviews, loyalty) takes a
// BookingContext built on the server. Reviews, payment methods, the owner's
// photo and loyalty progress come from the definer functions of migration
// 0017; the client never reads those tables directly.

export type ClinicPage = PublicClinic & {
  headline: string | null;
  about: string | null;
  areaLabel: string | null;
  professionalName: string | null;
  professionalRegistration: string | null;
  instagramHandle: string | null;
  amenities: Amenity[];
  // What the page builder published (migration 0025): the look of the page,
  // the kind of business and whether /<slug>/logo has an image.
  theme: ClinicTheme;
  businessType: BusinessType;
  hasLogo: boolean;
  // The cover's size when the owner published one (image at /<slug>/capa);
  // without it the page uses the first photo.
  cover: { width: number; height: number } | null;
  hasOwnerPhoto: boolean;
  loyalty: { visits: number; reward: string } | null;
  paymentMethods: string[];
  // In page order. Images come from /<slug>/fotos/<id>.
  photos: { id: string; width: number; height: number }[];
  hours: DayHours[];
  services: {
    id: string;
    name: string;
    description: string | null;
    durationMinutes: number;
    priceCents: number | null;
    priceDisplay: "fixed" | "starting_at" | "on_request" | "hidden";
  }[];
  products: {
    id: string;
    name: string;
    priceCents: number | null;
    description: string | null;
  }[];
  reviews: {
    id: string;
    rating: number;
    comment: string | null;
    createdAt: Date;
    author: string;
  }[];
  reviewSummary: { average: number | null; total: number };
};

// The page shows the 10 newest; the summary counts them all.
const REVIEWS_SHOWN = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Stands for "nobody" in client_context (see clients/context.ts).
const NO_USER = "00000000-0000-0000-0000-000000000000";

// Resolves the slug of an active clinic and scopes the transaction to it.
async function enterClinic(tx: Tx, slug: string): Promise<string | null> {
  const result = await tx.execute<{ clinic_id: string }>(
    sql`select clinic_id from client_context(${slug}, ${NO_USER}::uuid)`,
  );
  const row = result.rows[0];
  if (!row) return null;
  await tx.execute(
    sql`select set_config('app.clinic_id', ${row.clinic_id}, true)`,
  );
  return row.clinic_id;
}

// Null when the slug is not an active clinic.
export async function getClinicPage(slug: string): Promise<ClinicPage | null> {
  return clientDb.transaction(async (tx) => {
    const clinicId = await enterClinic(tx, slug);
    if (!clinicId) return null;

    const [clinic] = await tx
      .select({
        id: clinics.id,
        slug: clinics.slug,
        name: clinics.name,
        displayName: clinics.displayName,
        whatsappPhone: clinics.whatsappPhone,
        contactEmail: clinics.contactEmail,
        address: clinics.address,
        mapsUrl: clinics.mapsUrl,
        onlineBookingEnabled: clinics.onlineBookingEnabled,
        minAdvanceMinutes: clinics.minAdvanceMinutes,
        maxAdvanceDays: clinics.maxAdvanceDays,
        slotStepMinutes: clinics.slotStepMinutes,
        maxActiveAppointmentsPerPhone: clinics.maxActiveAppointmentsPerPhone,
        timezone: clinics.timezone,
        headline: clinics.headline,
        about: clinics.about,
        areaLabel: clinics.areaLabel,
        professionalName: clinics.professionalName,
        professionalRegistration: clinics.professionalRegistration,
        instagramHandle: clinics.instagramHandle,
        amenities: clinics.amenities,
        theme: clinics.theme,
        businessType: clinics.businessType,
        logoMediaId: clinics.logoMediaId,
        ownerPhotoMediaId: clinics.ownerPhotoMediaId,
        loyaltyEnabled: clinics.loyaltyEnabled,
        loyaltyVisits: clinics.loyaltyVisits,
        loyaltyReward: clinics.loyaltyReward,
      })
      .from(clinics)
      .where(eq(clinics.id, clinicId));
    if (!clinic) return null;

    const hoursResult = await tx.execute<{
      weekday: number;
      opens: string;
      closes: string;
    }>(
      sql`select weekday, opens, closes from client_business_hours(${clinicId}::uuid)`,
    );
    const hours: DayHours[] = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      intervals: [],
    }));
    for (const row of hoursResult.rows) {
      hours[Number(row.weekday)]?.intervals.push({
        start: row.opens.slice(0, 5),
        end: row.closes.slice(0, 5),
      });
    }

    const methods = await tx.execute<{ name: string }>(
      sql`select name from client_payment_methods(${clinicId}::uuid)`,
    );

    const serviceRows = await tx
      .select({
        id: services.id,
        name: services.name,
        description: services.description,
        durationMinutes: services.durationMinutes,
        priceCents: services.priceCents,
        priceDisplay: services.priceDisplay,
      })
      .from(services)
      .where(
        and(
          eq(services.clinicId, clinicId),
          eq(services.isActive, true),
          eq(services.onlineBookingEnabled, true),
          eq(services.isFlexible, false),
        ),
      )
      .orderBy(asc(services.sortOrder), asc(services.name), asc(services.id));

    const productRows = await tx
      .select({
        id: products.id,
        name: products.name,
        priceCents: products.priceCents,
        description: products.description,
      })
      .from(products)
      .where(and(eq(products.clinicId, clinicId), eq(products.isActive, true)))
      .orderBy(asc(products.sortOrder), asc(products.name), asc(products.id));

    const reviewRows = await tx.execute<{
      id: string;
      rating: number;
      comment: string | null;
      created_at: string | Date;
      author: string;
    }>(
      sql`select id, rating, comment, created_at, author from client_public_reviews(${clinicId}::uuid, ${REVIEWS_SHOWN})`,
    );
    const summaryResult = await tx.execute<{
      average: string | null;
      total: number;
    }>(
      sql`select average, total from client_review_summary(${clinicId}::uuid)`,
    );
    const summary = summaryResult.rows[0];

    const photoRows = await tx.execute<{
      id: string;
      width: number;
      height: number;
    }>(
      sql`select id, width, height from client_clinic_photos(${clinicId}::uuid)`,
    );

    // No row when the owner has not published a cover.
    const coverRows = await tx.execute<{ width: number; height: number }>(
      sql`select width, height from client_clinic_cover_size(${clinicId}::uuid)`,
    );
    const coverRow = coverRows.rows[0];

    const {
      logoMediaId,
      ownerPhotoMediaId,
      loyaltyEnabled,
      loyaltyVisits,
      loyaltyReward,
      ...rest
    } = clinic;
    return {
      ...rest,
      amenities: clinic.amenities as Amenity[],
      hasLogo: logoMediaId !== null,
      cover: coverRow
        ? { width: Number(coverRow.width), height: Number(coverRow.height) }
        : null,
      hasOwnerPhoto: ownerPhotoMediaId !== null,
      loyalty:
        loyaltyEnabled && loyaltyReward
          ? { visits: loyaltyVisits, reward: loyaltyReward }
          : null,
      paymentMethods: methods.rows.map((row) => row.name),
      photos: photoRows.rows.map((row) => ({
        id: row.id,
        width: Number(row.width),
        height: Number(row.height),
      })),
      hours,
      services: serviceRows.map((row) => ({
        ...row,
        priceCents: row.priceDisplay === "hidden" ? null : row.priceCents,
      })),
      products: productRows,
      reviews: reviewRows.rows.map((row) => ({
        id: row.id,
        rating: Number(row.rating),
        comment: row.comment,
        createdAt: new Date(row.created_at),
        author: row.author,
      })),
      reviewSummary: {
        average:
          summary?.average === null || summary?.average === undefined
            ? null
            : Number(summary.average),
        total: Number(summary?.total ?? 0),
      },
    };
  });
}

// One photo of an active clinic's page; null when it is not one of them.
export async function getClinicPhoto(
  slug: string,
  photoId: string,
): Promise<{ mimeType: string; data: Buffer } | null> {
  if (!UUID.test(photoId)) return null;
  return clientDb.transaction(async (tx) => {
    const clinicId = await enterClinic(tx, slug);
    if (!clinicId) return null;
    const result = await tx.execute<{ mime_type: string; data: Buffer }>(
      sql`select mime_type, data from client_clinic_photo(${clinicId}::uuid, ${photoId}::uuid)`,
    );
    const row = result.rows[0];
    return row ? { mimeType: row.mime_type, data: row.data } : null;
  });
}

type StoredImage = { mimeType: string; data: Buffer };

// One image of an active clinic read through a definer function that returns
// (mime_type, data); null when the clinic is not active or has none.
function readImage(
  slug: string,
  read: (clinicId: string) => SQL,
): Promise<StoredImage | null> {
  return clientDb.transaction(async (tx) => {
    const clinicId = await enterClinic(tx, slug);
    if (!clinicId) return null;
    const result = await tx.execute<{ mime_type: string; data: Buffer }>(
      read(clinicId),
    );
    const row = result.rows[0];
    return row ? { mimeType: row.mime_type, data: row.data } : null;
  });
}

// The owner's photo of an active clinic; null when there is none.
export function getOwnerPhoto(slug: string): Promise<StoredImage | null> {
  return readImage(
    slug,
    (clinicId) =>
      sql`select mime_type, data from client_owner_photo(${clinicId}::uuid)`,
  );
}

// The published logo of an active clinic; null when there is none.
export function getClinicLogo(slug: string): Promise<StoredImage | null> {
  return readImage(
    slug,
    (clinicId) =>
      sql`select mime_type, data from client_clinic_logo(${clinicId}::uuid)`,
  );
}

// The published cover of an active clinic; null when there is none.
export function getClinicCover(slug: string): Promise<StoredImage | null> {
  return readImage(
    slug,
    (clinicId) =>
      sql`select mime_type, data from client_clinic_cover(${clinicId}::uuid)`,
  );
}

const scope = (ctx: BookingContext) => ({
  clinicId: ctx.clinicId,
  patientId: ctx.patientId,
  userId: ctx.userId,
});

const validContext = (ctx: BookingContext) =>
  UUID.test(ctx.clinicId) && UUID.test(ctx.patientId) && UUID.test(ctx.userId);

// True when she has a completed appointment in the clinic (the appointments
// she can see are already only her own).
export async function canReview(ctx: BookingContext): Promise<boolean> {
  if (!validContext(ctx)) return false;
  return asClient(scope(ctx), async (tx) => {
    const rows = await tx
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.clinicId, ctx.clinicId),
          eq(appointments.patientId, ctx.patientId),
          eq(appointments.status, "completed"),
        ),
      )
      .limit(1);
    return rows.length > 0;
  });
}

// Raw SQL on purpose: app_client may insert only these four columns and has
// no SELECT on reviews, so a Drizzle insert (which names every column) or a
// RETURNING would be refused. The policy checks the completed appointment.
export async function createReview(
  ctx: BookingContext,
  input: ReviewInput,
): Promise<{ ok: true } | { ok: false; reason: "not_allowed" | "invalid" }> {
  // The input is already parsed (reviewSchema); this guards the same limits.
  const { rating, comment } = input;
  if (
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5 ||
    (comment !== null && comment.length > 500)
  ) {
    return { ok: false, reason: "invalid" };
  }
  if (!validContext(ctx)) return { ok: false, reason: "not_allowed" };
  try {
    await asClient(scope(ctx), (tx) =>
      tx.execute(sql`
        insert into reviews (clinic_id, patient_id, rating, comment)
        values (${ctx.clinicId}::uuid, ${ctx.patientId}::uuid, ${rating}, ${comment})
      `),
    );
    return { ok: true };
  } catch (error) {
    const code = findPgError(error)?.code;
    if (code === "42501" || code === "23503") {
      return { ok: false, reason: "not_allowed" };
    }
    throw new Error("Não foi possível enviar a avaliação.", { cause: error });
  }
}

// Her stamps on the clinic's loyalty card: completed appointments minus the
// visits already traded for a reward, never below zero.
export async function getLoyaltyProgress(
  ctx: BookingContext,
  visits: number,
): Promise<{ stamps: number; prize: boolean }> {
  if (!validContext(ctx) || visits < 1) return { stamps: 0, prize: false };
  return asClient(scope(ctx), async (tx) => {
    const result = await tx.execute<{ completed: number; redeemed: number }>(
      sql`select completed, redeemed from client_loyalty_progress()`,
    );
    const row = result.rows[0];
    const progress = Math.max(
      0,
      Number(row?.completed ?? 0) - visits * Number(row?.redeemed ?? 0),
    );
    return { stamps: Math.min(progress, visits), prize: progress >= visits };
  });
}
