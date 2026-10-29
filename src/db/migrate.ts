import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

// Applies the pending SQL migrations in drizzle/, in order, inside a transaction.
export async function runMigrations(connectionString: string) {
  const pool = new Pool({ connectionString, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: MIGRATIONS_FOLDER,
    });
  } finally {
    await pool.end();
  }
}
