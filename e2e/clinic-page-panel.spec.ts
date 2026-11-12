import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "../playwright.config";

import { signInWithFreshTwoFactor } from "./helpers";
import { TEST_ADMIN_CLINIC_PAGE } from "./test-account";

// The owner sets up "Minha página": data, amenities, online booking, products,
// reviews and the loyalty card. Fictitious rows go straight into the throwaway
// e2e database and are removed afterwards.
test.describe.configure({ mode: "serial" });

// The first clinic, created by drizzle/0007_multi_clinic.sql.
const CLINIC_ID = "00000000-0000-4000-8000-000000000100";
const FLEXIBLE_SERVICE_ID = "00000000-0000-4000-8000-000000000002";
const REVIEW_PATIENT_ID = "00000000-0000-4000-8000-0000000000b1";
const LOYALTY_PATIENT_ID = "00000000-0000-4000-8000-0000000000b2";
const REVIEW_ID = "00000000-0000-4000-8000-0000000000b3";

let context: BrowserContext;
let page: Page;
// Restored when the suite ends.
let originalOnline = false;

async function withDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function insertPatient(
  client: Client,
  id: string,
  name: string,
  phone: string,
) {
  await client.query(
    `INSERT INTO patients (id, clinic_id, name, name_normalized, phone)
     VALUES ($1, $2, $3, lower($3), $4)`,
    [id, CLINIC_ID, name, phone],
  );
}

