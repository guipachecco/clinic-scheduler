import { E2E_DATABASE_URL, E2E_SERVER_ENV } from "../playwright.config";
import { resetDatabase } from "../tests/helpers/test-database";

import {
  TEST_ADMIN,
  TEST_ADMIN_AGENDA,
  TEST_ADMIN_FINANCE,
  TEST_ROOT,
  TEST_ADMIN_PATIENTS,
  TEST_ADMIN_SCHEDULE,
  TEST_ADMIN_SERVICES,
} from "./test-account";

export default async function globalSetup() {
  await resetDatabase(E2E_DATABASE_URL);

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
    await createAdmin(TEST_ROOT);
  } finally {
    await pool.end();
  }
}
