import { expect, type Locator, type Page, test } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "../playwright.config";
import { LAUNCH_ENDS_AT } from "../src/app/landing/pricing";

import { clearRateLimits } from "./helpers";
import { TEST_ADMIN } from "./test-account";

// The Zemana landing page at /, on a 360 px phone.
test.use({ viewport: { width: 360, height: 800 } });

// Launch prices (and their stickers) only exist until this moment.
const launchOver = () => Date.now() >= LAUNCH_ENDS_AT.getTime();

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

test("pricing shows both plans with launch price and plan WhatsApp", async ({
  page,
}) => {
  test.skip(launchOver(), "launch over");
  await page.goto("/");
  const section = page.getByRole("region", { name: "Sem letra miúda." });
  await expect(section.getByTestId("plan-card")).toHaveCount(2);
  await expect(section.getByText("R$ 29,90", { exact: true })).toBeVisible();
  await expect(section.getByText("R$ 99,00", { exact: true })).toBeVisible();
  await expect(section.getByText("R$ 149,90", { exact: true })).toBeVisible();
  await expect(section.getByText("1º mês grátis")).toBeVisible();
  await expect(section.getByText(/garanta esse preço/i)).toBeVisible();
  const cta = section.getByRole("link", { name: "Quero o Completo" });
  await expect(cta).toHaveAttribute(
    "href",
    `https://wa.me/5547991037244?text=${encodeURIComponent("Oi! Quero o plano Completo da Zemana.")}`,
  );
  await expect(cta).toHaveAttribute("target", "_blank");
});

test("inside tabs switch the screenshot", async ({ page }) => {
  await page.goto("/");
  const section = page.getByRole("region", { name: "Olha só como fica." });
  const tabs = section.getByRole("tab");
  await expect(tabs).toHaveText([
    "Agenda",
    "Orçamento",
    "Sua página",
    "No celular",
  ]);
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await tabs.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(section.getByRole("tabpanel")).toBeVisible();
  await expect(
    section.getByRole("tabpanel").getByRole("img").first(),
  ).toHaveAttribute("alt", /.+/);
  // Wraps around at both ends, and Home and End jump.
  await page.keyboard.press("End");
  await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(tabs.last()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
});

test("inside gallery shows the first tab without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 360, height: 800 },
  });
  const page = await context.newPage();
  await page.goto("/");
  const section = page.getByRole("region", { name: "Olha só como fica." });
  await section.scrollIntoViewIfNeeded();
  const panel = section.getByRole("tabpanel");
  await expect(panel).toHaveCount(1);
  await expect(panel.getByRole("img")).toHaveCount(2);
  await context.close();
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

test("reduced motion shows the plan cards with the launch price", async ({
  browser,
}) => {
  test.skip(launchOver(), "launch over");
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 360, height: 800 },
  });
  const page = await context.newPage();
  await page.goto("/");
  const plans = page.getByTestId("plan-card");
  await expect(plans).toHaveCount(2);
  for (const card of await plans.all()) {
    await card.scrollIntoViewIfNeeded();
    await expect(card).toHaveCSS("opacity", "1");
  }
  await expect(page.getByText("R$ 29,90", { exact: true })).toBeVisible();
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
  // The story renders its still scenes in the server HTML.
  for (const text of ["Ana 14h", "Problema resolvido", "Com a Zemana"]) {
    const scene = page.getByText(text, { exact: true });
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toBeVisible();
  }
  await context.close();
});

test("plan cards show with the launch price without JavaScript", async ({
  browser,
}) => {
  test.skip(launchOver(), "launch over");
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 360, height: 800 },
  });
  const page = await context.newPage();
  await page.goto("/");
  const plans = page.getByTestId("plan-card");
  await expect(plans).toHaveCount(2);
  for (const card of await plans.all()) {
    await expect(card).toHaveCSS("opacity", "1");
  }
  await expect(page.getByText("R$ 29,90", { exact: true })).toBeVisible();
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

// The scroll story: the pencil fills a paper agenda, a giant X crosses it out,
// the "PROBLEMA RESOLVIDO" stamp springs in, then the phone with the app.

// Opacity as painted: the element's own times every ancestor's.
async function paintedOpacity(locator: Locator) {
  return locator.evaluate((el) => {
    let opacity = 1;
    for (let node: Element | null = el; node; node = node.parentElement) {
      opacity *= Number(getComputedStyle(node).opacity);
    }
    return opacity;
  });
}

