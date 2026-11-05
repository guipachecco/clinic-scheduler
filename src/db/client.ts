import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/lib/env";

import * as schema from "./schema";

// One pool per PostgreSQL role (see migration 0011). Row-level security keeps
// app_panel inside the clinic set for each transaction (inClinic). The owner
// connection lives apart, in ./owner, for migrations, scripts and tests only.
const authPool = new Pool({ connectionString: env.DATABASE_URL_AUTH });
const panelPool = new Pool({ connectionString: env.DATABASE_URL_PANEL });
const clientPool = new Pool({ connectionString: env.DATABASE_URL_CLIENT });
const platformPool = new Pool({ connectionString: env.DATABASE_URL_PLATFORM });

export const authDb = drizzle({ client: authPool, schema });
export const panelDb = drizzle({ client: panelPool, schema });
export const clientDb = drizzle({ client: clientPool, schema });
export const platformDb = drizzle({ client: platformPool, schema });

export type Database = typeof panelDb;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

// Runs fn in a transaction that sees only the rows of clinicId. The setting is
// local to the transaction (set_config(..., true)), so a pooled connection
// never carries it into the next one.
export function withClinic<T>(
  database: Database,
  clinicId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return database.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.clinic_id', ${clinicId}, true)`,
    );
    return fn(tx);
  });
}

// The panel's way into the database: app_panel, scoped to one clinic.
export function inClinic<T>(
  clinicId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return withClinic(panelDb, clinicId, fn);
}

export type ClientScope = {
  clinicId: string;
  patientId: string;
  userId: string;
};

// The client area's way into the database: app_client, scoped to one clinic
// and to her own patient row there (migration 0013). Like withClinic, the
// settings last only for the transaction.
export function asClient<T>(
  ctx: ClientScope,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return clientDb.transaction(async (tx) => {
    await tx.execute(sql`
      select set_config('app.clinic_id', ${ctx.clinicId}, true),
             set_config('app.patient_id', ${ctx.patientId}, true),
             set_config('app.user_id', ${ctx.userId}, true)
    `);
    return fn(tx);
  });
}

// The PostgreSQL user the panel's transactions run as (checked by the tests).
export async function currentDbUser(clinicId: string): Promise<string> {
  return inClinic(clinicId, async (tx) => {
    const result = await tx.execute<{ current_user: string }>(
      sql`select current_user`,
    );
    return result.rows[0]!.current_user;
  });
}

export async function endPools() {
  await Promise.all(
    [authPool, panelPool, clientPool, platformPool].map((p) => p.end()),
  );
}
