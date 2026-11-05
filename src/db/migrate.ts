import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { DB_ROLE_ENV, DB_ROLE_NAMES, type RoleUrls } from "./roles";

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

// Applies the pending SQL migrations in drizzle/, in order, inside a
// transaction. Then, for each role URL given, turns that role (created
// NOLOGIN by migration 0011) into a login role with the URL's password.
export async function runMigrations(ownerUrl: string, roleUrls?: RoleUrls) {
  const logins = roleUrls ? roleLogins(roleUrls) : [];
  const pool = new Pool({ connectionString: ownerUrl, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: MIGRATIONS_FOLDER,
    });
    if (logins.length === 0) return;
    const client = await pool.connect();
    try {
      for (const { role, password } of logins) {
        await client.query(
          `ALTER ROLE ${client.escapeIdentifier(role)} LOGIN PASSWORD ${client.escapeLiteral(password)}`,
        );
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

// Checked before migrating, so a wrong URL changes nothing. Never includes the
// URL in the error: it holds a password.
function roleLogins(roleUrls: RoleUrls) {
  return DB_ROLE_NAMES.map((role) => {
    let url: URL;
    try {
      url = new URL(roleUrls[role]);
    } catch {
      throw new Error(`${DB_ROLE_ENV[role]} não é uma URL válida`);
    }
    const username = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    if (username !== role) {
      throw new Error(`${DB_ROLE_ENV[role]} deve usar o usuário ${role}`);
    }
    if (!password) {
      throw new Error(`${DB_ROLE_ENV[role]} precisa de uma senha`);
    }
    return { role, password };
  });
}
