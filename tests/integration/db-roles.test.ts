import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inClinic, panelDb, withClinic } from "@/db/client";
import { db, endPools } from "@/db/owner";
import { findPgError } from "@/db/errors";
import { runMigrations } from "@/db/migrate";
import { DB_ROLE_NAMES } from "@/db/roles";
import * as schema from "@/db/schema";
import { clinics, media, patients, users } from "@/db/schema";

import { CLINIC, otherClinic } from "../helpers/clinic";
import { ROLE_URLS } from "../helpers/roles";

// Checks the PostgreSQL roles the app connects with: the catalog rules every
// table must follow, and that app_panel only ever reaches the rows of the
// clinic set for its transaction. Every record is fictitious.

let clinicB: string;
let patientA: string;
let patientB: string;
let mediaB: string;

// Tables app_panel may reach without row-level security. Each entry needs a
// reason here; none so far.
const PANEL_TABLES_WITHOUT_RLS = new Set<string>([]);

const roleList = () =>
  sql.join(
    DB_ROLE_NAMES.map((name) => sql`${name}`),
    sql`, `,
  );

async function pgErrorCode(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return findPgError(error)?.code;
  }
  return "no error";
}

beforeAll(async () => {
  clinicB = await otherClinic("clinica-papeis-teste");
  const [a] = await db
    .insert(patients)
    .values({
      clinicId: CLINIC,
      name: "Paciente Papel A",
      nameNormalized: "paciente papel a",
      phone: "+5500000001101",
    })
    .returning({ id: patients.id });
  const [b] = await db
    .insert(patients)
    .values({
      clinicId: clinicB,
      name: "Paciente Papel B",
      nameNormalized: "paciente papel b",
      phone: "+5500000001102",
    })
    .returning({ id: patients.id });
  patientA = a!.id;
  patientB = b!.id;
  const [photo] = await db
    .insert(media)
    .values({
      clinicId: clinicB,
      kind: "photo",
      mimeType: "image/png",
      data: Buffer.from([1, 2, 3]),
      byteSize: 3,
      width: 1,
      height: 1,
    })
    .returning({ id: media.id });
  mediaB = photo!.id;
});

afterAll(async () => {
  await db.delete(patients).where(inArray(patients.id, [patientA, patientB]));
  await db.delete(media).where(eq(media.id, mediaB));
  await endPools();
});

