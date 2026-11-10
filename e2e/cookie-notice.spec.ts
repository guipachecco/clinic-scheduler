import { expect, type Page, test } from "@playwright/test";

// The cookie notice at the bottom of the Zemana pages, on a 360 px phone.
test.use({ viewport: { width: 360, height: 800 } });

const notice = (page: Page) =>
  page.getByRole("region", { name: "Aviso de cookies" });

test("the cookie notice shows until Entendi and stays gone after reload", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(notice(page)).toBeVisible();
  await expect(
    notice(page).getByRole("link", { name: "Privacidade" }),
  ).toHaveAttribute("href", "/privacidade");
  await expect(
    notice(page).getByRole("link", { name: "Termos" }),
  ).toHaveAttribute("href", "/termos");

  await notice(page).getByRole("button", { name: "Entendi" }).click();
  await expect(notice(page)).toHaveCount(0);
  const cookie = (await context.cookies()).find(
    (c) => c.name === "aviso_cookies",
  );
  expect(cookie?.value).toBe("ok");

  await page.reload();
  await expect(notice(page)).toHaveCount(0);
  await page.goto("/privacidade");
  await expect(notice(page)).toHaveCount(0);
});

test("going back after Entendi does not bring the notice back", async ({
  page,
}) => {
  await page.goto("/");
  await expect(notice(page)).toBeVisible();
  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: "Privacidade" })
    .click();
  await expect(page).toHaveURL(/\/privacidade$/);
  await notice(page).getByRole("button", { name: "Entendi" }).click();
  await expect(notice(page)).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("h1")).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
});

test("the notice shows on the Zemana pages without horizontal scroll", async ({
  page,
}) => {
  for (const path of ["/", "/privacidade", "/entrar"]) {
    await page.goto(path);
    await expect(notice(page)).toBeVisible();
    const fits = await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    );
    expect(fits, path).toBe(true);
  }
});

test("the end of the page can scroll out from under the notice", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  for (const path of ["/", "/entrar"]) {
    await page.goto(path);
    await expect(notice(page)).toBeVisible();
    const last = page
      .getByRole("link", { name: "É profissional? Entre no painel" })
      .last();
    // Scrolled all the way down, the link is the element under its own
    // centre, not the notice.
    await expect
      .poll(
        () =>
          last.evaluate((link) => {
            window.scrollTo(0, document.documentElement.scrollHeight);
            const box = link.getBoundingClientRect();
            const top = document.elementFromPoint(
              box.left + box.width / 2,
              box.top + box.height / 2,
            );
            return Boolean(top && link.contains(top));
          }),
        { message: path },
      )
      .toBe(true);
  }
});

test("the notice does not show in the panel", async ({ page }) => {
  await page.goto("/admin/entrar");
  await expect(page.locator("h1, form").first()).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("Entendi hides the notice", async ({ page }) => {
    await page.goto("/");
    await notice(page).getByRole("button", { name: "Entendi" }).click();
    await expect(notice(page)).toHaveCount(0);
  });
});
