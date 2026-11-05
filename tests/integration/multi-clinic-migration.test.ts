import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs the migrations up to the last single-clinic one on a database of its
// own, adds data the way the app used to, then applies the multi-clinic
// migrations in one transaction (as the migrator does) and checks that the
// existing data now belongs to the first clinic. Every record is fictitious.

const GRAIS = "00000000-0000-4000-8000-000000000100";

const baseUrl = new URL(process.env.DATABASE_URL!);
const databaseName = "clinic_scheduler_migration_test";
const adminUrl = new URL(baseUrl);
adminUrl.pathname = "/postgres";
const url = new URL(baseUrl);
url.pathname = `/${databaseName}`;

let client: Client;

function statements(tag: string) {
  return readFileSync(join(process.cwd(), "drizzle", `${tag}.sql`), "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function apply(tags: string[]) {
  await client.query("begin");
  try {
    for (const tag of tags) {
      for (const statement of statements(tag)) await client.query(statement);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

beforeAll(async () => {
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`drop database if exists ${databaseName} with (force)`);
  await admin.query(`create database ${databaseName}`);
  await admin.end();

  client = new Client({ connectionString: url.toString() });
  await client.connect();
  await apply([
    "0000_initial_schema",
    "0001_appointments_no_overlap",
    "0002_clinic_settings_row",
    "0003_patient_registry",
    "0004_service_flexible",
    "0005_flexible_service_seed",
    "0006_appointment_label_and_reason",
  ]);

  await client.query(
    `update clinic_settings set clinic_name = 'Clínica Antiga', slot_step_minutes = 15`,
  );
  await client.query(
    `insert into users (id, name, email, role) values
     ('00000000-0000-4000-8000-0000000000a1', 'Dona', 'dona@example.com', 'admin')`,
  );
  await client.query(
    `insert into patients (id, name, name_normalized, phone) values
     ('00000000-0000-4000-8000-0000000000b1', 'Paciente Fictício', 'paciente ficticio', '+5548999991234')`,
  );
  await client.query(
    `insert into business_hours (weekday, start_time, end_time) values (1, '08:00', '12:00')`,
  );
  await client.query(
    `insert into appointments (patient_id, service_id, service_name, service_duration_minutes,
       starts_at, ends_at, occupied_from, occupied_until, status, source)
     values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000002',
       'Avaliação / encaixe', 30, '2030-01-01T13:00Z', '2030-01-01T13:30Z',
       '2030-01-01T13:00Z', '2030-01-01T13:30Z', 'confirmed', 'admin')`,
  );

  await apply(["0007_multi_clinic", "0008_drop_clinic_settings"]);
});

afterAll(async () => {
  await client?.end();
});

describe("multi-clinic migration", () => {
  it("creates the first clinic from the old settings row", async () => {
    const { rows } = await client.query(
      `select id, slug, name, slot_step_minutes from clinics`,
    );
    expect(rows).toEqual([
      {
        id: GRAIS,
        slug: "grais",
        name: "Clínica Antiga",
        slot_step_minutes: 15,
      },
    ]);
    const { rows: tables } = await client.query(
      `select to_regclass('public.clinic_settings') as old`,
    );
    expect(tables[0].old).toBeNull();
  });

  it("moves every existing row and the admin into the first clinic", async () => {
    for (const table of [
      "patients",
      "services",
      "service_categories",
      "business_hours",
      "appointments",
      "users",
    ]) {
      const { rows } = await client.query(
        `select count(*)::int as total, count(*) filter (where clinic_id = $1)::int as moved from ${table}`,
        [GRAIS],
      );
      expect({ table, ...rows[0] }).toEqual({
        table,
        total: rows[0].total,
        moved: rows[0].total,
      });
      expect(rows[0].total).toBeGreaterThan(0);
    }
  });

  it("keeps the overlap rule inside each clinic only", async () => {
    await client.query(
      `insert into clinics (id, slug, name) values ('00000000-0000-4000-8000-0000000000c2', 'outra', 'Outra')`,
    );
    await client.query(
      `insert into service_categories (id, clinic_id, name, slug) values
       ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000c2', 'Cat', 'cat')`,
    );
    await client.query(
      `insert into services (id, clinic_id, category_id, name, slug, duration_minutes) values
       ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-0000000000c2',
        '00000000-0000-4000-8000-0000000000c3', 'S', 's', 30)`,
    );
    await client.query(
      `insert into patients (id, clinic_id, name, name_normalized, phone) values
       ('00000000-0000-4000-8000-0000000000c5', '00000000-0000-4000-8000-0000000000c2',
        'Paciente Fictício', 'paciente ficticio', '+5548999991234')`,
    );
    const insertAt = (clinic: string, patient: string, service: string) =>
      client.query(
        `insert into appointments (clinic_id, patient_id, service_id, service_name, service_duration_minutes,
           starts_at, ends_at, occupied_from, occupied_until, status, source)
         values ($1, $2, $3, 'S', 30, '2030-01-01T13:00Z', '2030-01-01T13:30Z',
           '2030-01-01T13:00Z', '2030-01-01T13:30Z', 'confirmed', 'admin')`,
        [clinic, patient, service],
      );

    // Same time in another clinic: accepted.
    await insertAt(
      "00000000-0000-4000-8000-0000000000c2",
      "00000000-0000-4000-8000-0000000000c5",
      "00000000-0000-4000-8000-0000000000c4",
    );
    // Same time in the first clinic: refused.
    await expect(
      insertAt(
        GRAIS,
        "00000000-0000-4000-8000-0000000000b1",
        "00000000-0000-4000-8000-000000000002",
      ),
    ).rejects.toMatchObject({ code: "23P01" });
  });
});
