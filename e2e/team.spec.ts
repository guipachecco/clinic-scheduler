import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "../playwright.config";

import { signInWithFreshTwoFactor } from "./helpers";
import { TEST_ADMIN_TEAM } from "./test-account";

// The team page: a clinic of one shows no professional anywhere in the
// agenda; a second active professional brings the selector to the
// appointment form; deactivating her takes it away again.
test.describe.configure({ mode: "serial" });

const SECOND = "Bia Equipe Teste";
// The badge of the default professional (the form's hint says it too).
const DEFAULT_BADGE = "Recebe os agendamentos online";

let context: BrowserContext;
let page: Page;

async function removeSecond() {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query("DELETE FROM professionals WHERE name = $1", [SECOND]);
  } finally {
    await client.end();
  }
}

test.describe("equipe", () => {
  test.beforeAll(async ({ browser }) => {
    await removeSecond();
    context = await browser.newContext();
    page = await context.newPage();
    await signInWithFreshTwoFactor(page, TEST_ADMIN_TEAM);
  });

  test.afterAll(async () => {
    await context.close();
    await removeSecond();
  });

  test("a team of one: no professional in the appointment form", async () => {
    await page.getByRole("link", { name: "Equipe" }).first().click();
    await expect(page).toHaveURL(/\/admin\/equipe$/);
    await expect(
      page.getByRole("heading", { name: "Equipe", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(DEFAULT_BADGE, { exact: true })).toHaveCount(1);

    await page.goto("/admin/agenda/novo");
    await expect(page.getByLabel("Serviço")).toBeVisible();
    await expect(page.getByLabel("Profissional")).toHaveCount(0);
  });

  test("a second professional brings the selector; deactivating her takes it away", async () => {
    await page.goto("/admin/equipe");
    await page.getByText("Nova profissional").click();
    await page.locator("#profissional-name").fill(SECOND);
    await page.locator("#profissional-registration").fill("CRM 0000");
    await page.locator("#profissional-sortOrder").fill("5");
    await page.getByRole("button", { name: "Adicionar à equipe" }).click();
    const card = page.getByRole("listitem").filter({ hasText: SECOND });
    await expect(card).toBeVisible();
    await expect(card.getByText("CRM 0000")).toBeVisible();
    await expect(page.getByText("2 profissionais ativas")).toBeVisible();

    await page.goto("/admin/agenda/novo");
    const select = page.getByLabel("Profissional");
    await expect(select).toBeVisible();
    await expect(select.locator("option")).toHaveCount(2);
    await expect(select.locator("option").nth(1)).toHaveText(SECOND);

    await page.goto("/admin/equipe");
    const again = page.getByRole("listitem").filter({ hasText: SECOND });
    await again.getByText("Editar").click();
    await again.getByLabel("Ativa (aparece na agenda)").uncheck();
    await again.getByRole("button", { name: "Salvar" }).click();
    await expect(again.getByText("Inativa", { exact: true })).toBeVisible();
    await expect(page.getByText("1 profissional ativa")).toBeVisible();

    await page.goto("/admin/agenda/novo");
    await expect(page.getByLabel("Serviço")).toBeVisible();
    await expect(page.getByLabel("Profissional")).toHaveCount(0);
  });

  test("the last active professional cannot be deactivated", async () => {
    await page.goto("/admin/equipe");
    const first = page
      .getByRole("listitem")
      .filter({ has: page.getByText(DEFAULT_BADGE, { exact: true }) });
    await first.getByText("Editar").click();
    await first.getByLabel("Ativa (aparece na agenda)").uncheck();
    await first.getByRole("button", { name: "Salvar" }).click();
    await expect(
      first.getByText("A equipe precisa de pelo menos uma profissional ativa."),
    ).toBeVisible();
  });
});
