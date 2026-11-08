import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { signInWithFreshTwoFactor } from "./helpers";
import { TEST_ADMIN_PANEL_MOBILE } from "./test-account";

// The panel shell: bottom bar and "Mais" sheet on the phone, sidebar on the
// computer.
test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;

test.describe("painel no celular", () => {
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await signInWithFreshTwoFactor(page, TEST_ADMIN_PANEL_MOBILE);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("phone shows the bottom bar with four items and no horizontal scroll", async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/admin");
    const bar = page.getByRole("navigation", { name: "Navegação do painel" });
    await expect(bar).toBeVisible();
    for (const name of ["Início", "Agenda", "Pacientes"]) {
      const link = bar.getByRole("link", { name });
      await expect(link).toBeVisible();
      await expect(link.locator("svg")).toHaveCount(1);
    }
    const more = bar.getByRole("button", { name: "Mais" });
    await expect(more).toBeVisible();
    await expect(more.locator("svg")).toHaveCount(1);
    // The old horizontal top menu is gone on the phone.
    await expect(
      page.getByRole("navigation", { name: "Menu principal" }),
    ).toBeHidden();
    const width = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(width).toBeLessThanOrEqual(360);
  });

  test("Mais opens a sheet that reaches every other section", async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/admin");
    const bar = page.getByRole("navigation", { name: "Navegação do painel" });
    await bar.getByRole("button", { name: "Mais" }).click();
    const dialog = page.getByRole("dialog", { name: "Mais" });
    await expect(dialog).toBeVisible();
    for (const name of [
      "Serviços",
      "Expediente",
      "Financeiro",
      "Minha página",
    ]) {
      await expect(dialog.getByRole("link", { name })).toBeVisible();
    }
    await expect(dialog.getByRole("button", { name: "Sair" })).toBeVisible();
    await dialog.getByRole("link", { name: "Minha página" }).click();
    await expect(page).toHaveURL(/\/admin\/pagina$/);
    await expect(dialog).toBeHidden();

    await bar.getByRole("button", { name: "Mais" }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("Mais stays closed when coming back to the page it was opened on", async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/admin");
    const bar = page.getByRole("navigation", { name: "Navegação do painel" });
    await bar.getByRole("button", { name: "Mais" }).click();
    const dialog = page.getByRole("dialog", { name: "Mais" });
    await dialog.getByRole("link", { name: "Minha página" }).click();
    await expect(page).toHaveURL(/\/admin\/pagina$/);
    await bar.getByRole("link", { name: "Início" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(dialog).toBeHidden();
  });

  test("computer keeps the sidebar", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/admin");
    const nav = page.getByRole("navigation", { name: "Menu principal" });
    await expect(nav).toBeVisible();
    for (const name of [
      "Início",
      "Agenda",
      "Pacientes",
      "Serviços",
      "Expediente",
      "Financeiro",
      "Minha página",
    ]) {
      await expect(nav.getByRole("link", { name })).toBeVisible();
    }
    await expect(
      page.getByRole("navigation", { name: "Navegação do painel" }),
    ).toBeHidden();
  });
});
