import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "../playwright.config";

import { signInToPanel } from "./helpers";
import { TEST_ADMIN_STOCK } from "./test-account";

// One story with fictitious data: a product gets stock, is used in an
// appointment linked to a sale, then the rest is handed over from the sale.
// The patient and the appointment come from the database; the product, the
// quote and the sale are made through the screens.
test.describe.configure({ mode: "serial" });

// The first clinic, created by drizzle/0007_multi_clinic.sql.
const CLINIC_ID = "00000000-0000-4000-8000-000000000100";
const PATIENT_ID = "00000000-0000-4000-8000-0000000000e2";
const APPOINTMENT_ID = "00000000-0000-4000-8000-0000000000e3";
const SERVICE_CATEGORY_ID = "00000000-0000-4000-8000-0000000000e4";
const SERVICE_ID = "00000000-0000-4000-8000-0000000000e5";
const CATEGORY = "Estoque Fictício E2E";
const PRODUCT = "Mounjaro Fictício E2E";
const PATIENT = "Paciente Estoque Fictícia";

let context: BrowserContext;
let page: Page;
let productUrl = "";
let salePath = "";

async function sql(text: string, values: unknown[] = []) {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query(text, values);
  } finally {
    await client.end();
  }
}

// The number in the "Estoque" block of the product page.
function stockQuantity() {
  return page.getByRole("region", { name: "Estoque" }).locator("p").first();
}

