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
