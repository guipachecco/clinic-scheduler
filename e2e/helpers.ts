import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { expect, type Page } from "@playwright/test";
import { Secret, TOTP } from "otpauth";
import { Client } from "pg";

import { E2E_DATABASE_URL, E2E_EMAIL_OUTBOX_DIR } from "../playwright.config";

type Account = { email: string; name: string; password: string };

// The sign-in and 2FA endpoints are rate limited by design. The specs share one
// server, so a suite that starts right after another could hit the limits.
// This clears the counters of the throwaway e2e database only.
export async function clearRateLimits() {
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
// `landing` is where the panel opens: root without a chosen clinic goes to
// the clinic list.
export async function signInWithFreshTwoFactor(
  page: Page,
  account: Account,
  landing: RegExp = /\/admin$/,
) {
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
  await expect(page).toHaveURL(landing);
}

type OutboxEmail = {
  to: string;
  subject: string;
  text: string;
  sentAt: string;
};

// E-mails the e2e server wrote to its outbox (no RESEND_API_KEY), oldest
// first.
export async function readOutbox(): Promise<OutboxEmail[]> {
  let names: string[];
  try {
    names = await readdir(E2E_EMAIL_OUTBOX_DIR);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const messages = await Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map(
        async (name) =>
          JSON.parse(
            await readFile(path.join(E2E_EMAIL_OUTBOX_DIR, name), "utf8"),
          ) as OutboxEmail,
      ),
  );
  return messages;
}

export async function emailsTo(to: string) {
  return (await readOutbox()).filter((message) => message.to === to);
}

// Waits until `to` has received at least `count` e-mails and returns the
// link of the latest one that contains `pathPart`.
export async function waitForEmailLink(
  to: string,
  pathPart: string,
  count = 1,
): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const messages = await emailsTo(to);
        if (messages.length < count) return undefined;
        const text = messages.at(-1)!.text;
        link = text
          .match(/https?:\/\/\S+/g)
          ?.find((url) => url.includes(pathPart));
        return link;
      },
      { timeout: 15_000 },
    )
    .toBeTruthy();
  return link!;
}
