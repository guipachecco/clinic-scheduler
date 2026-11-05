import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "../playwright.config";

import { CLIENT_AREA } from "./client-area-fixtures";
import {
  clearRateLimits,
  signInWithFreshTwoFactor,
  waitForEmailLink,
} from "./helpers";
import { TEST_ADMIN_CLIENT_AREA } from "./test-account";

// The client area of a clinic link (/<slug>): signup, e-mail confirmation,
// password reset, online booking and her appointments. The clinics are
// seeded by e2e/global-setup.ts (e2e/client-area-fixtures.ts). Every person
// and e-mail here is fictitious.
test.describe.configure({ mode: "serial" });

const A = CLIENT_AREA.a;
const B = CLIENT_AREA.b;

const CLIENT = {
  name: "Cliente Online de Teste",
  phone: "(11) 98888-0001",
  email: "cliente-online@example.test",
  password: "senha-da-cliente-bem-longa",
};
const NEW_PASSWORD = "outra-senha-da-cliente-bem-longa";

const UNVERIFIED = {
  name: "Cliente Sem Confirmar",
  phone: "(11) 98888-0002",
  email: "cliente-sem-confirmar@example.test",
  password: "senha-sem-confirmar-bem-longa",
};

// The signed-in client used by the later tests (after her password reset,
// which ends her other sessions).
let clientContext: BrowserContext;
let client: Page;
let appointmentId: string;

async function query<T extends object>(sql: string, params: unknown[] = []) {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.end();
  }
}