describe("database roles", () => {
  it("no app role owns a table or bypasses RLS", async () => {
    const owned = await db.execute<{ relname: string }>(sql`
      select c.relname from pg_class c
      join pg_roles r on r.oid = c.relowner
      where r.rolname in (${sql.join(
        DB_ROLE_NAMES.map((name) => sql`${name}`),
        sql`, `,
      )})
    `);
    expect(owned.rows).toEqual([]);

    const roles = await db.execute<{
      rolname: string;
      rolbypassrls: boolean;
      rolsuper: boolean;
    }>(
      sql`
        select rolname, rolbypassrls, rolsuper from pg_roles
        where rolname in (${sql.join(
          DB_ROLE_NAMES.map((name) => sql`${name}`),
          sql`, `,
        )})
        order by rolname
      `,
    );
    expect(roles.rows).toEqual(
      [...DB_ROLE_NAMES].sort().map((rolname) => ({
        rolname,
        rolbypassrls: false,
        rolsuper: false,
      })),
    );
  });

  it("no app role is a member of another role or has admin attributes", async () => {
    const memberships = await db.execute<{ member: string; role: string }>(sql`
      select m.rolname as member, r.rolname as role
      from pg_auth_members am
      join pg_roles m on m.oid = am.member
      join pg_roles r on r.oid = am.roleid
      where m.rolname in (${roleList()})
    `);
    expect(memberships.rows).toEqual([]);

    const admins = await db.execute<{ rolname: string }>(sql`
      select rolname from pg_roles
      where rolname in (${roleList()}) and (rolcreaterole or rolcreatedb)
    `);
    expect(admins.rows).toEqual([]);
  });

  it("every table the panel can reach has RLS", async () => {
    const reachable = await db.execute<{
      table_name: string;
      rls: boolean;
    }>(sql`
      select n.nspname || '.' || c.relname as table_name,
             c.relrowsecurity as rls
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p', 'v', 'm', 'f')
        and n.nspname not in ('pg_catalog', 'information_schema')
        and has_table_privilege('app_panel', c.oid,
              'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
      order by 1
    `);
    expect(reachable.rows.length).toBeGreaterThan(10);
    const missing = reachable.rows.filter(
      (row) => !row.rls && !PANEL_TABLES_WITHOUT_RLS.has(row.table_name),
    );
    expect(missing).toEqual([]);
  });

  it("panel cannot change the clinic's protected columns", async () => {
    for (const change of [{ isActive: false }, { slug: "outro-endereco" }]) {
      const code = await pgErrorCode(
        inClinic(CLINIC, (tx) =>
          tx.update(clinics).set(change).where(eq(clinics.id, CLINIC)),
        ),
      );
      expect(code).toBe("42501");
    }
    // Branding stays editable.
    await inClinic(CLINIC, (tx) =>
      tx.update(clinics).set({ areaLabel: null }).where(eq(clinics.id, CLINIC)),
    );
  });

  it("panel cannot change the anamnesis flag", async () => {
    const code = await pgErrorCode(
      inClinic(CLINIC, (tx) =>
        tx
          .update(clinics)
          .set({ anamnesisTemplateChoice: null })
          .where(eq(clinics.id, CLINIC)),
      ),
    );
    expect(code).toBe("42501");
  });

  it("panel cannot point its photo at another clinic's image", async () => {
    const code = await pgErrorCode(
      inClinic(CLINIC, (tx) =>
        tx
          .update(clinics)
          .set({ ownerPhotoMediaId: mediaB })
          .where(eq(clinics.id, CLINIC)),
      ),
    );
    expect(code).toBe("23503");
  });

  it("refuses an app role with extra privileges", async () => {
    await db.execute(sql`grant pg_read_all_data to app_client`);
    try {
      await expect(
        runMigrations(process.env.DATABASE_URL!, ROLE_URLS),
      ).rejects.toThrowError(/privilégios a mais.*app_client/);
    } finally {
      await db.execute(sql`revoke pg_read_all_data from app_client`);
    }
  });

  it("checks the roles before giving them a login password", async () => {
    const changed = new URL(ROLE_URLS.app_client);
    changed.password = "senha-que-nao-deve-valer";
    await db.execute(sql`alter role app_client bypassrls`);
    try {
      const error = await runMigrations(process.env.DATABASE_URL!, {
        ...ROLE_URLS,
        app_client: changed.toString(),
      }).catch((caught: unknown) => caught);
      expect(String(error)).toMatch(/privilégios a mais.*app_client/);
      expect(String(error)).not.toContain("senha-que-nao-deve-valer");
      expect(String(error)).not.toContain("postgres://");
    } finally {
      await db.execute(sql`alter role app_client nobypassrls`);
    }
    // The password was never changed: the old one still works, the new does not.
    const oldLogin = new Pool({ connectionString: ROLE_URLS.app_client });
    const newLogin = new Pool({ connectionString: changed.toString() });
    try {
      await expect(oldLogin.query("select 1")).resolves.toBeDefined();
      expect(await pgErrorCode(newLogin.query("select 1"))).toBe("28P01");
    } finally {
      await Promise.all([oldLogin.end(), newLogin.end()]);
    }
  });

  it("refuses an app role that owns a table, a schema or the database", async () => {
    const run = () => runMigrations(process.env.DATABASE_URL!, ROLE_URLS);

    await db.execute(sql`create table role_owned_probe (id int)`);
    try {
      await db.execute(sql`alter table role_owned_probe owner to app_panel`);
      await expect(run()).rejects.toThrowError(/dono.*: app_panel$/);
    } finally {
      await db.execute(sql`drop table role_owned_probe`);
    }

    await db.execute(
      sql`create schema role_owned_schema authorization app_auth`,
    );
    try {
      await expect(run()).rejects.toThrowError(/dono.*: app_auth$/);
    } finally {
      await db.execute(sql`drop schema role_owned_schema`);
    }

    const databaseName = decodeURIComponent(
      new URL(process.env.DATABASE_URL!).pathname.slice(1),
    );
    const owner = await db.execute<{ owner: string }>(
      sql`select current_user as owner`,
    );
    await db.execute(
      sql`alter database ${sql.identifier(databaseName)} owner to app_platform`,
    );
    try {
      await expect(run()).rejects.toThrowError(/dono.*: app_platform$/);
    } finally {
      await db.execute(
        sql`alter database ${sql.identifier(databaseName)} owner to ${sql.identifier(owner.rows[0]!.owner)}`,
      );
    }

    // Back to normal, the migration passes again.
    await expect(run()).resolves.toBeUndefined();
  });

  it("every clinic table has RLS and a panel policy", async () => {
    const tables = await db.execute<{
      table_name: string;
      rls: boolean;
      panel_policies: number;
    }>(sql`
      select c.relname as table_name,
             c.relrowsecurity as rls,
             (select count(*)::int from pg_policies p
               where p.schemaname = 'public' and p.tablename = c.relname
                 and 'app_panel' = any(p.roles)) as panel_policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and exists (select 1 from pg_attribute a
                    where a.attrelid = c.oid and a.attname = 'clinic_id'
                      and not a.attisdropped)
      order by c.relname
    `);
    expect(tables.rows.length).toBeGreaterThan(10);
    const missing = tables.rows.filter(
      (row) => !row.rls || row.panel_policies === 0,
    );
    expect(missing).toEqual([]);
  });

  it("panel sees only the clinic it set", async () => {
    const seen = await inClinic(CLINIC, (tx) =>
      tx
        .select({ id: patients.id })
        .from(patients)
        .where(inArray(patients.id, [patientA, patientB])),
    );
    expect(seen).toEqual([{ id: patientA }]);

    const code = await pgErrorCode(
      inClinic(CLINIC, (tx) =>
        tx.insert(patients).values({
          clinicId: clinicB,
          name: "Paciente Intrusa",
          nameNormalized: "paciente intrusa",
          phone: "+5500000001103",
        }),
      ),
    );
    expect(code).toBe("42501");
  });

  it("panel without a clinic sees nothing", async () => {
    const seen = await panelDb.select({ id: patients.id }).from(patients);
    expect(seen).toEqual([]);
  });

  it("panel cannot touch auth tables", async () => {
    const code = await pgErrorCode(
      inClinic(CLINIC, (tx) => tx.select({ id: users.id }).from(users)),
    );
    expect(code).toBe("42501");
  });

  it("refuses a role URL with another user, before migrating", async () => {
    const wrong = new URL(ROLE_URLS.app_panel);
    wrong.username = "app_auth";
    await expect(
      runMigrations(process.env.DATABASE_URL!, {
        ...ROLE_URLS,
        app_panel: wrong.toString(),
      }),
    ).rejects.toThrowError("DATABASE_URL_PANEL deve usar o usuário app_panel");
  });

  it("settings do not leak between transactions", async () => {
    const singlePool = new Pool({
      connectionString: ROLE_URLS.app_panel,
      max: 1,
    });
    const single = drizzle({ client: singlePool, schema });
    try {
      const ids = [patientA, patientB];
      const pick = (clinicId: string) =>
        withClinic(single, clinicId, (tx) =>
          tx
            .select({ id: patients.id })
            .from(patients)
            .where(inArray(patients.id, ids)),
        );
      expect(await pick(CLINIC)).toEqual([{ id: patientA }]);
      expect(await pick(clinicB)).toEqual([{ id: patientB }]);
      // The same connection, outside any clinic, sees nothing again.
      expect(
        await single
          .select({ id: patients.id })
          .from(patients)
          .where(inArray(patients.id, ids)),
      ).toEqual([]);
    } finally {
      await singlePool.end();
    }
  });
});