// How much of the X is on the page: the least opaque and least drawn of its
// strokes (Motion writes the drawn fraction as the dash length, with the
// path's length normalised to 1).
async function bigX(page: Page) {
  return page.getByTestId("big-x").evaluate((group) => {
    const paths = [...group.querySelectorAll("path")];
    return {
      count: paths.length,
      opacity: Math.min(
        ...paths.map((path) => Number(getComputedStyle(path).opacity)),
      ),
      drawn: Math.min(
        ...paths.map((path) => {
          const dash = path.getAttribute("stroke-dasharray");
          return dash ? Number.parseFloat(dash) : 1;
        }),
      ),
    };
  });
}

test("story plays the X and the stamp once in view", async ({ page }) => {
  await page.goto("/");
  const story = page.getByTestId("scroll-story");
  // Hydrated with motion allowed: the animated version.
  await expect(story).toHaveAttribute("data-mode", "play");
  const stamp = page.getByTestId("story-stamp");
  const enough = page.getByText("Chega de rasura!", { exact: true });
  const after = page.getByText("Com a Zemana", { exact: true });

  // Before it comes into view nothing is crossed out or stamped yet.
  expect(await paintedOpacity(stamp)).toBeLessThan(0.05);
  const start = await bigX(page);
  expect(start.count).toBeGreaterThan(0);
  expect(start.drawn).toBeLessThan(0.01);
  expect(start.opacity).toBeLessThan(0.05);

  // In view, it plays on its own: the X is drawn and the stamp lands.
  await story.scrollIntoViewIfNeeded();
  await expect
    .poll(async () => (await bigX(page)).drawn, { timeout: 15_000 })
    .toBeGreaterThan(0.99);
  await expect
    .poll(() => paintedOpacity(stamp), { timeout: 5_000 })
    .toBeGreaterThan(0.9);
  await expect(page.getByText("Problema resolvido")).toBeVisible();

  // At the end: the phone with the app, the stamp stuck on it.
  await expect
    .poll(() => paintedOpacity(after), { timeout: 10_000 })
    .toBeGreaterThan(0.9);
  await expect(
    stamp.locator("xpath=ancestor-or-self::*[@aria-hidden='true']"),
  ).toHaveCount(0);
  await expect.poll(() => paintedOpacity(enough)).toBeLessThan(0.05);
  await expect.poll(() => paintedOpacity(stamp)).toBeGreaterThan(0.9);
  expect((await bigX(page)).drawn).toBeGreaterThan(0.99);
  // Layers off screen are hidden from screen readers too.
  await expect(
    enough.locator("xpath=ancestor::*[@aria-hidden='true']"),
  ).not.toHaveCount(0);
  await expect(
    after.locator("xpath=ancestor::*[@aria-hidden='true']"),
  ).toHaveCount(0);

  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(360);
});

test("reduced motion shows every scene statically", async ({ browser }) => {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 360, height: 800 },
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByTestId("scroll-story")).toHaveAttribute(
    "data-mode",
    "static",
  );
  for (const text of ["Ana 14h", "Problema resolvido", "Com a Zemana"]) {
    const scene = page.getByText(text, { exact: true });
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toBeVisible();
    expect(await paintedOpacity(scene)).toBe(1);
  }
  // The X is fully drawn.
  const x = await bigX(page);
  expect(x.count).toBeGreaterThan(0);
  expect(x.opacity).toBe(1);
  expect(x.drawn).toBe(1);
  // "Ana 14h" is fully written: its clip is at least as wide as the text.
  const ana = await page
    .getByText("Ana 14h", { exact: true })
    .evaluate((text: SVGTextElement) => {
      const id = /url\(#(.+)\)/.exec(text.getAttribute("clip-path") ?? "")![1]!;
      const rect = document
        .getElementById(id)!
        .querySelector<SVGRectElement>("rect")!;
      return {
        clip: rect.getBBox().width,
        text: text.getBBox().width,
      };
    });
  expect(ana.text).toBeGreaterThan(0);
  expect(ana.clip).toBeGreaterThanOrEqual(ana.text);
  expect(await paintedOpacity(page.getByTestId("story-stamp"))).toBe(1);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(360);
  await context.close();
});
