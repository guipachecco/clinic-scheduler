import { inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, endPools, inClinic, panelDb, withClinic } from "@/db/client";
import { findPgError } from "@/db/errors";
import { runMigrations } from "@/db/migrate";
import { DB_ROLE_NAMES } from "@/db/roles";
import * as schema from "@/db/schema";
import { patients, users } from "@/db/schema";

import { CLINIC, otherClinic } from "../helpers/clinic";
import { ROLE_URLS } from "../helpers/roles";

// Checks the PostgreSQL roles the app connects with: the catalog rules every
// table must follow, and that app_panel only ever reaches the rows of the
// clinic set for its transaction. Every record is fictitious.

let clinicB: string;
let patientA: string;
let patientB: string;

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
});

afterAll(async () => {
  await db.delete(patients).where(inArray(patients.id, [patientA, patientB]));
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
