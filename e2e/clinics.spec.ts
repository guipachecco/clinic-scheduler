import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "../playwright.config";

import { signInWithFreshTwoFactor } from "./helpers";
import { TEST_ROOT } from "./test-account";

// Root picks the clinic the panel shows, and creates a new one that starts
// empty: none of the first clinic's data shows up in it.
test.describe.configure({ mode: "serial" });

const NEW_CLINIC = "Studio Fictício de Unhas";
const NEW_SLUG = "studio-ficticio-de-unhas";

let context: BrowserContext;
let page: Page;

test.describe("clinicas", () => {
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await signInWithFreshTwoFactor(page, TEST_ROOT, /\/admin\/clinicas$/);
  });

  test.afterAll(async () => {
    await context.close();
    const client = new Client({ connectionString: E2E_DATABASE_URL });
    await client.connect();
    try {
      // The new clinic's own rows, then the clinic.
      await client.query(
        `DELETE FROM audit_logs WHERE clinic_id IN (SELECT id FROM clinics WHERE slug = $1)`,
        [NEW_SLUG],
      );
      for (const table of [
        "services",
        "service_categories",
        "payment_methods",
        "expense_categories",
      ]) {
        await client.query(
          `DELETE FROM ${table} WHERE clinic_id IN (SELECT id FROM clinics WHERE slug = $1)`,
          [NEW_SLUG],
        );
      }
      await client.query(`DELETE FROM clinics WHERE slug = $1`, [NEW_SLUG]);
    } finally {
      await client.end();
    }
  });

  test("without a chosen clinic, root lands on the clinic list", async () => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/clinicas$/);
    await expect(
      page.getByRole("heading", { name: "Clínicas", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("/grais")).toBeVisible();
  });

  test("creates a clinic with the address suggested from the name", async () => {
    await page.getByLabel("Nome da clínica").fill(NEW_CLINIC);
    await expect(page.getByLabel("Endereço da página")).toHaveValue(NEW_SLUG);
    await page.getByRole("button", { name: "Criar clínica" }).click();
    await expect(page.getByText(`/${NEW_SLUG}`)).toBeVisible();
  });

  test("opens the new clinic, which only has the default catalog", async () => {
    await page
      .getByRole("listitem")
      .filter({ hasText: NEW_CLINIC })
      .getByRole("button", { name: "Abrir painel" })
      .click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText(NEW_CLINIC).first()).toBeVisible();
    await page.goto("/admin/servicos");
    await expect(
      page.getByRole("heading", { name: "Outros", level: 2 }),
    ).toBeVisible();
    await page.goto("/admin/pacientes");
    await expect(page.getByText(/Nenhum paciente/i).first()).toBeVisible();
  });

  test("switches back to the first clinic", async () => {
    await page.getByRole("link", { name: "Trocar de clínica" }).click();
    await page
      .getByRole("listitem")
      .filter({ hasText: "/grais" })
      .getByRole("button", { name: "Abrir painel" })
      .click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText(NEW_CLINIC)).toHaveCount(0);
  });
});
