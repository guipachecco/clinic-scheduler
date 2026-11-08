import "server-only";

import { sql } from "drizzle-orm";

import { clientDb } from "@/db/client";

// The clinics where the signed-in client has a patients row, read through
// client_my_clinics (migration 0019) as app_client. No clinic setting is
// needed: the function crosses clinics on purpose and returns public data only.

export type MyClinic = {
  slug: string;
  name: string;
  areaLabel: string | null;
  hasPhoto: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Nobody's id: no patients row has it as user_id.
const NO_USER = "00000000-0000-0000-0000-000000000000";

// userId must come from the authenticated session, never from request input:
// the database function trusts it.
export async function listMyClinics(userId: string): Promise<MyClinic[]> {
  if (!UUID.test(userId) || userId === NO_USER) return [];
  const result = await clientDb.execute<{
    slug: string;
    name: string;
    area_label: string | null;
    has_photo: boolean;
  }>(
    sql`select slug, name, area_label, has_photo from client_my_clinics(${userId}::uuid)`,
  );
  return result.rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    areaLabel: row.area_label,
    hasPhoto: row.has_photo,
  }));
}