test.describe("estoque", () => {
  test.beforeAll(async ({ browser }) => {
    await sql(
      `INSERT INTO patients (id, clinic_id, name, name_normalized, phone)
       VALUES ($1, $2, $3, 'paciente estoque ficticia', '+5511900000077')`,
      [PATIENT_ID, CLINIC_ID, PATIENT],
    );
    await sql(
      `INSERT INTO service_categories (id, clinic_id, name, slug)
       VALUES ($1, $2, 'Estoque (teste)', 'estoque-teste')`,
      [SERVICE_CATEGORY_ID, CLINIC_ID],
    );
    await sql(
      `INSERT INTO services (id, clinic_id, category_id, name, slug, duration_minutes,
         price_cents, price_display, is_active)
       VALUES ($1, $2, $3, 'Consulta E2E', 'consulta-teste-estoque', 60, 15000, 'fixed', true)`,
      [SERVICE_ID, CLINIC_ID, SERVICE_CATEGORY_ID],
    );
    context = await browser.newContext();
    page = await context.newPage();
    await signInToPanel(page, TEST_ADMIN_STOCK);
  });

  // Only the rows this suite created, from the leaves up.
  test.afterAll(async () => {
    await context.close();
    const ownSales = `SELECT id FROM sales WHERE patient_id = $1`;
    const ownQuotes = `SELECT id FROM quotes WHERE patient_id = $1`;
    await sql(
      `DELETE FROM stock_movements WHERE product_id IN
         (SELECT id FROM products WHERE clinic_id = $1 AND name = $2)`,
      [CLINIC_ID, PRODUCT],
    );
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
    await sql(`DELETE FROM appointments WHERE id = $1`, [APPOINTMENT_ID]);
    await sql(`DELETE FROM patients WHERE id = $1`, [PATIENT_ID]);
    await sql(`DELETE FROM services WHERE id = $1`, [SERVICE_ID]);
    await sql(`DELETE FROM service_categories WHERE id = $1`, [
      SERVICE_CATEGORY_ID,
    ]);
    await sql(`DELETE FROM products WHERE clinic_id = $1 AND name = $2`, [
      CLINIC_ID,
      PRODUCT,
    ]);
    await sql(
      `DELETE FROM product_categories WHERE clinic_id = $1 AND name = $2`,
      [CLINIC_ID, CATEGORY],
    );
  });

  test("launches an entry and sees the stock", async () => {
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
    await page.getByLabel("Preço (R$)").fill("300,00");
    await page.getByRole("button", { name: "Cadastrar produto" }).click();
    await expect(page).toHaveURL(/\/admin\/produtos$/);

    await page.getByRole("link", { name: PRODUCT, exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/produtos\/[0-9a-f-]+$/);
    productUrl = new URL(page.url()).pathname;
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Quantidade").fill("2");
    await page.getByRole("button", { name: "Lançar entrada" }).click();
    await expect(stockQuantity()).toHaveText("2");

    await page.goto("/admin/produtos");
    await expect(
      page.getByRole("listitem").filter({ hasText: PRODUCT }),
    ).toContainText("Estoque: 2");
  });

  test("records usage in an appointment linked to a sale", async () => {
    // The sale: a quote with the product (quantity 2), approved.
    await page.goto("/admin/financeiro/orcamentos/novo");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Buscar paciente").fill("Estoque");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByRole("button", { name: PATIENT }).click();
    await page.getByLabel("Tipo").selectOption("product");
    await page.getByLabel("Produto", { exact: true }).selectOption({
      label: PRODUCT,
    });
    await page.getByLabel("Quantidade").fill("2");
    await page.getByRole("button", { name: "Criar orçamento" }).click();
    await expect(page).toHaveURL(
      /\/admin\/financeiro\/orcamentos\/[0-9a-f-]+$/,
    );
    await page.waitForLoadState("networkidle");
    await page.getByLabel("À vista").check();
    await page.getByRole("button", { name: "Aprovar e criar a venda" }).click();
    await expect(page).toHaveURL(/\/admin\/financeiro\/vendas\/[0-9a-f-]+$/);
    salePath = new URL(page.url()).pathname;
    await expect(page.locator("#produtos-da-venda")).toContainText(
      "0 de 2 com baixa",
    );

    // A confirmed appointment of the same patient, far in the future.
    await sql(
      `INSERT INTO appointments (id, clinic_id, patient_id, service_id, service_name,
         service_duration_minutes, starts_at, ends_at, occupied_from, occupied_until,
         status, source)
       VALUES ($1, $2, $3, $4, 'Consulta E2E', 60,
         '2031-03-10T17:00:00Z', '2031-03-10T18:00:00Z',
         '2031-03-10T17:00:00Z', '2031-03-10T18:00:00Z', 'confirmed', 'admin')`,
      [APPOINTMENT_ID, CLINIC_ID, PATIENT_ID, SERVICE_ID],
    );
    await page.goto(`/admin/agenda/${APPOINTMENT_ID}`);
    await page.waitForLoadState("networkidle");
    const usage = page.getByRole("region", { name: "Produtos usados" });
    await usage.getByLabel("Produto").selectOption({ label: PRODUCT });
    await usage.getByLabel("Quantidade").fill("1");
    await expect(
      usage.getByRole("option", { name: /Conta na venda nº \d+ \(faltam 2\)/ }),
    ).toHaveCount(1);
    await expect(usage.getByLabel("Venda")).toHaveValue(/.+/);
    await usage.getByRole("button", { name: "Registrar" }).click();
    await expect(usage.getByText(`${PRODUCT} · 1`)).toBeVisible();

    await page.goto(productUrl);
    await expect(stockQuantity()).toHaveText("1");
    await page.goto(salePath);
    await expect(page.locator("#produtos-da-venda")).toContainText(
      "1 de 2 com baixa",
    );
  });

  test("refuses usage above stock", async () => {
    await page.goto(`/admin/agenda/${APPOINTMENT_ID}`);
    await page.waitForLoadState("networkidle");
    const usage = page.getByRole("region", { name: "Produtos usados" });
    await usage.getByLabel("Produto").selectOption({ label: PRODUCT });
    await usage.getByLabel("Quantidade").fill("5");
    // Counting on the sale (1 left) would fail on the sale first.
    await usage.getByLabel("Venda").selectOption({ label: "Sem venda" });
    await usage.getByRole("button", { name: "Registrar" }).click();
    await expect(
      usage.getByText(
        "Estoque insuficiente: há 1. Lance uma entrada primeiro.",
      ),
    ).toBeVisible();
  });

  test("hands over everything left on the sale", async () => {
    await page.goto(salePath);
    await page.waitForLoadState("networkidle");
    const block = page.locator("#produtos-da-venda");
    await block.getByRole("button", { name: "Dar baixa em tudo" }).click();
    await expect(block).toContainText("2 de 2 com baixa");

    await page.goto(productUrl);
    await expect(stockQuantity()).toHaveText("0");
  });

  test("undoes a usage", async () => {
    await page.goto(`/admin/agenda/${APPOINTMENT_ID}`);
    await page.waitForLoadState("networkidle");
    const usage = page.getByRole("region", { name: "Produtos usados" });
    await usage.getByRole("button", { name: "Desfazer" }).click();
    await expect(usage.getByText("Desfeita")).toBeVisible();

    await page.goto(productUrl);
    await expect(stockQuantity()).toHaveText("1");
    await expect(page.getByText("Baixa desfeita").first()).toBeVisible();
  });
});
