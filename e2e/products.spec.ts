import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "../playwright.config";

import { signInWithFreshTwoFactor } from "./helpers";
import { TEST_ADMIN_PRODUCTS } from "./test-account";

// One story with fictitious data: a category and a product of the catalog,
// then the product in a quote that becomes a sale.
test.describe.configure({ mode: "serial" });

// The first clinic, created by drizzle/0007_multi_clinic.sql.
const CLINIC_ID = "00000000-0000-4000-8000-000000000100";
const PATIENT_ID = "00000000-0000-4000-8000-0000000000e1";
const CATEGORY = "Injetáveis";
const PRODUCT = "Produto Fictício E2E";
const PATIENT = "Paciente Produtos Fictícia";

let context: BrowserContext;
let page: Page;

async function sql(text: string, values: unknown[] = []) {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query(text, values);
  } finally {
    await client.end();
  }
}

function productRow(name: string) {
  return page.getByRole("listitem").filter({
    has: page.getByRole("link", { name, exact: true }),
  });
}

test.describe("produtos", () => {
  test.beforeAll(async ({ browser }) => {
    await sql(
      `INSERT INTO patients (id, clinic_id, name, name_normalized, phone)
       VALUES ($1, $2, $3, 'paciente produtos ficticia', '+5511900000088')`,
      [PATIENT_ID, CLINIC_ID, PATIENT],
    );
    context = await browser.newContext();
    page = await context.newPage();
    await signInWithFreshTwoFactor(page, TEST_ADMIN_PRODUCTS);
  });

  // Only the rows this suite created, from the leaves up.
  test.afterAll(async () => {
    await context.close();
    const ownQuotes = `SELECT id FROM quotes WHERE patient_id = $1`;
    const ownSales = `SELECT id FROM sales WHERE patient_id = $1`;
    await sql(`DELETE FROM installments WHERE sale_id IN (${ownSales})`, [
      PATIENT_ID,
    ]);
    await sql(`DELETE FROM sale_items WHERE sale_id IN (${ownSales})`, [
      PATIENT_ID,
    ]);
    await sql(`DELETE FROM sales WHERE patient_id = $1`, [PATIENT_ID]);
    await sql(`DELETE FROM quote_items WHERE quote_id IN (${ownQuotes})`, [
      PATIENT_ID,
    ]);
    await sql(`DELETE FROM quotes WHERE patient_id = $1`, [PATIENT_ID]);
    await sql(`DELETE FROM patients WHERE id = $1`, [PATIENT_ID]);
    await sql(`DELETE FROM products WHERE clinic_id = $1 AND name = $2`, [
      CLINIC_ID,
      PRODUCT,
    ]);
    await sql(
      `DELETE FROM product_categories WHERE clinic_id = $1 AND name = $2`,
      [CLINIC_ID, CATEGORY],
    );
  });

  test("creates a category and a product, then edits it", async () => {
    await page.goto("/admin/produtos");
    await page.waitForLoadState("networkidle");
    await page.getByText("Nova categoria").click();
    await page.getByLabel("Nome da categoria").first().fill(CATEGORY);
    await page.getByRole("button", { name: "Criar categoria" }).click();
    await expect(
      page.getByRole("heading", { name: CATEGORY, level: 2 }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Novo produto" }).click();
    await expect(page).toHaveURL(/\/admin\/produtos\/novo$/);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Categoria").selectOption({ label: CATEGORY });
    await page.getByLabel("Nome", { exact: true }).fill(PRODUCT);
    await page.getByLabel("Preço (R$)").fill("120,00");
    await page.getByRole("button", { name: "Cadastrar produto" }).click();
    await expect(page).toHaveURL(/\/admin\/produtos$/);
    const section = page.getByRole("region", { name: CATEGORY });
    await expect(section).toBeVisible();
    const row = section.getByRole("listitem").filter({ hasText: PRODUCT });
    await expect(row).toBeVisible();
    await expect(row).toContainText("R$ 120,00");
    await expect(row.getByText("Fora da página")).toHaveCount(0);

    // Shown on the page by default.
    await page.goto("/grais");
    await page.getByRole("tab", { name: "Produtos" }).click();
    await expect(page.getByRole("tabpanel").getByText(PRODUCT)).toBeVisible();

    await page.goto("/admin/produtos");
    await page.getByRole("link", { name: PRODUCT, exact: true }).click();
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Mostrar na página").uncheck();
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page).toHaveURL(/\/admin\/produtos$/);
    await expect(productRow(PRODUCT).getByText("Fora da página")).toBeVisible();
  });

  test("a product hidden from the page is not on the public page", async () => {
    await page.goto("/grais");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The tab may be gone altogether when nothing else is shown.
    const tab = page.getByRole("tab", { name: "Produtos" });
    if ((await tab.count()) > 0) await tab.click();
    await expect(page.getByText(PRODUCT)).toHaveCount(0);
  });

  test("a quote takes the product and becomes a sale", async () => {
    await page.goto("/admin/financeiro/orcamentos/novo");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Buscar paciente").fill("Produtos");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByRole("button", { name: PATIENT }).click();
    await page.getByLabel("Tipo").selectOption("product");
    await page.getByLabel("Produto", { exact: true }).selectOption({
      label: PRODUCT,
    });
    await expect(page.getByLabel("Preço unitário")).toHaveValue("120,00");
    await page.getByLabel("Quantidade").fill("2");
    await expect(
      page.getByText("Total: R$ 240,00", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Criar orçamento" }).click();
    await expect(page).toHaveURL(
      /\/admin\/financeiro\/orcamentos\/[0-9a-f-]+$/,
    );
    await expect(page.getByText("Quantidade 2")).toBeVisible();

    await page.getByLabel("À vista").check();
    await page.getByRole("button", { name: "Aprovar e criar a venda" }).click();
    await expect(page).toHaveURL(/\/admin\/financeiro\/vendas\/[0-9a-f-]+$/);
    await expect(page.getByText("Quantidade 2")).toBeVisible();
    await expect(page.getByText(PRODUCT).first()).toBeVisible();
  });

  test("the old address redirects", async () => {
    await page.goto("/admin/pagina/produtos");
    await expect(page).toHaveURL(/\/admin\/produtos$/);
  });
});
