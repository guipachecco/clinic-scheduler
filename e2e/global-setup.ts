import { rm } from "node:fs/promises";

import { Client } from "pg";

import {
  E2E_DATABASE_URL,
  E2E_EMAIL_OUTBOX_DIR,
  E2E_SERVER_ENV,
} from "../playwright.config";
import { resetDatabase } from "../tests/helpers/test-database";

import { seedClientAreaClinics } from "./client-area-fixtures";
import {
  TEST_ADMIN,
  TEST_ADMIN_AGENDA,
  TEST_ADMIN_CLIENT_AREA,
  TEST_ADMIN_FINANCE,
  TEST_ROOT,
  TEST_ROOT_BRANDING,
  TEST_ADMIN_PATIENTS,
  TEST_ADMIN_SCHEDULE,
  TEST_ADMIN_SERVICES,
} from "./test-account";

export default async function globalSetup() {
  await resetDatabase(E2E_DATABASE_URL);
  // E-mails of earlier runs would be read as this run's links.
  await rm(E2E_EMAIL_OUTBOX_DIR, { recursive: true, force: true });

  const owner = new Client({ connectionString: E2E_DATABASE_URL });
  await owner.connect();
  try {
    await seedClientAreaClinics(owner);
  } finally {
    await owner.end();
  }

  // The account module reads its configuration when it is first imported.
  Object.assign(process.env, E2E_SERVER_ENV);
  const { createAdmin } = await import("../src/modules/auth/admin-accounts");
  const { pool } = await import("../src/db/client");
  try {
    await createAdmin(TEST_ADMIN);
    await createAdmin(TEST_ADMIN_PATIENTS);
    await createAdmin(TEST_ADMIN_SERVICES);
    await createAdmin(TEST_ADMIN_SCHEDULE);
    await createAdmin(TEST_ADMIN_AGENDA);
    await createAdmin(TEST_ADMIN_FINANCE);
    await createAdmin(TEST_ADMIN_CLIENT_AREA);
    await createAdmin(TEST_ROOT);
    await createAdmin(TEST_ROOT_BRANDING);
  } finally {
    await pool.end();
  }
}
