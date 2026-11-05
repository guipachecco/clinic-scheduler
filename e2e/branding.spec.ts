import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "../playwright.config";

import { signInWithFreshTwoFactor } from "./helpers";
import { TEST_ROOT_BRANDING } from "./test-account";

// Each clinic's panel wears its own identity; the sign-in screen is neutral.
test.describe.configure({ mode: "serial" });

const CLINICS = [
  { name: "Karina Manicure", slug: "karina-manicure" },
  { name: "Sirlei Massoterapia", slug: "sirlei-massoterapia" },
];

let context: BrowserContext;
let page: Page;

function brandToken(target: Page) {
  return target.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--brand")
      .trim(),
  );
}

function iconHref(target: Page) {
  return target.locator('link[rel="icon"]').first().getAttribute("href");
}

let karinaIcon: string | null = null;
let sirleiIcon: string | null = null;

async function openClinic(name: string) {
  await page.goto("/admin/clinicas");
  await page
    .getByRole("listitem")
    .filter({ hasText: name })
    .getByRole("button", { name: "Abrir painel" })
    .click();
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe("branding", () => {
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await signInWithFreshTwoFactor(
      page,
      TEST_ROOT_BRANDING,
      /\/admin\/clinicas$/,
    );
    for (const clinic of CLINICS) {
      await page.getByLabel("Nome da clínica").fill(clinic.name);
      await expect(page.getByLabel("Endereço da página")).toHaveValue(
        clinic.slug,
      );
      await page.getByRole("button", { name: "Criar clínica" }).click();
      await expect(page.getByText(`/${clinic.slug}`)).toBeVisible();
    }
  });

  test.afterAll(async () => {
    await context.close();
    const client = new Client({ connectionString: E2E_DATABASE_URL });
    await client.connect();
    try {
      const slugs = CLINICS.map((c) => c.slug);
      // The photo column points at media, so it goes first.
      await client.query(
        `UPDATE clinics SET owner_photo_media_id = NULL WHERE slug = ANY($1)`,
        [slugs],
      );
      await client.query(
        `DELETE FROM media WHERE clinic_id IN (SELECT id FROM clinics WHERE slug = ANY($1))`,
        [slugs],
      );
      await client.query(
        `DELETE FROM audit_logs WHERE clinic_id IN (SELECT id FROM clinics WHERE slug = ANY($1))`,
        [slugs],
      );
      for (const table of [
        "services",
        "service_categories",
        "payment_methods",
        "expense_categories",
      ]) {
        await client.query(
          `DELETE FROM ${table} WHERE clinic_id IN (SELECT id FROM clinics WHERE slug = ANY($1))`,
          [slugs],
        );
      }
      await client.query(`DELETE FROM clinics WHERE slug = ANY($1)`, [slugs]);
    } finally {
      await client.end();
    }
  });

  test("the sign-in screen is neutral", async ({ browser }) => {
    const anonymous = await browser.newContext();
    const signIn = await anonymous.newPage();
    await signIn.goto("/admin/entrar");
    await expect(
      signIn.locator('img[alt="Grais Saúde Integrativa"]'),
    ).toHaveCount(0);
    expect(await brandToken(signIn)).toBe("#3e4c63");
    await anonymous.close();
  });

  test("Karina's panel is pink with her initial", async () => {
    await openClinic("Karina Manicure");
    expect(await brandToken(page)).toBe("#b2295b");
    const sidebar = page.locator("aside");
    await expect(sidebar).toContainText("Karina");
    await expect(sidebar).toContainText("Manicure");
    const icon = await page.request.get("/admin/icone");
    expect(icon.ok()).toBe(true);
    expect(await icon.text()).toContain(">K<");
    karinaIcon = await iconHref(page);
    expect(karinaIcon).toContain("/admin/icone?v=");
  });

  test("Sirlei's panel has a different icon URL", async () => {
    await openClinic("Sirlei Massoterapia");
    sirleiIcon = await iconHref(page);
    expect(sirleiIcon).toContain("/admin/icone?v=");
    expect(sirleiIcon).not.toBe(karinaIcon);
  });

  test("an unknown sale shows the not-found page in Karina's palette", async () => {
    await openClinic("Karina Manicure");
    await page.goto(
      "/admin/financeiro/vendas/00000000-0000-4000-8000-000000000000",
    );
    await expect(page.getByText("Página não encontrada")).toBeVisible();
    expect(await brandToken(page)).toBe("#b2295b");
  });

  test("switching to Grais restores its brand", async () => {
    await page.getByRole("link", { name: "Trocar de clínica" }).click();
    await page
      .getByRole("listitem")
      .filter({ hasText: "/grais" })
      .getByRole("button", { name: "Abrir painel" })
      .click();
    await expect(page).toHaveURL(/\/admin$/);
    expect(await brandToken(page)).toBe("#00357a");
    await expect(
      page.locator('aside img[alt=""]:visible').first(),
    ).toBeVisible();
  });

  test("the owner switches Karina to Marinho e coral", async () => {
    await openClinic("Karina Manicure");
    await page.goto("/admin/aparencia");
    const card = page.getByRole("button", { name: /Marinho e coral/ });
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    expect(await brandToken(page)).toBe("#22315a");
    expect(await iconHref(page)).not.toBe(karinaIcon);
    await expect(
      page.getByRole("button", { name: /Marinho e coral/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("changes the area label", async () => {
    await page.goto("/admin/aparencia");
    await page.getByLabel("Área", { exact: true }).fill("Unhas e cuidados");
    await page.getByRole("button", { name: "Salvar nome e área" }).click();
    await expect(page.locator("aside")).toContainText("Unhas e cuidados");
  });

  test("uploads and removes the photo", async () => {
    await page.goto("/admin/aparencia");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
      "base64",
    );
    await page.getByLabel("Escolher foto").setInputFiles({
      name: "foto.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(page.locator('aside img[src^="/admin/foto/"]')).toBeVisible();
    await page.getByRole("button", { name: "Remover foto" }).click();
    await expect(page.locator('aside img[src^="/admin/foto/"]')).toHaveCount(0);
    await expect(
      page.locator("aside span[aria-hidden]").filter({ hasText: /^R$/ }),
    ).toBeVisible();
  });

  test("Grais shows Marca própria", async () => {
    await page.goto("/admin/clinicas");
    await page
      .getByRole("listitem")
      .filter({ hasText: "/grais" })
      .getByRole("button", { name: "Abrir painel" })
      .click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/admin/aparencia");
    await expect(page.getByText("Marca própria")).toBeVisible();
    await expect(page.getByLabel("Área", { exact: true })).toHaveCount(0);
  });

  test("no sideways scroll at 360 px", async () => {
    await openClinic("Karina Manicure");
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/admin");
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
