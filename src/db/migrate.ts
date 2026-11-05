import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool, type PoolClient } from "pg";

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
    const client = await pool.connect();
    try {
      for (const { role, password } of logins) {
        await client.query(
          `ALTER ROLE ${client.escapeIdentifier(role)} LOGIN PASSWORD ${client.escapeLiteral(password)}`,
        );
      }
      await assertRolesUnprivileged(client);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

// Migration 0011 keeps a role that already exists on the server as it is. A
// pre-existing role with SUPERUSER, BYPASSRLS, CREATEROLE, CREATEDB or a
// membership in another role would get around row-level security, so refuse.
async function assertRolesUnprivileged(client: PoolClient) {
  const { rows } = await client.query<{ rolname: string }>(
    `SELECT r.rolname FROM pg_roles r
     WHERE r.rolname = ANY($1)
       AND (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb
            OR EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid))
     ORDER BY r.rolname`,
    [DB_ROLE_NAMES],
  );
  if (rows.length > 0) {
    throw new Error(
      `Usuários do banco com privilégios a mais (superuser, BYPASSRLS, CREATEROLE, CREATEDB ou membro de outro papel): ${rows.map((row) => row.rolname).join(", ")}`,
    );
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
