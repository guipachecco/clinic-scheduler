import { expect, type Page } from "@playwright/test";
import { Secret, TOTP } from "otpauth";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "../playwright.config";

type Account = { email: string; name: string; password: string };

// The sign-in and 2FA endpoints are rate limited by design. The specs share one
// server, so a suite that starts right after another could hit the limits.
// This clears the counters of the throwaway e2e database only.
async function clearRateLimits() {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query("DELETE FROM rate_limits");
  } finally {
    await client.end();
  }
}

// Signs in with a fresh account, sets up its 2FA and lands in the panel.
// Used by suites that need a logged-in admin without relying on other specs.
export async function signInWithFreshTwoFactor(page: Page, account: Account) {
  await clearRateLimits();
  await page.goto("/admin/entrar");
  await page.getByLabel("E-mail").fill(account.email);
  await page.getByLabel("Senha").fill(account.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin\/configurar-2fa$/);

  await page.getByLabel("Confirme sua senha").fill(account.password);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("img", { name: /QR code/ })).toBeVisible();
  const secret = (await page.locator("#totp-secret").textContent()) ?? "";

  const code = new TOTP({ secret: Secret.fromBase32(secret) }).generate();
  await page.getByLabel("Código de 6 números").fill(code);
  await page.getByRole("button", { name: "Ativar e entrar no painel" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
