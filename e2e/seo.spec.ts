import { expect, test } from "@playwright/test";

test("robots.txt lets search engines in, keeps the panel out and names the sitemap", async ({
  request,
}) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("Allow: /");
  expect(body).toContain("Disallow: /admin");
  expect(body).toContain("Sitemap: https://zemana.com.br/sitemap.xml");
});

test("the sitemap lists the Zemana page, the legal pages and active clinics", async ({
  request,
}) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("<loc>https://zemana.com.br/</loc>");
  expect(body).toContain("<loc>https://zemana.com.br/privacidade</loc>");
  expect(body).toContain("<loc>https://zemana.com.br/termos</loc>");
  expect(body).not.toContain("/admin");
});

test("the Zemana page has a canonical address and structured data", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://zemana.com.br",
  );
  const jsonLd = await page
    .locator('script[type="application/ld+json"]')
    .textContent();
  expect(JSON.parse(jsonLd!)["@graph"][0]).toMatchObject({
    "@type": "Organization",
    name: "Zemana",
  });
});

for (const [path, title] of [
  ["/privacidade", "Política de privacidade"],
  ["/termos", "Termos de uso"],
] as const) {
  test(`${path} is reachable from the footer of the Zemana page`, async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .getByRole("contentinfo")
      .getByRole("link", {
        name: title === "Termos de uso" ? title : "Privacidade",
      })
      .click();
    await expect(page).toHaveURL(path);
    await expect(
      page.getByRole("heading", { level: 1, name: title }),
    ).toBeVisible();
    await expect(page).toHaveTitle(`${title} | Zemana`);
  });
}
