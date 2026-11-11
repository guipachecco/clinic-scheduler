import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { clientDb, inClinic, platformDb } from "@/db/client";
import { db, endPools } from "@/db/owner";
import { findPgError } from "@/db/errors";

import { otherClinic } from "../helpers/clinic";

// Migration 0027: the modules a clinic has, and the effective switches
// (online booking, loyalty, anamnesis template) generated from the owner's
// choice and the module. Every record is fictitious.

let clinicId: string;

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const pg = findPgError(error);
    return `${pg?.code ?? ""} ${String((error as Error).cause ?? error)}`;
  }
  throw new Error("expected the query to fail");
}

// A text[] literal; drizzle would expand a JS array into a row of params.
const pgArray = (items: string[]) => `{${items.join(",")}}`;

async function setModules(modules: string[]) {
  await db.execute(
    sql`update clinics set modules = ${pgArray(modules)}::text[] where id = ${clinicId}`,
  );
}

async function effective() {
  const result = await db.execute<{
    online_booking_enabled: boolean;
    loyalty_enabled: boolean;
    anamnesis_template: string | null;
  }>(
    sql`select online_booking_enabled, loyalty_enabled, anamnesis_template
        from clinics where id = ${clinicId}`,
  );
  return result.rows[0]!;
}

const ALL = [
  "products",
  "finance",
  "online_booking",
  "loyalty",
  "anamnesis",
  "reviews",
];

beforeAll(async () => {
  clinicId = await otherClinic("clinica-modulos-teste");
  await db.execute(
    sql`insert into time_blocks (clinic_id, type, starts_at, ends_at)
        values (${clinicId}, 'day_off', '2033-04-10T12:00:00Z', '2033-04-10T13:00:00Z')`,
  );
});

afterAll(async () => {
  await db.execute(sql`delete from time_blocks where clinic_id = ${clinicId}`);
  await endPools();
});

describe("clinic modules", () => {
  it("starts with every module on", async () => {
    const result = await db.execute<{ modules: string[] }>(
      sql`select modules from clinics where id = ${clinicId}`,
    );
    expect(result.rows[0]!.modules).toEqual(ALL);
  });

  it("app_panel cannot change clinics.modules", async () => {
    const message = await failure(
      inClinic(clinicId, (tx) =>
        tx.execute(
          sql`update clinics set modules = '{}'::text[] where id = ${clinicId}`,
        ),
      ),
    );
    expect(message).toContain("42501");
    expect(message).toContain("permission denied");
  });

  it("rejects an unknown module", async () => {
    expect(await failure(setModules(["estoque"]))).toContain(
      "clinics_modules_check",
    );
  });

  it("online booking needs the module and the owner's choice", async () => {
    await db.execute(
      sql`update clinics set online_booking_choice = true where id = ${clinicId}`,
    );
    await setModules(ALL);
    expect((await effective()).online_booking_enabled).toBe(true);
    await setModules(ALL.filter((key) => key !== "online_booking"));
    expect((await effective()).online_booking_enabled).toBe(false);
    await setModules(ALL);
    expect((await effective()).online_booking_enabled).toBe(true);
  });

  it("loyalty needs the module and the owner's choice", async () => {
    await db.execute(
      sql`update clinics set loyalty_choice = true, loyalty_reward = 'Brinde fictício'
          where id = ${clinicId}`,
    );
    expect((await effective()).loyalty_enabled).toBe(true);
    await setModules(ALL.filter((key) => key !== "loyalty"));
    expect((await effective()).loyalty_enabled).toBe(false);
    await setModules(ALL);
  });

  it("keeps the loyalty check on the owner's choice", async () => {
    expect(
      await failure(
        db.execute(
          sql`update clinics set loyalty_choice = true, loyalty_reward = null
              where id = ${clinicId}`,
        ),
      ),
    ).toContain("clinics_loyalty_check");
  });

  it("anamnesis template is hidden while the module is off", async () => {
    await db.execute(
      sql`update clinics set anamnesis_template_choice = 'integrativa-ads-v1'
          where id = ${clinicId}`,
    );
    expect((await effective()).anamnesis_template).toBe("integrativa-ads-v1");
    await setModules(ALL.filter((key) => key !== "anamnesis"));
    expect((await effective()).anamnesis_template).toBeNull();
    await setModules(ALL);
    await db.execute(
      sql`update clinics set anamnesis_template_choice = null where id = ${clinicId}`,
    );
  });

  it("client_busy_intervals returns nothing while online booking module is off", async () => {
    await db.execute(
      sql`update clinics set online_booking_choice = true where id = ${clinicId}`,
    );
    const busy = () =>
      clientDb.execute(
        sql`select * from client_busy_intervals(${clinicId}, ${"2033-04-10T00:00:00Z"}, ${"2033-04-11T00:00:00Z"})`,
      );
    expect((await busy()).rows).toHaveLength(1);
    await setModules(ALL.filter((key) => key !== "online_booking"));
    expect((await busy()).rows).toHaveLength(0);
    await setModules(ALL);
  });

  it("app_client reads modules", async () => {
    const result = await clientDb.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.clinic_id', ${clinicId}, true)`,
      );
      return tx.execute<{
        modules: string[];
        online_booking_enabled: boolean;
        loyalty_enabled: boolean;
      }>(
        sql`select modules, online_booking_enabled, loyalty_enabled
            from clinics where id = ${clinicId}`,
      );
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.modules).toEqual(ALL);
  });

  it("app_platform changes modules, business type and name", async () => {
    await platformDb.execute(
      sql`update clinics set modules = ${pgArray(ALL)}::text[], business_type = 'clinic',
          name = 'Clínica Módulos Fictícia' where id = ${clinicId}`,
    );
  });
});
