import { expect, test, type Page } from "@playwright/test";
import { Secret, TOTP } from "otpauth";

import { clearRateLimits, signInToPanel } from "./helpers";
import {
  TEST_ADMIN,
  TEST_ADMIN_PASSWORD_RESET,
  TEST_ROOT_AUTH,
} from "./test-account";

// One story, in order: the clinic owner signs in with the password alone;
// root sets up the mandatory 2FA on first access, signs out, and signs in
// again with the code from the authenticator.
test.describe.configure({ mode: "serial" });

let totpSecret = "";

function currentCode() {
  return new TOTP({ secret: Secret.fromBase32(totpSecret) }).generate();
}

async function signInWithPassword(
  page: Page,
  account: { email: string; password: string } = TEST_ADMIN,
  password = account.password,
) {
  await page.goto("/admin/entrar");
  await page.getByLabel("E-mail").fill(account.email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

const greeting = (name: string) =>
  new RegExp(`^(Bom dia|Boa tarde|Boa noite), ${name.split(" ")[0]}$`);

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
  await expect(page.locator('img[alt="Zemana"]:visible')).toHaveCount(1);
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
  await signInWithPassword(page, TEST_ADMIN, "senha-errada-de-teste");
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/entrar$/);
});

test("a clinic owner signs in with the password alone", async ({ page }) => {
  await signInWithPassword(page);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole("heading", { name: greeting(TEST_ADMIN.name) }),
  ).toBeVisible();

  // No 2FA for her: the setup page sends her back to the panel, and the
  // endpoint that would turn it on does not exist for her session.
  await page.goto("/admin/configurar-2fa");
  await expect(page).toHaveURL(/\/admin$/);
  const origin = new URL(page.url()).origin;
  const enable = await page.request.post("/api/auth/two-factor/enable", {
    data: { password: TEST_ADMIN.password },
    headers: { origin },
  });
  expect(enable.status()).toBe(404);

  const nav = page.getByRole("navigation", { name: "Menu principal" });
  await expect(nav).toBeVisible();
  const home = nav.getByRole("link", { name: "Início" });
  await expect(home).toHaveAttribute("aria-current", "page");
  // Proves the bg-highlight utility is generated: highlight yellow #F5C700.
  await expect(home).toHaveCSS("background-color", "rgb(245, 199, 0)");

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

  // The panel shell must not scroll sideways on a phone.
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/admin");
  await expect(
    page.getByRole("navigation", { name: "Navegação do painel" }),
  ).toBeVisible();
  const scrollWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(scrollWidth).toBeLessThanOrEqual(360);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/admin\/entrar$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/entrar$/);
});

test("root's first access requires setting up 2FA before the panel opens", async ({
  page,
}) => {
  await signInWithPassword(page, TEST_ROOT_AUTH);
  await expect(page).toHaveURL(/\/admin\/configurar-2fa$/);

  // The panel stays closed until 2FA is active.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/configurar-2fa$/);

  await page.getByLabel("Confirme sua senha").fill(TEST_ROOT_AUTH.password);
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
  await expect(page.locator("main li")).toHaveCount(10);
  totpSecret = (await page.locator("#totp-secret").textContent()) ?? "";
  expect(totpSecret).toMatch(/^[A-Z2-7]+=*$/);

  await page.getByLabel("Código de 6 números").fill(currentCode());
  await page.getByRole("button", { name: "Ativar e entrar no painel" }).click();

  // Root without a chosen clinic lands on the clinic list.
  await expect(page).toHaveURL(/\/admin\/clinicas$/);

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/admin\/entrar$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/entrar$/);
});

test("root's later sign-ins ask for the authenticator code", async ({
  page,
}) => {
  await signInWithPassword(page, TEST_ROOT_AUTH);
  await expect(page).toHaveURL(/\/admin\/entrar\/codigo$/);

  // The password alone does not open the panel.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/entrar$/);
  await signInWithPassword(page, TEST_ROOT_AUTH);
  await expect(page).toHaveURL(/\/admin\/entrar\/codigo$/);

  const wrongCode = currentCode() === "000000" ? "111111" : "000000";
  await page.getByLabel("Código do aplicativo").fill(wrongCode);
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page.getByText(/Código incorreto/)).toBeVisible();

  await page.getByLabel("Código do aplicativo").fill(currentCode());
  await page.getByRole("button", { name: "Verificar" }).click();
  await expect(page).toHaveURL(/\/admin\/clinicas$/);
});

test("both sign-in forms show and hide the password with the eye", async ({
  page,
}) => {
  for (const path of ["/admin/entrar", "/entrar"]) {
    await page.goto(path);
    const password = page.getByLabel("Senha", { exact: true });
    const eye = page.getByRole("button", { name: "Mostrar senha" });
    await password.fill("segredo-de-teste");
    await expect(password).toHaveAttribute("type", "password");
    await expect(eye).toHaveAttribute("aria-pressed", "false");

    await eye.click();
    await expect(password).toHaveAttribute("type", "text");
    const hide = page.getByRole("button", { name: "Ocultar senha" });
    await expect(hide).toHaveAttribute("aria-pressed", "true");

    await hide.click();
    await expect(password).toHaveAttribute("type", "password");
    await expect(password).toHaveValue("segredo-de-teste");
  }
});

test("root sets a clinic owner's password and she signs in with it", async ({
  page,
}) => {
  // The sign-ins above used up this minute's limit: the helper clears it.
  await signInToPanel(page, TEST_ROOT_AUTH, /\/admin\/clinicas$/);

  await page.getByRole("link", { name: "Mudar senha" }).click();
  await expect(page).toHaveURL(/\/admin\/senhas$/);
  // Grais (drizzle/0007_multi_clinic.sql), by id: other suites rename it.
  await page
    .getByLabel("Clínica", { exact: true })
    .selectOption("00000000-0000-4000-8000-000000000100");
  await page.getByLabel("Tipo de conta").selectOption("owner");
  await page.getByRole("button", { name: "Ver contas" }).click();
  await expect(page).toHaveURL(/tipo=owner/);

  await page.getByLabel("Conta", { exact: true }).selectOption({
    label: `${TEST_ADMIN_PASSWORD_RESET.name} · ${TEST_ADMIN_PASSWORD_RESET.email}`,
  });
  // A short one is refused by the server's policy.
  const field = page.getByLabel("Nova senha", { exact: true });
  await field.fill("curta");
  await page.getByRole("button", { name: "Salvar senha" }).click();
  await expect(page.getByText(/pelo menos 12/)).toBeVisible();

  await page.getByRole("button", { name: "Gerar senha" }).click();
  const generated = await field.inputValue();
  expect(generated).toHaveLength(20);
  await page.getByRole("button", { name: "Salvar senha" }).click();
  await expect(page.getByRole("status")).toContainText(
    `Senha de ${TEST_ADMIN_PASSWORD_RESET.email} trocada`,
  );

  await page.getByRole("button", { name: "Sair" }).click();
  await clearRateLimits();
  await signInWithPassword(page, TEST_ADMIN_PASSWORD_RESET);
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
  await signInWithPassword(page, TEST_ADMIN_PASSWORD_RESET, generated);
  await expect(page).toHaveURL(/\/admin$/);
});
