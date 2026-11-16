import { expect, test } from "@playwright/test";
import sharp from "sharp";

import { signInToPanel } from "./helpers";
import { TEST_ADMIN_SCHEDULE } from "./test-account";

// "Meu perfil": the owner sets her photo straight from the panel, without the
// page builder. The image is generated here, no binaries in the repo.
test("owner sets and removes her profile photo", async ({ page }) => {
  await signInToPanel(page, TEST_ADMIN_SCHEDULE);

  const profileLink = page
    .getByRole("complementary")
    .getByRole("link", { name: /Meu perfil/ });
  await profileLink.click();
  await expect(page).toHaveURL(/\/admin\/perfil$/);
  await expect(page.getByRole("heading", { name: "Meu perfil" })).toBeVisible();
  await expect(page.getByText(TEST_ADMIN_SCHEDULE.email)).toBeVisible();

  await page.getByLabel("Escolher foto").setInputFiles({
    name: "rosto.jpg",
    mimeType: "image/jpeg",
    buffer: await sharp({
      create: { width: 600, height: 600, channels: 3, background: "#884466" },
    })
      .jpeg({ quality: 80 })
      .toBuffer(),
  });
  await expect(page.getByText("Foto atualizada.")).toBeVisible();
  const photo = page.getByRole("img", { name: "Sua foto de perfil" });
  await expect(photo).toBeVisible();
  // The file really loads, and the sidebar shows the same photo.
  await expect
    .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(profileLink.locator("img")).toHaveAttribute(
    "src",
    (await photo.getAttribute("src"))!,
  );
  await expect(page.getByRole("button", { name: "Trocar foto" })).toBeVisible();

  await page.getByRole("button", { name: "Remover" }).click();
  await expect(page.getByText("Foto removida.")).toBeVisible();
  await expect(photo).toHaveCount(0);
  await expect(profileLink.locator("img")).toHaveCount(0);
  // The hidden file field shares the name, so the visible button is picked
  // by its text.
  await expect(
    page.locator("button", { hasText: "Escolher foto" }),
  ).toBeVisible();
});
