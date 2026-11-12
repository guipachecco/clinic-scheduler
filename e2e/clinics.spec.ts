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
        "products",
        "product_categories",
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

  test("creates a clinic without Produtos and Financeiro", async () => {
    await page.getByLabel("Nome da clínica").fill(NEW_CLINIC);
    await expect(page.getByLabel("Endereço da página")).toHaveValue(NEW_SLUG);
    await page
      .getByLabel("Tipo de negócio")
      .selectOption({ label: "Manicure e estética" });
    await page.getByRole("checkbox", { name: "Produtos" }).uncheck();
    await page.getByRole("checkbox", { name: "Financeiro" }).uncheck();
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
    await expect(page.getByText(NEW_CLINIC).last()).toBeVisible();
    await page.goto("/admin/servicos");
    await expect(
      page.getByRole("heading", { name: "Outros", level: 2 }),
    ).toBeVisible();
    await page.goto("/admin/pacientes");
    await expect(
      page.getByText(/Nenhum (paciente|cliente)/i).first(),
    ).toBeVisible();
  });

  test("the panel of that clinic hides the turned-off modules", async () => {
    await page.goto("/admin");
    const nav = page.getByRole("navigation", { name: "Menu principal" });
    await expect(nav.getByRole("link", { name: "Clientes" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Financeiro" })).toHaveCount(0);
    for (const path of ["/admin/financeiro", "/admin/produtos"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(
        page.getByRole("heading", { name: "Página não encontrada" }),
      ).toBeVisible();
    }
  });

  test("root turns Financeiro back on from the edit page", async () => {
    await page.goto("/admin/clinicas");
    await page
      .getByRole("listitem")
      .filter({ hasText: NEW_CLINIC })
      .getByRole("link", { name: "Editar" })
      .click();
    await expect(page).toHaveURL(/\/admin\/clinicas\/[0-9a-f-]+$/);
    await page.waitForLoadState("networkidle");
    await page.getByRole("checkbox", { name: "Financeiro" }).check();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Alterações salvas.")).toBeVisible();
    await page.goto("/admin/clinicas");
    await page
      .getByRole("listitem")
      .filter({ hasText: NEW_CLINIC })
      .getByRole("button", { name: "Abrir painel" })
      .click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(
      page
        .getByRole("navigation", { name: "Menu principal" })
        .getByRole("link", { name: "Financeiro" }),
    ).toBeVisible();
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
