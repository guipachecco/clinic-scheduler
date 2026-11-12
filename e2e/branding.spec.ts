import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "../playwright.config";

import { signInWithFreshTwoFactor } from "./helpers";
import { TEST_ROOT_BRANDING } from "./test-account";

// Every screen wears the Zemana brand, whichever clinic is open.
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
        "products",
        "product_categories",
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

  test("the sign-in screen is Zemana", async ({ browser }) => {
    const anonymous = await browser.newContext();
    const signIn = await anonymous.newPage();
    await signIn.goto("/admin/entrar");
    const logo = signIn.locator('img[alt="Zemana"]:visible');
    await expect(logo).toHaveCount(1);
    // The sign-in page is a purple surface, so it uses the dark-background logo.
    expect(await logo.getAttribute("src")).toContain("fundo-escuro");
    expect(await brandToken(signIn)).toBe("#2a0081");
    await signIn.getByRole("button", { name: "Tema escuro" }).click();
    await expect(signIn.locator("html")).toHaveClass(/dark/);
    const darkLogo = signIn.locator('img[alt="Zemana"]:visible');
    await expect(darkLogo).toHaveCount(1);
    expect(await darkLogo.getAttribute("src")).toContain("fundo-escuro");
    await anonymous.close();
  });

  test("every clinic panel is Zemana", async () => {
    for (const clinic of [
      { filter: "/grais", text: "Grais" },
      { filter: "Karina Manicure", text: "Karina" },
    ]) {
      await openClinic(clinic.filter);
      expect(await brandToken(page)).toBe("#2a0081");
      const sidebar = page.locator("aside");
      await expect(sidebar).toContainText(clinic.text);
      await expect(sidebar.locator('img[alt="Zemana"]:visible')).toHaveCount(1);
      await expect(
        page.locator('img[src*="logo-marinho"], img[src*="simbolo-marinho"]'),
      ).toHaveCount(0);
    }
  });

  test("the tab icon is the Zemana symbol", async () => {
    expect(await iconHref(page)).not.toContain("/admin/icone");
    await expect(page.getByRole("link", { name: "Aparência" })).toHaveCount(0);
  });

  test("old Aparência links are not found", async () => {
    await page.goto("/admin/aparencia");
    await expect(page.getByText("Página não encontrada")).toBeVisible();
    expect(await brandToken(page)).toBe("#2a0081");
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