async function signUp(page: Page, person: typeof CLIENT) {
  await page.goto(`/${A.slug}`);
  await page.getByRole("link", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(new RegExp(`/${A.slug}/cadastro`));
  await page.getByLabel("Nome").fill(person.name);
  await page.getByLabel("Celular (WhatsApp)").fill(person.phone);
  await page.getByLabel("E-mail").fill(person.email);
  await page.getByLabel("Senha").fill(person.password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(new RegExp(`/${A.slug}/marcar$`));
}

async function signIn(page: Page, slug: string, password: string) {
  await page.goto(`/${slug}/entrar`);
  await page.getByLabel("E-mail").fill(CLIENT.email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

function noSidewaysScroll(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  );
}

test.describe("client area", () => {
  test.beforeAll(async () => {
    await clearRateLimits();
  });

  test.afterAll(async () => {
    await clientContext?.close();
  });

  test("sign up, confirm e-mail, book a slot that shows in the owner's agenda", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`/${A.slug}`);
    await expect(page.getByText(A.displayName).first()).toBeVisible();
    await signUp(page, CLIENT);
    await expect(
      page.getByRole("heading", { name: "Confirme seu e-mail" }),
    ).toBeVisible();

    const link = await waitForEmailLink(
      CLIENT.email,
      `/${A.slug}/confirmar-email?token=`,
    );
    await page.goto(link);
    await expect(
      page.getByRole("heading", { name: "E-mail confirmado" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Marcar horário" }).click();
    await expect(page).toHaveURL(new RegExp(`/${A.slug}/marcar$`));

    await page.getByRole("button", { name: A.service }).click();
    await page
      .getByRole("group", { name: "Dias" })
      .getByRole("button", { disabled: false })
      .first()
      .click();
    const time = page
      .getByRole("group", { name: "Horários livres" })
      .getByRole("button")
      .first();
    const chosen = (await time.textContent())!.trim();
    await time.click();
    await expect(
      page.getByRole("heading", { name: "Confirme o horário" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirmar horário" }).click();

    await expect(
      page.getByRole("heading", { name: "Horário marcado" }),
    ).toBeVisible();
    await expect(page.getByText(A.service)).toBeVisible();
    await expect(page.getByText(chosen)).toBeVisible();
    await expect(page.getByText(A.address)).toBeVisible();
    await expect(page.getByText(A.preparation)).toBeVisible();

    const [row] = await query<{ id: string; status: string; source: string }>(
      `SELECT a.id, a.status, a.source FROM appointments a
       JOIN clinics c ON c.id = a.clinic_id WHERE c.slug = $1`,
      [A.slug],
    );
    expect(row).toMatchObject({ status: "confirmed", source: "online" });
    appointmentId = row!.id;

    const ownerContext = await browser.newContext();
    const owner = await ownerContext.newPage();
    await signInWithFreshTwoFactor(owner, TEST_ADMIN_CLIENT_AREA);
    await owner.goto(`/admin/agenda/${appointmentId}`);
    await expect(owner.getByText("Origem: Online")).toBeVisible();
    await expect(owner.getByText(`Serviço: ${A.service}`)).toBeVisible();
    await expect(owner.getByRole("link", { name: CLIENT.name })).toBeVisible();
    await ownerContext.close();
    await context.close();
  });

  test("unconfirmed client sees Confirme seu e-mail and cannot book", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signUp(page, UNVERIFIED);

    await expect(
      page.getByRole("heading", { name: "Confirme seu e-mail" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: A.service })).toHaveCount(0);
    await waitForEmailLink(UNVERIFIED.email, "/confirmar-email?token=");

    await page.getByRole("button", { name: "Reenviar e-mail" }).click();
    await expect(page.getByText("Enviamos um novo link")).toBeVisible();
    await waitForEmailLink(UNVERIFIED.email, "/confirmar-email?token=", 2);

    // No appointment was created for her.
    const rows = await query(
      `SELECT a.id FROM appointments a JOIN patients p ON p.id = a.patient_id
       JOIN users u ON u.id = p.user_id WHERE u.email = $1`,
      [UNVERIFIED.email],
    );
    expect(rows).toEqual([]);
    await context.close();
  });

  test("forgot password e-mail resets the password", async ({ browser }) => {
    clientContext = await browser.newContext();
    client = await clientContext.newPage();

    await client.goto(`/${A.slug}/entrar`);
    await client.getByRole("link", { name: "Esqueci minha senha" }).click();
    await expect(client).toHaveURL(new RegExp(`/${A.slug}/esqueci-senha$`));
    await client.getByLabel("E-mail").fill(CLIENT.email);
    await client.getByRole("button", { name: "Enviar link" }).click();
    await expect(
      client.getByText("Se existir uma conta com esse e-mail"),
    ).toBeVisible();

    const link = await waitForEmailLink(
      CLIENT.email,
      `/${A.slug}/nova-senha?token=`,
    );
    await client.goto(link);
    await client.getByLabel("Nova senha", { exact: true }).fill(NEW_PASSWORD);
    await client.getByLabel("Repita a nova senha").fill(NEW_PASSWORD);
    await client.getByRole("button", { name: "Salvar nova senha" }).click();
    await expect(client.getByText("Senha alterada")).toBeVisible();

    // The old password no longer works; the new one does.
    await signIn(client, A.slug, CLIENT.password);
    await expect(client.getByText("E-mail ou senha incorretos.")).toBeVisible();
    await signIn(client, A.slug, NEW_PASSWORD);
    await expect(client).toHaveURL(new RegExp(`/${A.slug}/marcar$`));
    await expect(client.getByRole("button", { name: A.service })).toBeVisible();
  });

  test("client of clinic A opening clinic B's link sees none of A's appointments", async () => {
    await client.goto(`/${B.slug}/meus-horarios`);
    await expect(client).toHaveURL(
      new RegExp(`/${B.slug}/cadastro\\?completar=1`),
    );
    await expect(
      client.getByRole("heading", { name: "Complete seu cadastro" }),
    ).toBeVisible();
    await expect(client.getByLabel("Nome")).toHaveValue(CLIENT.name);
    await client.getByLabel("Celular (WhatsApp)").fill(CLIENT.phone);
    await client.getByRole("button", { name: "Continuar" }).click();

    await expect(client).toHaveURL(new RegExp(`/${B.slug}/meus-horarios$`));
    await expect(client.getByText("Nenhum horário marcado.")).toBeVisible();
    await expect(client.getByText(A.service)).toHaveCount(0);
    await expect(client.getByText(B.displayName).first()).toBeVisible();

    await client.goto(`/${A.slug}/meus-horarios`);
    await expect(client.getByText(A.service)).toBeVisible();
  });

  test("client session cannot open /admin or /admin/foto/<id>", async () => {
    await client.goto("/admin");
    await expect(client.getByText("Página não encontrada")).toBeVisible();

    await client.goto("/admin/agenda");
    await expect(client.getByText("Página não encontrada")).toBeVisible();

    // A real image of her clinic: still not found for her.
    const [media] = await query<{ id: string }>(
      `INSERT INTO media (clinic_id, kind, mime_type, data, byte_size, width, height)
       SELECT id, 'photo', 'image/png', '\\x89504e47'::bytea, 4, 1, 1
       FROM clinics WHERE slug = $1 RETURNING id`,
      [A.slug],
    );
    try {
      const response = await client.goto(`/admin/foto/${media!.id}`);
      expect(response?.status()).toBe(404);
      expect(response?.headers()["content-type"] ?? "").not.toContain("image/");
    } finally {
      await query("DELETE FROM media WHERE id = $1", [media!.id]);
    }
  });

  test("my appointments has no cancel button", async () => {
    await client.goto(`/${A.slug}/meus-horarios`);
    await expect(
      client.getByRole("heading", { name: "Próximos horários" }),
    ).toBeVisible();
    await expect(client.getByText(A.service)).toBeVisible();
    await expect(
      client.getByText(`Para desmarcar ou mudar, fale com ${A.displayName}`),
    ).toBeVisible();
    await expect(
      client.getByRole("link", { name: /WhatsApp/ }),
    ).toHaveAttribute("href", `https://wa.me/${A.whatsapp.slice(1)}`);
    await expect(
      client.getByRole("button", { name: /desmarcar|cancelar|remarcar/i }),
    ).toHaveCount(0);
    await expect(
      client.getByRole("link", { name: /desmarcar|cancelar|remarcar/i }),
    ).toHaveCount(0);

    // The owner cancels it: it shows as Desmarcado.
    await query(
      `UPDATE appointments SET status = 'cancelled', cancelled_at = now(),
         cancelled_by = 'clinic', cancellation_reason = 'other'
       WHERE id = $1`,
      [appointmentId],
    );
    await client.reload();
    await expect(client.getByText("Desmarcado")).toBeVisible();
  });

  test("no sideways scroll at 360 px", async () => {
    await client.setViewportSize({ width: 360, height: 740 });
    await client.goto(`/${A.slug}`);
    await expect(
      client.getByRole("link", { name: "Marcar horário" }),
    ).toBeVisible();
    expect(await noSidewaysScroll(client)).toBe(true);

    await client.goto(`/${A.slug}/marcar`);
    await client.getByRole("button", { name: A.service }).click();
    await expect(client.getByRole("group", { name: "Dias" })).toBeVisible();
    expect(await noSidewaysScroll(client)).toBe(true);

    await client
      .getByRole("group", { name: "Dias" })
      .getByRole("button", { disabled: false })
      .first()
      .click();
    await expect(
      client.getByRole("group", { name: "Horários livres" }),
    ).toBeVisible();
    expect(await noSidewaysScroll(client)).toBe(true);
  });

  test("dark theme shows the dark-background logo", async () => {
    const logo = () => client.locator('header img[alt="Zemana"]:visible');

    await client.goto(`/${A.slug}`);
    await expect(logo()).toHaveCount(1);
    expect(await logo().getAttribute("src")).not.toContain("fundo-escuro");

    await client.getByRole("button", { name: "Tema escuro" }).click();
    await client.reload();
    await expect(logo()).toHaveCount(1);
    expect(await logo().getAttribute("src")).toContain("fundo-escuro");
  });

  test("a clinic without online booking shows its contacts; unknown and reserved links are not found", async ({
    page,
  }) => {
    const off = CLIENT_AREA.off;
    await page.goto(`/${off.slug}`);
    await expect(
      page.getByText("Agendamento online indisponível"),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute(
      "href",
      `https://wa.me/${off.whatsapp.slice(1)}`,
    );
    await expect(page.getByRole("link", { name: off.email })).toHaveAttribute(
      "href",
      `mailto:${off.email}`,
    );
    await expect(
      page.getByRole("link", { name: "Marcar horário" }),
    ).toHaveCount(0);

    await page.goto("/clinica-que-nao-existe");
    await expect(page.getByText("Página não encontrada")).toBeVisible();
    await page.goto("/entrar");
    await expect(page.getByText("Página não encontrada")).toBeVisible();
    await page.goto(`/${off.slug}/nada-aqui`);
    await expect(page.getByText("Página não encontrada")).toBeVisible();

    // Deactivated clinic: not found.
    await query("UPDATE clinics SET is_active = false WHERE slug = $1", [
      B.slug,
    ]);
    try {
      await page.goto(`/${B.slug}`);
      await expect(page.getByText("Página não encontrada")).toBeVisible();
    } finally {
      await query("UPDATE clinics SET is_active = true WHERE slug = $1", [
        B.slug,
      ]);
    }
  });
});
