import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool, type PoolClient } from "pg";

import { DB_ROLE_ENV, DB_ROLE_NAMES, type RoleUrls } from "./roles";

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

// Applies the pending SQL migrations in drizzle/, in order, inside a
// transaction. Then checks that no app role has more power than its grants
// (assertRolesUnprivileged) and only after that, for each role URL given,
// turns that role (created NOLOGIN by migration 0011) into a login role with
// the URL's password. A role that fails the check never gets a login here.
export async function runMigrations(ownerUrl: string, roleUrls?: RoleUrls) {
  const logins = roleUrls ? roleLogins(roleUrls) : [];
  const pool = new Pool({ connectionString: ownerUrl, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: MIGRATIONS_FOLDER,
    });
    const client = await pool.connect();
    try {
      await assertRolesUnprivileged(client);
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

// Migration 0011 keeps a role that already exists on the server as it is.
// Refuses an app role that could get around row-level security or its grants:
// SUPERUSER, BYPASSRLS, CREATEROLE, CREATEDB, a membership in another role, or
// owning anything in this database (a table, view or sequence, a function, a
// schema, or the database itself), since the owner of a table is not held by
// its policies and may grant itself anything on it. The error names only the
// roles, never a URL or a password.
async function assertRolesUnprivileged(client: PoolClient) {
  const { rows } = await client.query<{ rolname: string }>(
    `SELECT r.rolname FROM pg_roles r
     WHERE r.rolname = ANY($1)
       AND (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb
            OR EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid)
            OR EXISTS (SELECT 1 FROM pg_class c WHERE c.relowner = r.oid)
            OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.proowner = r.oid)
            OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspowner = r.oid)
            OR EXISTS (SELECT 1 FROM pg_database d
                       WHERE d.datname = current_database()
                         AND d.datdba = r.oid))
     ORDER BY r.rolname`,
    [DB_ROLE_NAMES],
  );
  if (rows.length > 0) {
    throw new Error(
      `Usuários do banco com privilégios a mais (superuser, BYPASSRLS, CREATEROLE, CREATEDB, membro de outro papel ou dono de tabela, função, schema ou do banco): ${rows.map((row) => row.rolname).join(", ")}`,
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
