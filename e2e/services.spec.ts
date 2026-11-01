import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { signInWithFreshTwoFactor } from "./helpers";
import { TEST_ADMIN_SERVICES } from "./test-account";

// One story with fictitious data: categories and services of the catalog.
test.describe.configure({ mode: "serial" });

const CATEGORY = "Estética (teste)";
const SERVICE = "Limpeza de pele (teste)";

let context: BrowserContext;
let page: Page;

function serviceRow(name: string) {
  return page.getByRole("listitem").filter({
    has: page.getByRole("link", { name, exact: true }),
  });
}

test.describe("servicos", () => {
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await signInWithFreshTwoFactor(page, TEST_ADMIN_SERVICES);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("the Serviços link is current and the flexible service is listed", async () => {
    await page.goto("/admin/servicos");
    const nav = page.getByRole("navigation", { name: "Menu principal" });
    await expect(nav.getByRole("link", { name: "Serviços" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page.getByRole("heading", { name: "Outros", level: 2 }),
    ).toBeVisible();
    const row = serviceRow("Avaliação / encaixe");
    await expect(row).toBeVisible();
    await expect(row.getByText("Encaixe flexível")).toBeVisible();
  });

  test("creates a category", async () => {
    await page.goto("/admin/servicos");
    await page.getByText("Nova categoria").click();
    await page.getByLabel("Nome da categoria").first().fill(CATEGORY);
    await page.getByRole("button", { name: "Criar categoria" }).click();
    await expect(
      page.getByRole("heading", { name: CATEGORY, level: 2 }),
    ).toBeVisible();
  });

  test("a fixed price needs a value", async () => {
    await page.goto("/admin/servicos/novo");
    await page.getByLabel("Categoria").selectOption({ label: CATEGORY });
    await page.getByLabel("Nome", { exact: true }).fill(SERVICE);
    await page.getByLabel("Duração (min)").fill("60");
    await page.getByLabel("Forma de exibir o preço").selectOption("fixed");
    await page.getByRole("button", { name: "Cadastrar serviço" }).click();
    await expect(
      page.getByText("Informe o preço para esta forma de exibição."),
    ).toBeVisible();
    await expect(page.getByLabel("Preço (R$)")).toBeFocused();
  });

  test("creates a service that shows duration and price", async () => {
    await page.getByLabel("Preparo antes (min)").fill("10");
    await page.getByLabel("Preço (R$)").fill("180,00");
    await page.getByRole("button", { name: "Cadastrar serviço" }).click();
    await expect(page).toHaveURL(/\/admin\/servicos$/);
    const row = serviceRow(SERVICE);
    await expect(row).toBeVisible();
    await expect(row.getByText("60 min")).toBeVisible();
    await expect(row.getByText("+10 min de preparo")).toBeVisible();
    await expect(row.getByText("R$ 180,00")).toBeVisible();
  });

  test("deactivates the service", async () => {
    await page.getByRole("link", { name: SERVICE, exact: true }).click();
    await page.getByLabel("Ativo", { exact: true }).uncheck();
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page).toHaveURL(/\/admin\/servicos$/);
    await expect(serviceRow(SERVICE).getByText("Inativo")).toBeVisible();
  });

  test("the flexible service form has no flexible control", async () => {
    await page.goto("/admin/servicos");
    await page
      .getByRole("link", { name: "Avaliação / encaixe", exact: true })
      .click();
    await expect(
      page.getByText("Serviço flexível: no agendamento"),
    ).toBeVisible();
    await expect(page.getByLabel(/flexível/i)).toHaveCount(0);
  });
});
