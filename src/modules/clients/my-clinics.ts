import "server-only";

import { sql } from "drizzle-orm";

import { clientDb } from "@/db/client";

// The two clinic lists of the Zemana pages, read as app_client through the
// definer functions of migration 0021. No clinic setting is needed: both
// cross clinics on purpose and return public data, plus (for "Suas
// clínicas") the signed-in client's own next appointment and loyalty counts.

export type PublicClinicCard = {
  slug: string;
  name: string;
  areaLabel: string | null;
  hasPhoto: boolean;
  // The first photo of the clinic's page, served at /<slug>/fotos/<id>.
  coverPhotoId: string | null;
};

export type MyClinic = PublicClinicCard & {
  whatsappPhone: string | null;
  timezone: string;
  onlineBookingEnabled: boolean;
  rating: { average: number; total: number } | null;
  // Null when the clinic has no loyalty card.
  loyalty: {
    visits: number;
    reward: string;
    stamps: number;
    prize: boolean;
  } | null;
  nextAppointment: { startsAt: Date; service: string } | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Nobody's id: no patients row has it as user_id.
const NO_USER = "00000000-0000-0000-0000-000000000000";

// Same count as the clinic page's loyalty card (getLoyaltyProgress).
export function loyaltyStamps(
  visits: number,
  completed: number,
  redeemed: number,
): { stamps: number; prize: boolean } {
  const progress = Math.max(0, completed - visits * redeemed);
  return { stamps: Math.min(progress, visits), prize: progress >= visits };
}

// userId must come from the authenticated session, never from request input:
// the database function trusts it.
export async function listMyClinics(userId: string): Promise<MyClinic[]> {
  if (!UUID.test(userId) || userId === NO_USER) return [];
  const result = await clientDb.execute<{
    slug: string;
    name: string;
    area_label: string | null;
    has_photo: boolean;
    cover_photo_id: string | null;
    whatsapp_phone: string | null;
    timezone: string;
    online_booking_enabled: boolean;
    rating_average: string | null;
    rating_total: number;
    loyalty_visits: number | null;
    loyalty_reward: string | null;
    loyalty_completed: number;
    loyalty_redeemed: number;
    next_starts_at: string | Date | null;
    next_service: string | null;
  }>(sql`select * from client_my_clinics(${userId}::uuid)`);
  return result.rows.map((row) => {
    const visits =
      row.loyalty_visits === null ? null : Number(row.loyalty_visits);
    return {
      slug: row.slug,
      name: row.name,
      areaLabel: row.area_label,
      hasPhoto: row.has_photo,
      coverPhotoId: row.cover_photo_id,
      whatsappPhone: row.whatsapp_phone,
      timezone: row.timezone,
      onlineBookingEnabled: row.online_booking_enabled,
      rating:
        row.rating_average === null || Number(row.rating_total) === 0
          ? null
          : {
              average: Number(row.rating_average),
              total: Number(row.rating_total),
            },
      loyalty:
        visits !== null && row.loyalty_reward
          ? {
              visits,
              reward: row.loyalty_reward,
              ...loyaltyStamps(
                visits,
                Number(row.loyalty_completed),
                Number(row.loyalty_redeemed),
              ),
            }
          : null,
      nextAppointment:
        row.next_starts_at && row.next_service
          ? {
              startsAt: new Date(row.next_starts_at),
              service: row.next_service,
            }
          : null,
    };
  });
}

// The clinics a visitor can sign up at (active, online booking on).
export async function listPublicClinics(): Promise<PublicClinicCard[]> {
  const result = await clientDb.execute<{
    slug: string;
    name: string;
    area_label: string | null;
    has_photo: boolean;
    cover_photo_id: string | null;
  }>(sql`select * from client_public_clinics()`);
  return result.rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    areaLabel: row.area_label,
    hasPhoto: row.has_photo,
    coverPhotoId: row.cover_photo_id,
  }));
}
