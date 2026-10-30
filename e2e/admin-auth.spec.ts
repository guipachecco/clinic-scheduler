import { expect, test, type Page } from "@playwright/test";
import { Secret, TOTP } from "otpauth";

import { TEST_ADMIN } from "./test-account";

// One story, in order: first access with mandatory 2FA setup, sign out, and
// sign in again with the code from the authenticator.
test.describe.configure({ mode: "serial" });

let totpSecret = "";

function currentCode() {
  return new TOTP({ secret: Secret.fromBase32(totpSecret) }).generate();
}

async function signInWithPassword(page: Page, password = TEST_ADMIN.password) {
  await page.goto("/admin/entrar");
  await page.getByLabel("E-mail").fill(TEST_ADMIN.email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("the panel requires a session", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/entrar$/);
  await expect(
    page.getByRole("heading", { name: "Entrar no painel" }),
  ).toBeVisible();

  const response = await page.goto("/admin");
  expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
});

test("the access screen shows the brand and loads fonts from the app itself", async ({
  page,
}) => {
  const messages: string[] = [];
  page.on("console", (message) => messages.push(message.text()));
  const fontUrls: string[] = [];
  page.on("response", (response) => {
    if (/\.woff2/.test(response.url())) fontUrls.push(response.url());
  });

  await page.goto("/admin/entrar");
  await expect(
    page.getByRole("img", { name: "Grais Saúde Integrativa" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  expect(messages.filter((m) => m.includes("Content Security Policy"))).toEqual(
    [],
  );
  const origin = new URL(page.url()).origin;
  expect(fontUrls.length).toBeGreaterThan(0);
  expect(fontUrls.some((url) => url.startsWith(origin))).toBe(true);
});

test("public sign-up is disabled", async ({ request }) => {
  const response = await request.post("/api/auth/sign-up/email", {
    data: { email: "novo@example.test", password: "x".repeat(16), name: "X" },
  });
  expect(response.status()).toBe(404);
});

test("a wrong password shows an error", async ({ page }) => {
  await signInWithPassword(page, "senha-errada-de-teste");
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/entrar$/);
});

test("first access requires setting up 2FA before the panel opens", async ({
  page,
}) => {
  await signInWithPassword(page);
  await expect(page).toHaveURL(/\/admin\/configurar-2fa$/);

  // The panel stays closed until 2FA is active.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/configurar-2fa$/);

  await page.getByLabel("Confirme sua senha").fill(TEST_ADMIN.password);
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
  await expect(page.locator("main li")).toHaveCount(10);
  totpSecret = (await page.locator("#totp-secret").textContent()) ?? "";
  expect(totpSecret).toMatch(/^[A-Z2-7]+=*$/);

  await page.getByLabel("Código de 6 números").fill(currentCode());
  await page.getByRole("button", { name: "Ativar e entrar no painel" }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole("heading", { name: `Olá, ${TEST_ADMIN.name}` }),
  ).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Menu principal" });
  await expect(nav).toBeVisible();
  const home = nav.getByRole("link", { name: "Início" });
  await expect(home).toHaveAttribute("aria-current", "page");
  // Proves the bg-highlight utility is generated: highlight yellow #FFDE59.
  await expect(home).toHaveCSS("background-color", "rgb(255, 222, 89)");

  // Tab order must follow reading order: "Início" comes before "Sair".
  const homeBeforeSignOut = await page.evaluate(() => {
    const link = [...document.querySelectorAll("nav a")].find(
      (a) => a.textContent?.trim() === "Início",
    );
    const button = [...document.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Sair",
    );
    if (!link || !button) return false;
    return Boolean(
      link.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  expect(homeBeforeSignOut).toBe(true);

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/admin\/entrar$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/entrar$/);
});

test("later sign-ins ask for the authenticator code", async ({ page }) => {
  await signInWithPassword(page);
  await expect(page).toHaveURL(/\/admin\/entrar\/codigo$/);

  // The password alone does not open the panel.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/entrar$/);
  await signInWithPassword(page);
  await expect(page).toHaveURL(/\/admin\/entrar\/codigo$/);

  const wrongCode = currentCode() === "000000" ? "111111" : "000000";
  await page.getByLabel("Código do aplicativo").fill(wrongCode);
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page.getByText(/Código incorreto/)).toBeVisible();

  await page.getByLabel("Código do aplicativo").fill(currentCode());
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole("heading", { name: `Olá, ${TEST_ADMIN.name}` }),
  ).toBeVisible();

  // The panel shell must not scroll sideways on a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  await expect(
    page.getByRole("navigation", { name: "Menu principal" }),
  ).toBeVisible();
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(390);
});
