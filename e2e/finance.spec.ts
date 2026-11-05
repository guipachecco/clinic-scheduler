import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { DateTime } from "luxon";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "../playwright.config";

import { signInWithFreshTwoFactor } from "./helpers";
import { TEST_ADMIN_FINANCE } from "./test-account";

// One story with fictitious data: quote, approval paid per session, the
// package scheduled at once, a payment, the cash report and an expense.
test.describe.configure({ mode: "serial" });

// The first clinic, created by drizzle/0007_multi_clinic.sql.
const CLINIC_ID = "00000000-0000-4000-8000-000000000100";
const CATEGORY_ID = "00000000-0000-4000-8000-0000000000f1";
const SERVICE_ID = "00000000-0000-4000-8000-0000000000f2";
const PATIENT_ID = "00000000-0000-4000-8000-0000000000f3";
const SERVICE = "Drenagem (teste financeiro)";
const PATIENT = "Paula Financeira Fictícia";

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

// Next Monday in the clinic's zone, so the sessions are in business hours.
const nextMonday = DateTime.now()
  .setZone("America/Sao_Paulo")
  .startOf("week")
  .plus({ weeks: 1 });

test.describe("financeiro", () => {
  test.beforeAll(async ({ browser }) => {
    await sql(
      `INSERT INTO service_categories (id, clinic_id, name, slug)
       VALUES ($1, $2, 'Financeiro (teste)', 'financeiro-teste')`,
      [CATEGORY_ID, CLINIC_ID],
    );
    await sql(
      `INSERT INTO services (id, clinic_id, category_id, name, slug, duration_minutes,
         price_cents, price_display, is_active)
       VALUES ($1, $2, $3, $4, 'drenagem-teste-financeiro', 60, 15000, 'fixed', true)`,
      [SERVICE_ID, CLINIC_ID, CATEGORY_ID, SERVICE],
    );
    await sql(
      `INSERT INTO patients (id, clinic_id, name, name_normalized, phone)
       VALUES ($1, $2, $3, 'paula financeira ficticia', '+5511900000099')`,
      [PATIENT_ID, CLINIC_ID, PATIENT],
    );
    await sql(
      `INSERT INTO business_hours (clinic_id, weekday, start_time, end_time)
       SELECT $1, d, '08:00', '18:00' FROM generate_series(1, 6) AS d`,
      [CLINIC_ID],
    );
    context = await browser.newContext();
    page = await context.newPage();
    await signInWithFreshTwoFactor(page, TEST_ADMIN_FINANCE);
  });

  // Leaves the shared e2e database as the other suites expect it.
  test.afterAll(async () => {
    await context.close();
    await sql(
      `TRUNCATE sale_revisions, payments, expenses, installments, sale_sessions,
         sale_items, sales, quote_items, quotes CASCADE`,
    );
    await sql(`DELETE FROM appointments WHERE patient_id = $1`, [PATIENT_ID]);
    await sql(`DELETE FROM patients WHERE id = $1`, [PATIENT_ID]);
    await sql(`DELETE FROM services WHERE id = $1`, [SERVICE_ID]);
    await sql(`DELETE FROM service_categories WHERE id = $1`, [CATEGORY_ID]);
    await sql(`DELETE FROM business_hours WHERE clinic_id = $1`, [CLINIC_ID]);
  });

  test("the Financeiro link opens the summary", async () => {
    await page.goto("/admin");
    const nav = page.getByRole("navigation", { name: "Menu principal" });
    await nav.getByRole("link", { name: "Financeiro" }).click();
    await expect(page).toHaveURL(/\/admin\/financeiro$/);
    await expect(
      page.getByRole("heading", { name: "Financeiro", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText("Entrou hoje")).toBeVisible();
  });

  test("creates a quote with the service price filled in", async () => {
    await page.goto("/admin/financeiro/orcamentos/novo");
    await page.getByLabel("Buscar paciente").fill("Paula");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.getByRole("button", { name: PATIENT }).click();
    await page
      .getByLabel("Serviço", { exact: true })
      .selectOption({ label: `Financeiro (teste) · ${SERVICE}` });
    await expect(page.getByLabel("Preço por sessão")).toHaveValue("150,00");
    await page.getByLabel("Sessões").fill("4");
    await expect(
      page.getByText("Total: R$ 600,00", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Criar orçamento" }).click();
    await expect(page).toHaveURL(
      /\/admin\/financeiro\/orcamentos\/[0-9a-f-]+$/,
    );
    await expect(
      page.getByRole("heading", { name: /Orçamento nº \d+/ }),
    ).toBeVisible();
    await expect(page.getByText("Rascunho")).toBeVisible();
  });

  test("approving per session creates the sale with one installment per session", async () => {
    await page.getByLabel("Por sessão").check();
    await page.getByRole("button", { name: "Aprovar e criar a venda" }).click();
    await expect(page).toHaveURL(/\/admin\/financeiro\/vendas\/[0-9a-f-]+$/);
    await expect(page.getByText("sessão ainda não agendada")).toHaveCount(4);
    await expect(page.getByText(/4 contratadas · 0 agendadas/)).toBeVisible();
  });

  test("schedules two weekly sessions at once", async () => {
    await page.getByText("Agendar sessões").click();
    await page.getByLabel("Quantas sessões").fill("2");
    await page
      .getByLabel("Primeira data")
      .fill(nextMonday.toFormat("yyyy-MM-dd"));
    await page.getByLabel("Horário", { exact: true }).fill("10:00");
    await page.getByRole("button", { name: "Ver as datas" }).click();
    await expect(page.getByLabel("Data da sessão 2")).toHaveValue(
      nextMonday.plus({ weeks: 1 }).toFormat("yyyy-MM-dd"),
    );
    await page.getByRole("button", { name: "Agendar 2 sessões" }).click();
    await expect(page.getByText(/4 contratadas · 2 agendadas/)).toBeVisible();
    await expect(
      page.getByText(`vence ${nextMonday.toFormat("dd/MM/yyyy")}`),
    ).toBeVisible();
  });

  test("receives the first session and shows it in the cash report", async () => {
    await page.getByRole("button", { name: "Receber" }).first().click();
    await page.getByRole("button", { name: "Confirmar recebimento" }).click();
    await expect(page.getByText("Paga", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Pago", { exact: true }).locator(".."),
    ).toContainText("R$ 150,00");

    await page.goto("/admin/financeiro/caixa");
    await expect(page.getByText("+ R$ 150,00").first()).toBeVisible();
  });

  test("records an expense", async () => {
    await page.goto("/admin/financeiro/despesas");
    await page.getByLabel("Valor").fill("80,00");
    await page
      .getByLabel("Descrição (opcional)")
      .fill("Óleo de massagem (teste)");
    await page.getByRole("button", { name: "Lançar despesa" }).click();
    await expect(page.getByText(/Óleo de massagem \(teste\)/)).toBeVisible();
  });

  test("the patient record shows what is still owed", async () => {
    await page.goto(`/admin/pacientes/${PATIENT_ID}`);
    const section = page.getByRole("region", { name: "Financeiro" });
    await expect(section).toContainText("Falta pagar: R$ 450,00");
  });

  test("the financial pages do not scroll sideways on a phone", async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    for (const path of ["/admin/financeiro", "/admin/financeiro/caixa"]) {
      await page.goto(path);
      const width = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      expect(width, path).toBeLessThanOrEqual(360);
    }
  });
});
