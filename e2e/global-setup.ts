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
  TEST_ADMIN_ANAMNESIS,
  TEST_ADMIN_CLIENT_AREA,
  TEST_ADMIN_CLINIC_PAGE,
  TEST_ADMIN_FINANCE,
  PAGE_BUILDER_CLINIC_SLUG,
  PANEL_HOME_CLINIC_SLUG,
  TEST_ADMIN_AGENDA_PHONE,
  TEST_ADMIN_PAGE_BUILDER,
  TEST_ADMIN_PANEL_HOME,
  TEST_ADMIN_PANEL_MOBILE,
  TEST_ADMIN_PATIENT_LINKS,
  TEST_ROOT,
  TEST_ROOT_ANAMNESIS,
  TEST_ROOT_BRANDING,
  TEST_ADMIN_PATIENTS,
  TEST_ADMIN_PRODUCTS,
  TEST_ADMIN_SCHEDULE,
  TEST_ADMIN_SERVICES,
  TEST_ADMIN_STOCK,
  TEST_ADMIN_TEAM,
} from "./test-account";

export default async function globalSetup() {
  await resetDatabase(E2E_DATABASE_URL);
  // E-mails of earlier runs would be read as this run's links.
  await rm(E2E_EMAIL_OUTBOX_DIR, { recursive: true, force: true });

  const owner = new Client({ connectionString: E2E_DATABASE_URL });
  await owner.connect();
  try {
    await seedClientAreaClinics(owner);
    // Own clinic for the panel home suite (default time zone, no hours).
    await owner.query(
      `INSERT INTO clinics (slug, name, slot_step_minutes) VALUES ($1, $2, 30)`,
      [PANEL_HOME_CLINIC_SLUG, "Clínica Painel Início (teste)"],
    );
    // Own clinic for the page builder suite: online booking on, so the public
    // page shows its booking button.
    await owner.query(
      `INSERT INTO clinics (slug, name, slot_step_minutes, online_booking_choice)
       VALUES ($1, $2, 30, true)`,
      [PAGE_BUILDER_CLINIC_SLUG, "Barbearia Montar Página (teste)"],
    );
  } finally {
    await owner.end();
  }

  // The account module reads its configuration when it is first imported.
  Object.assign(process.env, E2E_SERVER_ENV);
  const { createAdmin } = await import("../src/modules/auth/admin-accounts");
  const { endPools } = await import("../src/db/client");
  try {
    await createAdmin(TEST_ADMIN);
    await createAdmin(TEST_ADMIN_PATIENTS);
    await createAdmin(TEST_ADMIN_SERVICES);
    await createAdmin(TEST_ADMIN_PRODUCTS);
    await createAdmin(TEST_ADMIN_STOCK);
    await createAdmin(TEST_ADMIN_TEAM);
    await createAdmin(TEST_ADMIN_SCHEDULE);
    await createAdmin(TEST_ADMIN_AGENDA);
    await createAdmin(TEST_ADMIN_FINANCE);
    await createAdmin(TEST_ADMIN_CLIENT_AREA);
    await createAdmin(TEST_ADMIN_CLINIC_PAGE);
    await createAdmin(TEST_ADMIN_PATIENT_LINKS);
    await createAdmin(TEST_ADMIN_PANEL_MOBILE);
    await createAdmin(TEST_ADMIN_PANEL_HOME);
    await createAdmin(TEST_ADMIN_PAGE_BUILDER);
    await createAdmin(TEST_ADMIN_AGENDA_PHONE);
    await createAdmin(TEST_ROOT);
    await createAdmin(TEST_ROOT_BRANDING);
    await createAdmin(TEST_ADMIN_ANAMNESIS);
    await createAdmin(TEST_ROOT_ANAMNESIS);
  } finally {
    await endPools();
  }
}