test.describe("minha página", () => {
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await signInWithFreshTwoFactor(page, TEST_ADMIN_CLINIC_PAGE);
    originalOnline = await withDb(async (client) => {
      const { rows } = await client.query<{ on: boolean }>(
        "SELECT online_booking_choice AS on FROM clinics WHERE id = $1",
        [CLINIC_ID],
      );
      return rows[0]!.on;
    });
  });

  test.afterAll(async () => {
    await context.close();
    await withDb(async (client) => {
      const patients = [REVIEW_PATIENT_ID, LOYALTY_PATIENT_ID];
      await client.query(
        "DELETE FROM loyalty_redemptions WHERE patient_id = ANY($1)",
        [patients],
      );
      await client.query("DELETE FROM reviews WHERE id = $1", [REVIEW_ID]);
      await client.query(
        "DELETE FROM appointments WHERE patient_id = ANY($1)",
        [patients],
      );
      await client.query("DELETE FROM patients WHERE id = ANY($1)", [patients]);
      await client.query("DELETE FROM products WHERE clinic_id = $1", [
        CLINIC_ID,
      ]);
      await client.query(
        `UPDATE clinics SET instagram_handle = NULL, amenities = '{}',
           online_booking_choice = $2, loyalty_choice = false,
           loyalty_visits = 10, loyalty_reward = NULL
         WHERE id = $1`,
        [CLINIC_ID, originalOnline],
      );
    });
  });

  test("owner edits her page", async () => {
    await page.goto("/admin/pagina");
    const nav = page.getByRole("navigation", { name: "Menu principal" });
    await expect(
      nav.getByRole("link", { name: "Minha página" }),
    ).toHaveAttribute("aria-current", "page");

    await page.getByLabel("Instagram").fill("@karolpachecojk");
    await page.getByRole("checkbox", { name: "Wi-Fi" }).check();
    await page.getByRole("button", { name: "Salvar página" }).click();
    await expect(page.getByText("Página salva.")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Instagram")).toHaveValue("karolpachecojk");
    await expect(page.getByRole("checkbox", { name: "Wi-Fi" })).toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: "Aceita pets" }),
    ).not.toBeChecked();
  });

  test("owner turns online booking off and on", async () => {
    const toggle = page.getByRole("checkbox", {
      name: "Aceitar agendamentos online",
    });
    await withDb((client) =>
      client.query(
        "UPDATE clinics SET online_booking_choice = true WHERE id = $1",
        [CLINIC_ID],
      ),
    );
    await page.goto("/admin/pagina");
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await page.getByRole("button", { name: "Salvar página" }).click();
    await expect(page.getByText("Página salva.")).toBeVisible();
    await page.reload();
    await expect(toggle).not.toBeChecked();

    await toggle.check();
    await page.getByRole("button", { name: "Salvar página" }).click();
    await expect(page.getByText("Página salva.")).toBeVisible();
    await page.reload();
    await expect(toggle).toBeChecked();
  });

  test("owner starts products with examples and edits one", async () => {
    await page.goto("/admin/produtos");
    await page.getByRole("button", { name: "Começar com exemplos" }).click();
    for (const name of [
      "Protetor solar FPS 50",
      "Hidratante facial",
      "Sérum de vitamina C",
    ]) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }

    await page.getByRole("link", { name: "Hidratante facial" }).click();
    await expect(page).toHaveURL(/\/admin\/produtos\/[0-9a-f-]+$/);
    await page.getByLabel("Preço").fill("59,90");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page).toHaveURL(/\/admin\/produtos$/);
    await expect(
      page.getByRole("listitem").filter({ hasText: "Hidratante facial" }),
    ).toContainText("R$ 59,90");
  });

  test("owner hides a review", async () => {
    await withDb(async (client) => {
      await insertPatient(
        client,
        REVIEW_PATIENT_ID,
        "Ana Paula Souza",
        "+5511900001001",
      );
      await client.query(
        `INSERT INTO reviews (id, clinic_id, patient_id, rating, comment)
         VALUES ($1, $2, $3, 5, 'Atendimento maravilhoso (teste)')`,
        [REVIEW_ID, CLINIC_ID, REVIEW_PATIENT_ID],
      );
    });
    await page.goto("/admin/pagina/avaliacoes");
    const row = page.getByRole("listitem").filter({
      hasText: "Atendimento maravilhoso (teste)",
    });
    await expect(row).toContainText("Ana Paula Souza");
    await expect(row.getByText("Escondida")).toHaveCount(0);
    await row.getByRole("button", { name: "Esconder" }).click();
    await expect(row.getByText("Escondida")).toBeVisible();
    await expect(row.getByRole("button", { name: "Mostrar" })).toBeVisible();
  });

  test("owner sets loyalty and marks a prize used", async () => {
    await page.goto("/admin/pagina");
    await page.getByLabel("Ativar cartão fidelidade").check();
    await page.getByLabel("Visitas para ganhar o prêmio").fill("2");
    await page
      .getByLabel("Prêmio", { exact: true })
      .fill("Uma limpeza de pele grátis");
    await page
      .getByRole("button", { name: "Salvar cartão fidelidade" })
      .click();
    await expect(page.getByText("Cartão salvo.")).toBeVisible();

    await withDb(async (client) => {
      await insertPatient(
        client,
        LOYALTY_PATIENT_ID,
        "Bia Fidelidade Teste",
        "+5511900001002",
      );
      for (const day of [3, 2]) {
        await client.query(
          `WITH slot AS (
             SELECT (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
                     - make_interval(days => $4::int) + interval '10 hours')
                    AT TIME ZONE 'America/Sao_Paulo' AS starts_at
           )
           INSERT INTO appointments (clinic_id, patient_id, service_id,
             service_name, service_duration_minutes, custom_label, starts_at,
             ends_at, occupied_from, occupied_until, status, source,
             confirmed_at)
           SELECT $1, $2, $3, 'Avaliação / encaixe', 30, 'Visita (teste)',
             starts_at, starts_at + interval '30 minutes', starts_at,
             starts_at + interval '30 minutes', 'completed', 'admin', now()
           FROM slot`,
          [CLINIC_ID, LOYALTY_PATIENT_ID, FLEXIBLE_SERVICE_ID, day],
        );
      }
    });

    await page.goto(`/admin/pacientes/${LOYALTY_PATIENT_ID}`);
    await expect(page.getByText("Prêmio disponível")).toBeVisible();
    await expect(page.getByText("Uma limpeza de pele grátis")).toBeVisible();
    await page.getByRole("button", { name: "Prêmio usado" }).click();
    await expect(page.getByText("0 de 2")).toBeVisible();
    await expect(page.getByText("Prêmio disponível")).toHaveCount(0);
  });
});
