import "server-only";

import { sql } from "drizzle-orm";

import { platformDb } from "@/db/client";
import { rateLimits } from "@/db/schema";

// A fixed-window counter in the rate_limits table that Better Auth also uses,
// so it holds across serverless instances. The window starts at the first
// attempt (last_request) and a new one starts once it has passed.
//
// Better Auth prunes rows older than its longest custom rule (src/lib/auth.ts,
// today 10 minutes): keep `window` at or below that, or register the limit
// there too.

export type RateLimit = { window: number; max: number };

// Counts this attempt under `key` and says whether it is within the limit.
export async function consumeRateLimit(
  key: string,
  limit: RateLimit,
): Promise<boolean> {
  const now = Date.now();
  const windowStart = now - limit.window * 1000;
  const expired = sql`${rateLimits.lastRequest} <= ${windowStart}`;
  const [row] = await platformDb
    .insert(rateLimits)
    .values({ key, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
        lastRequest: sql`case when ${expired} then ${now} else ${rateLimits.lastRequest} end`,
      },
    })
    .returning({ count: rateLimits.count });
  return (row?.count ?? Infinity) <= limit.max;
}

// Online bookings per client account: each try may hold a slot for 30 minutes
// and open a Pix charge at Asaas, so a script must not be able to fill the
// agenda. 8 tries in 10 minutes is far above what a person needs.
export const BOOKING_LIMIT: RateLimit = { window: 60 * 10, max: 8 };
