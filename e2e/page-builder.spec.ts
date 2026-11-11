import { expect, test } from "@playwright/test";
import sharp from "sharp";

import { signInWithFreshTwoFactor } from "./helpers";
import {
  PAGE_BUILDER_CLINIC_SLUG,
  TEST_ADMIN_PAGE_BUILDER,
} from "./test-account";

// The owner builds her page step by step in the panel ("Monte a cara da sua
// página") and publishes it. Images are generated here, no binaries in the
// repo.
test.describe.configure({ mode: "serial" });

const HEADLINE = "Corte na régua desde 2010";

async function solidImage(
  format: "png" | "jpeg",
  width: number,
  height: number,
  color: string,
) {
  const base = sharp({
    create: { width, height, channels: 3, background: color },
  });
  return format === "png"
    ? base.png().toBuffer()
    : base.jpeg({ quality: 80 }).toBuffer();
}

test("owner builds and publishes her page", async ({ page, context }) => {
  await signInWithFreshTwoFactor(page, TEST_ADMIN_PAGE_BUILDER);
  const slug = PAGE_BUILDER_CLINIC_SLUG;

  await page.goto("/admin/pagina");
  await page.getByRole("link", { name: "Começar" }).click();
  await expect(page).toHaveURL(/\/admin\/pagina\/montar/);

  // Tipo.
  await page.getByRole("radio", { name: /Barbearia/ }).check();
  await page.getByRole("button", { name: "Próximo" }).click();

  // Logo.
  await expect(page.getByText(/Logo/).first()).toBeVisible();
  await page.getByLabel("Escolher logo").setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: await solidImage("png", 240, 120, "#222222"),
  });
  await expect(
    page.getByRole("img", { name: "Imagem escolhida" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Próximo" }).click();

  // Perfil: skipped.
  await expect(page.getByLabel("Escolher foto")).toBeAttached();
  await page.getByRole("button", { name: "Próximo" }).click();

  // Capa.
  await page.getByLabel("Escolher foto de capa").setInputFiles({
    name: "capa.jpg",
    mimeType: "image/jpeg",
    buffer: await solidImage("jpeg", 1200, 600, "#556677"),
  });
  await expect(
    page.getByRole("img", { name: "Imagem escolhida" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Próximo" }).click();

  // Cor.
  await page.getByLabel("Código da cor").fill("#0a7d5a");
  await expect(page.getByTestId("preview-booking-button")).toHaveCSS(
    "background-color",
    "rgb(10, 125, 90)",
  );
  await page.getByRole("button", { name: "Próximo" }).click();

  // Botões and Fonte: keep the suggestions.
  await page.getByRole("button", { name: "Próximo" }).click();
  await page.getByRole("button", { name: "Próximo" }).click();

  // Texto.
  await page.getByLabel("Frase de apresentação").fill(HEADLINE);
  await page.getByRole("button", { name: "Próximo" }).click();

  // Nothing is public before publishing.
  const publicPage = await context.newPage();
  await publicPage.goto(`/${slug}`);
  await expect(publicPage.getByText(HEADLINE)).toHaveCount(0);
  await expect(publicPage.locator('img[src*="/capa"]')).toHaveCount(0);

  // Galeria, then Publicar.
  await page.getByRole("button", { name: "Próximo" }).click();
  await expect(page).toHaveURL(/passo=publicar/);
  await page.getByRole("button", { name: "Publicar", exact: true }).click();
  await expect(page.getByText("Página publicada.")).toBeVisible();

  // The public page now shows everything.
  await publicPage.reload();
  // The headline lives in the "Sobre" tab.
  await publicPage.getByRole("tab", { name: "Sobre" }).click();
  await expect(publicPage.getByText(HEADLINE)).toBeVisible();
  const logo = publicPage.locator('header img[src*="/logo"]');
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute("src", /\/logo\?v=[0-9a-f]{8}$/);
  await expect(publicPage.locator('img[src*="/capa"]').first()).toBeVisible();
  await expect(
    publicPage.getByRole("link", { name: "Marcar horário" }),
  ).toHaveCSS("background-color", "rgb(10, 125, 90)");

  // The barbershop vocabulary reaches the panel menu.
  await page.goto("/admin");
  await expect(
    page.getByRole("link", { name: "Clientes" }).first(),
  ).toBeVisible();

  // Leaving the wizard saves what the step has not saved yet.
  const draftText = "Frase ainda sem Próximo";
  await page.goto("/admin/pagina/montar?passo=texto");
  await page.getByLabel("Frase de apresentação").fill(draftText);
  await page.getByRole("link", { name: "Sair do passo a passo" }).click();
  await expect(page).toHaveURL(/\/admin\/pagina$/);
  await page.getByRole("link", { name: "Continuar rascunho" }).click();
  await page.goto("/admin/pagina/montar?passo=texto");
  await expect(page.getByLabel("Frase de apresentação")).toHaveValue(draftText);
});
