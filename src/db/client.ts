import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/lib/env";

import * as schema from "./schema";

// Owner connection: migrations and test fixtures only.
export const pool = new Pool({ connectionString: env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });

// One pool per PostgreSQL role (see migration 0011). Row-level security keeps
// app_panel inside the clinic set for each transaction (inClinic).
const authPool = new Pool({ connectionString: env.DATABASE_URL_AUTH });
const panelPool = new Pool({ connectionString: env.DATABASE_URL_PANEL });
const clientPool = new Pool({ connectionString: env.DATABASE_URL_CLIENT });
const platformPool = new Pool({ connectionString: env.DATABASE_URL_PLATFORM });

export const authDb = drizzle({ client: authPool, schema });
export const panelDb = drizzle({ client: panelPool, schema });
export const clientDb = drizzle({ client: clientPool, schema });
export const platformDb = drizzle({ client: platformPool, schema });

export type Database = typeof db;
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

export async function endPools() {
  await Promise.all(
    [pool, authPool, panelPool, clientPool, platformPool].map((p) => p.end()),
  );
}
