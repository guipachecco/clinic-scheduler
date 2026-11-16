import "server-only";

import { sql } from "drizzle-orm";

// Correlated subqueries that read the extra procedures of each appointment
// row of the enclosing select (which must read `appointments` unaliased).
// They work for both database roles: the names come from the snapshot kept in
// appointment_services (the client role reads it for her own appointments
// only), the prices from services (panel role only). The pg driver already
// returns the text[] as an array and the json as an object.

// Written out in full: drizzle drops the table name from a column when the
// outer select reads a single table, which would make `id` ambiguous inside
// the subquery.
const OUTER_ID = sql.raw('"appointments"."id"');

export type ExtraPrices = { cents: number; missing: boolean };

// Names of the extras in order; an empty array when there are none.
export const extraNamesSql = sql<string[]>`coalesce((
  select array_agg(e.service_name order by e.position)
  from appointment_services e
  where e.appointment_id = ${OUTER_ID}
), '{}'::text[])`;

// The sum of the prices the extras have today and whether any extra has no
// price. Always one row: `{ cents: 0, missing: false }` without extras.
export const extraPricesSql = sql<ExtraPrices>`(
  select json_build_object(
    'cents', coalesce(sum(s.price_cents), 0)::int,
    'missing', coalesce(bool_or(s.price_cents is null), false)
  )
  from appointment_services e
  inner join services s
    on s.clinic_id = e.clinic_id and s.id = e.service_id
  where e.appointment_id = ${OUTER_ID}
)`;
