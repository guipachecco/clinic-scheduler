import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "../playwright.config";

import { signInToPanel } from "./helpers";
import { TEST_ROOT } from "./test-account";

// Root's resources screen (one switch per module and clinic) and the
// monitoring screen (latency, errors, what is being created, the database).
test.describe.configure({ mode: "serial" });

const SHOTS = process.env.E2E_SCREENSHOT_DIR;

let context: BrowserContext;
let page: Page;

async function grais(): Promise<{ name: string; modules: string[] }> {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ name: string; modules: string[] }>(
      `SELECT name, modules FROM clinics WHERE slug = 'grais'`,
    );
    return rows[0]!;
  } finally {
    await client.end();
  }
}

test.describe("administração geral", () => {
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await signInToPanel(page, TEST_ROOT, /\/admin\/clinicas$/);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("root switches a module of a clinic in place", async () => {
    await page
      .getByRole("navigation", { name: "Administração geral" })
      .getByRole("link", { name: "Recursos" })
      .click();
    await expect(page).toHaveURL(/\/admin\/recursos$/);
    await expect(
      page.getByRole("heading", { name: "Recursos", level: 1 }),
    ).toBeVisible();
    if (SHOTS)
      await page.screenshot({ path: `${SHOTS}/recursos.png`, fullPage: true });

    const { name } = await grais();
    const reviews = page
      .getByRole("switch", { name: `Avaliações em ${name}`, exact: true })
      .filter({ visible: true })
      .first();
    const before = await reviews.getAttribute("aria-checked");
    await reviews.click();
    const after = before === "true" ? "false" : "true";
    await expect(reviews).toHaveAttribute("aria-checked", after);
    await expect
      .poll(async () => (await grais()).modules.includes("reviews"))
      .toBe(after === "true");
    // And back, leaving the clinic as it was.
    await reviews.click();
    await expect(reviews).toHaveAttribute("aria-checked", before!);
    await expect
      .poll(async () => (await grais()).modules.includes("reviews"))
      .toBe(before === "true");
  });

  test("the monitoring screen shows health, errors and counts", async () => {
    await page.goto("/admin/monitoramento");
    await expect(
      page.getByRole("heading", { name: "Monitoramento", level: 1 }),
    ).toBeVisible();
    for (const name of [
      "Latência",
      "Erros",
      "O que está sendo criado",
      "Uso por clínica",
      "Banco de dados",
    ]) {
      await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
    }
    await expect(page.getByText("Banco agora")).toBeVisible();
    if (SHOTS) {
      await page.screenshot({
        path: `${SHOTS}/monitoramento.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 375, height: 812 });
      await page.reload();
      await page.screenshot({
        path: `${SHOTS}/monitoramento-375.png`,
        fullPage: true,
      });
      await page.goto("/admin/recursos");
      await page.screenshot({
        path: `${SHOTS}/recursos-375.png`,
        fullPage: true,
      });
      await page.emulateMedia({ colorScheme: "dark" });
      await page.goto("/admin/monitoramento");
      await page.screenshot({
        path: `${SHOTS}/monitoramento-375-escuro.png`,
        fullPage: true,
      });
    }
    // No horizontal scroll on a phone.
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/admin/monitoramento");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("the health check answers ok", async ({ request }) => {
    const response = await request.get("/api/saude");
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { ok: boolean; dbMs: number };
    expect(body.ok).toBe(true);
    expect(typeof body.dbMs).toBe("number");
  });
});
