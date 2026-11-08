import { expect, test } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "../playwright.config";

import { clearRateLimits } from "./helpers";
import { TEST_ADMIN } from "./test-account";

// The Zemana landing page at /, on a 360 px phone.
test.use({ viewport: { width: 360, height: 800 } });

const QUOTE_URL = `https://wa.me/5547991037244?text=${encodeURIComponent(
  "Oi! Vi o site da Zemana e quero um orçamento para minha clínica.",
)}`;

// A fictitious client account, seeded straight into the e2e database.
const CLIENT = {
  name: "Cliente da Landing",
  email: "cliente@zemana-landing.example.test",
};

async function withDb<T>(run: (db: Client) => Promise<T>) {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  try {
    return await run(db);
  } finally {
    await db.end();
  }
}

async function removeClient(db: Client) {
  await db.query("DELETE FROM users WHERE email = $1", [CLIENT.email]);
}

test("landing replaces the placeholder", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Site em construção")).toHaveCount(0);
  await expect(page.locator("h1")).toBeVisible();
});

test("quote buttons open the WhatsApp with the message", async ({ page }) => {
  await page.goto("/");
  const buttons = page.getByRole("link", { name: "Quero um orçamento" });
  expect(await buttons.count()).toBeGreaterThanOrEqual(2);
  for (const button of await buttons.all()) {
    await expect(button).toHaveAttribute("href", QUOTE_URL);
    await expect(button).toHaveAttribute("target", "_blank");
    await expect(button).toHaveAttribute("rel", /noopener/);
  }
});

test("header shows Entrar signed out and Suas clínicas for a signed-in client", async ({
  page,
}) => {
  await page.goto("/");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Entrar" })).toHaveAttribute(
    "href",
    "/entrar",
  );

  await clearRateLimits();
  await withDb(async (db) => {
    await removeClient(db);
    // Same password as the e2e admin: reuse its stored hash.
    const {
      rows: [admin],
    } = await db.query<{ password: string }>(
      `SELECT a.password FROM accounts a JOIN users u ON u.id = a.user_id
       WHERE u.email = $1`,
      [TEST_ADMIN.email],
    );
    const {
      rows: [user],
    } = await db.query<{ id: string }>(
      `INSERT INTO users (name, email, email_verified, role)
       VALUES ($1, $2, true, 'client') RETURNING id`,
      [CLIENT.name, CLIENT.email],
    );
    await db.query(
      `INSERT INTO accounts (user_id, account_id, provider_id, password)
       VALUES ($1::uuid, $1::text, 'credential', $2)`,
      [user!.id, admin!.password],
    );
  });

  try {
    await page.goto("/entrar");
    await page.getByLabel("E-mail").fill(CLIENT.email);
    await page.getByLabel("Senha").fill(TEST_ADMIN.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/minhas-clinicas$/);

    await page.goto("/");
    await expect(
      header.getByRole("link", { name: "Suas clínicas" }),
    ).toHaveAttribute("href", "/minhas-clinicas");
    await expect(header.getByRole("link", { name: "Entrar" })).toHaveCount(0);
  } finally {
    await withDb(removeClient);
  }
});

test("footer links clients to /entrar", async ({ page }) => {
  await page.goto("/");
  await expect(
    page
      .getByRole("contentinfo")
      .getByRole("link", { name: "Sou cliente, quero entrar" }),
  ).toHaveAttribute("href", "/entrar");
});

test("no horizontal scroll at 360 px", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(360);
});

test("features promise only what exists", async ({ page }) => {
  await page.goto("/");
  const text = (await page.locator("body").innerText()).toLowerCase();
  for (const promise of [
    "lembrete automático",
    "pagamento online",
    "app store",
  ]) {
    expect(text).not.toContain(promise);
  }
});

test("reduced motion shows the page static and readable", async ({
  browser,
}) => {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 360, height: 800 },
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("h1")).toBeVisible();
  // Every feature card is fully visible without scrolling animations.
  const cards = page.getByTestId("feature-card");
  await expect(cards).toHaveCount(4);
  for (const card of await cards.all()) {
    await card.scrollIntoViewIfNeeded();
    await expect(card).toHaveCSS("opacity", "1");
  }
  // The ticker band becomes a short still row that fits the phone.
  const ticker = page.getByTestId("ticker-static");
  await expect(ticker).toBeVisible();
  const box = (await ticker.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  await context.close();
});

test("feature cards show without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 360, height: 800 },
  });
  const page = await context.newPage();
  await page.goto("/");
  for (const title of [
    "Agendamento pelo link",
    "Agenda e fichas",
    "Financeiro",
    "Página da clínica",
  ]) {
    const heading = page.getByRole("heading", { level: 3, name: title });
    await heading.scrollIntoViewIfNeeded();
    await expect(heading).toBeVisible();
  }
  const cards = page.getByTestId("feature-card");
  await expect(cards).toHaveCount(4);
  for (const card of await cards.all()) {
    await expect(card).toHaveCSS("opacity", "1");
  }
  await context.close();
});

test("metadata names Zemana and shares the generated image", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle(
    "Zemana — agenda online para profissionais de beleza e saúde",
  );
  const ogImage = await page
    .locator('meta[property="og:image"]')
    .first()
    .getAttribute("content");
  expect(ogImage).toContain("/opengraph-image");
  const response = await request.get(new URL(ogImage!).pathname);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
});
