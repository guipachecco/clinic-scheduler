import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { endPools as endAppPools } from "./client";
import * as schema from "./schema";

// The owner of the tables. Row-level security does not apply to it, so only
// the migrations, the scripts and the tests connect this way; the app itself
// never imports this module (an ESLint rule forbids it under src/) and its
// runtime does not even read DATABASE_URL (src/lib/env.ts).
const ownerUrl = process.env.DATABASE_URL;
if (!ownerUrl) {
  throw new Error("Defina DATABASE_URL (veja o .env.example).");
}

export const pool = new Pool({ connectionString: ownerUrl });
export const db = drizzle({ client: pool, schema });

// Closes the owner pool and the app's role pools.
export async function endPools() {
  await Promise.all([pool.end(), endAppPools()]);
}
