import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { signInWithFreshTwoFactor } from "./helpers";
import { TEST_ADMIN_SCHEDULE } from "./test-account";

// One story with fictitious data: weekly hours, a block and the holidays.
test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;

// A date 30 days ahead, as yyyy-mm-dd and dd/mm/yyyy.
const ahead = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const pad = (n: number) => String(n).padStart(2, "0");
const ISO_DATE = `${ahead.getFullYear()}-${pad(ahead.getMonth() + 1)}-${pad(ahead.getDate())}`;
const BR_DATE = `${pad(ahead.getDate())}/${pad(ahead.getMonth() + 1)}/${ahead.getFullYear()}`;

const MONDAY = "Segunda-feira";

test.describe("expediente", () => {
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await signInWithFreshTwoFactor(page, TEST_ADMIN_SCHEDULE);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("the Expediente link is current and every day starts closed", async () => {
    await page.goto("/admin/expediente");
    const nav = page.getByRole("navigation", { name: "Menu principal" });
    await expect(nav.getByRole("link", { name: "Expediente" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByText("Fechado", { exact: true })).toHaveCount(7);
  });

  test("saves Monday with two intervals and keeps them after a reload", async () => {
    await page.goto("/admin/expediente");
    await page
      .getByRole("button", { name: `Adicionar intervalo: ${MONDAY}` })
      .click();
    await page.getByLabel(`${MONDAY}, intervalo 1, início`).fill("08:00");
    await page.getByLabel(`${MONDAY}, intervalo 1, fim`).fill("12:00");
    await page
      .getByRole("button", { name: `Adicionar intervalo: ${MONDAY}` })
      .click();
    await page.getByLabel(`${MONDAY}, intervalo 2, início`).fill("13:30");
    await page.getByLabel(`${MONDAY}, intervalo 2, fim`).fill("18:00");
    await page.getByRole("button", { name: "Salvar expediente" }).click();
    await expect(page.getByRole("status")).toHaveText("Expediente salvo.");

    await page.reload();
    await expect(page.getByLabel(`${MONDAY}, intervalo 1, início`)).toHaveValue(
      "08:00",
    );
    await expect(page.getByLabel(`${MONDAY}, intervalo 2, fim`)).toHaveValue(
      "18:00",
    );
    await expect(page.getByText("Fechado", { exact: true })).toHaveCount(6);
  });

  test("overlapping intervals show a field error", async () => {
    await page.getByLabel(`${MONDAY}, intervalo 2, início`).fill("11:00");
    await page.getByRole("button", { name: "Salvar expediente" }).click();
    await expect(
      page.getByText("Os intervalos do mesmo dia não podem se sobrepor."),
    ).toBeVisible();
    await expect(
      page.getByLabel(`${MONDAY}, intervalo 2, início`),
    ).toBeFocused();
    await expect(page.getByText("Expediente salvo.")).not.toBeVisible();
  });

  test("creates an all-day block and lists it", async () => {
    await page.goto("/admin/expediente");
    await page.getByRole("link", { name: "Bloqueios e feriados" }).click();
    await expect(page).toHaveURL(/\/admin\/expediente\/bloqueios$/);
    await page.getByLabel("Tipo").selectOption("day_off");
    await page.getByLabel("Data inicial").fill(ISO_DATE);
    await page.getByLabel("Título").fill("Folga (teste)");
    await page.getByRole("button", { name: "Criar bloqueio" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Bloqueio criado." }),
    ).toBeVisible();
    const item = page
      .getByRole("listitem")
      .filter({ hasText: "Folga (teste)" });
    await expect(item).toContainText(BR_DATE);
    await expect(item).toContainText("Dia inteiro");
  });

  test("deletes the block after confirming", async () => {
    const item = page
      .getByRole("listitem")
      .filter({ hasText: "Folga (teste)" });
    await item.getByRole("button", { name: "Excluir" }).click();
    await item.getByRole("button", { name: "Cancelar" }).click();
    await expect(item).toBeVisible();
    await item.getByRole("button", { name: "Excluir" }).click();
    await item.getByRole("button", { name: "Confirmar exclusão" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Bloqueio excluído." }),
    ).toBeVisible();
    await expect(page.getByText("Folga (teste)")).toHaveCount(0);
  });

  test("adds the national holidays once", async () => {
    // The last option is the next year.
    const year = page.getByLabel("Ano", { exact: true });
    await year.selectOption({
      index: (await year.locator("option").count()) - 1,
    });
    await page
      .getByRole("button", { name: "Adicionar feriados nacionais" })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "10 feriados adicionados." }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Adicionar feriados nacionais" })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Nenhum feriado novo." }),
    ).toBeVisible();
  });
});
