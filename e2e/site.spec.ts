import { expect, test } from "@playwright/test";

test("home page loads in Portuguese with the security headers", async ({
  page,
}) => {
  const cspViolations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) {
      cspViolations.push(message.text());
    }
  });

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "Site em construção" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");

  const headers = response!.headers();
  expect(headers["content-security-policy"]).toMatch(
    /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/,
  );
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["x-powered-by"]).toBeUndefined();

  // Every script on the page carries the request's nonce.
  const nonce = /'nonce-([^']+)'/.exec(headers["content-security-policy"]!)![1];
  const scriptNonces = await page
    .locator("script")
    .evaluateAll((scripts) =>
      scripts.map((script) => (script as HTMLScriptElement).nonce),
    );
  expect(scriptNonces.length).toBeGreaterThan(0);
  expect(scriptNonces.every((value) => value === nonce)).toBe(true);
  expect(cspViolations).toEqual([]);
});

test("unknown pages show the not-found message", async ({ page }) => {
  const response = await page.goto("/pagina-que-nao-existe");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Página não encontrada" }),
  ).toBeVisible();
});

test("site icon is served", async ({ request }) => {
  const response = await request.get("/icon.png");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
});

test("headings use the Archivo heading font", async ({ page }) => {
  await page.goto("/");
  const fontFamily = await page
    .locator("h1")
    .evaluate((element) => getComputedStyle(element).fontFamily);
  expect(fontFamily).toContain("Archivo Variable");
});

test("the theme button switches to the dark theme and remembers it", async ({
  page,
}) => {
  await page.goto("/admin/entrar");
  const toggle = page.getByRole("button", { name: "Tema escuro" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await toggle.click();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  // The choice survives a reload: the server renders the class from the cookie.
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(11, 11, 16)",
  );
  await expect(
    page.getByRole("img", { name: "Grais Saúde Integrativa" }),
  ).toHaveAttribute("src", /logo-preto/);

  await page.getByRole("button", { name: "Tema escuro" }).click();
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
});
