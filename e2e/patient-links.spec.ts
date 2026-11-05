import { expect, test } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "../playwright.config";

import { CLIENT_AREA } from "./client-area-fixtures";
import { signInWithFreshTwoFactor } from "./helpers";
import { TEST_ADMIN_PATIENT_LINKS } from "./test-account";

// The owner's answer to a client who signed up online with the phone of a
// patient the clinic already had. The records are seeded straight into the
// e2e database, in clinic B of the client-area fixtures. Every person here is
// fictitious.

const EXISTING = "Rosa Ficha Antiga (teste)";
const ONLINE = "Rosa Cadastro Online (teste)";
const PHONE = "+5511987659901";
const EMAIL = "rosa-fichas-online@example.test";

async function query<T extends object>(sql: string, params: unknown[] = []) {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.end();
  }
}

test("the owner confirms an online signup is the same person", async ({
  page,
}) => {
  const [clinic] = await query<{ id: string }>(
    "SELECT id FROM clinics WHERE slug = $1",
    [CLIENT_AREA.b.slug],
  );
  const [existing] = await query<{ id: string }>(
    `INSERT INTO patients (clinic_id, name, name_normalized, phone)
     VALUES ($1, $2, lower($2), $3) RETURNING id`,
    [clinic!.id, EXISTING, PHONE],
  );
  const [user] = await query<{ id: string }>(
    `INSERT INTO users (name, email, email_verified, role)
     VALUES ($1, $2, true, 'client') RETURNING id`,
    [ONLINE, EMAIL],
  );
  const [provisional] = await query<{ id: string }>(
    `INSERT INTO patients (clinic_id, user_id, name, name_normalized, phone,
       email, pending_link_patient_id)
     VALUES ($1, $2, $3, lower($3), $4, $5, $6) RETURNING id`,
    [clinic!.id, user!.id, ONLINE, PHONE, EMAIL, existing!.id],
  );

  await signInWithFreshTwoFactor(page, TEST_ADMIN_PATIENT_LINKS);
  const notice = page.getByText(
    `${ONLINE} se cadastrou online. É a mesma pessoa desta ficha?`,
  );
  await expect(notice).toBeVisible();
  await expect(page.getByRole("link", { name: EXISTING })).toBeVisible();
  // The online account's e-mail helps her decide.
  await expect(
    page.getByText(`E-mail da conta online: ${EMAIL}`),
  ).toBeVisible();

  // The same notice on the existing record.
  await page.getByRole("link", { name: EXISTING }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/pacientes/${existing!.id}$`));
  await expect(notice).toBeVisible();

  await page.goto("/admin");
  await page.getByRole("button", { name: "É a mesma" }).click();
  await expect(notice).toHaveCount(0);

  const rows = await query<{ id: string; user_id: string | null }>(
    "SELECT id, user_id FROM patients WHERE id = ANY($1::uuid[])",
    [[existing!.id, provisional!.id]],
  );
  expect(rows).toEqual([{ id: existing!.id, user_id: user!.id }]);
});
