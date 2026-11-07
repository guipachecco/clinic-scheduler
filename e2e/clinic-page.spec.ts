import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "../playwright.config";

import { clearRateLimits } from "./helpers";

// The clinic's home page on a phone (/<slug>): hero, tabs and the sections
// below them. Dedicated fictitious clinics go straight into the throwaway e2e
// database and are removed afterwards; no existing clinic is changed.
test.use({ viewport: { width: 360, height: 800 } });
test.describe.configure({ mode: "serial" });

const FULL = {
  slug: "clinica-pagina-cheia",
  handle: "clinica.pagina_teste",
  service: "Limpeza de pele (pagina)",
};
const BARE = { slug: "clinica-pagina-vazia" };
const OFFLINE = {
  slug: "clinica-pagina-sem-online",
  service: "Massagem (pagina)",
};
const REVIEW = {
  slug: "clinica-pagina-avaliacao",
  service: "Drenagem (avaliação)",
  reward: "Uma sobrancelha grátis",
};
const SLUGS = [FULL.slug, BARE.slug, OFFLINE.slug, REVIEW.slug];

// Fictitious clients created through the signup form of the REVIEW clinic.
const PEOPLE = {
  done: {
    name: "Maria Clara Teste",
    phone: "(11) 98888-0101",
    email: "cliente-avalia@example.test",
    password: "senha-da-cliente-bem-longa",
  },
  fresh: {
    name: "Joana Nova Teste",
    phone: "(11) 98888-0102",
    email: "cliente-sem-atendimento@example.test",
    password: "senha-da-cliente-bem-longa",
  },
};

let serviceId = "";

async function withDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function removeClinics(client: Client) {
  const ids = (
    await client.query<{ id: string }>(
      "SELECT id FROM clinics WHERE slug = ANY($1)",
      [SLUGS],
    )
  ).rows.map((row) => row.id);
  for (const table of [
    "reviews",
    "audit_logs",
    "loyalty_redemptions",
    "appointments",
    "products",
    "payment_methods",
    "services",
    "service_categories",
    "business_hours",
    "patients",
  ]) {
    await client.query(`DELETE FROM ${table} WHERE clinic_id = ANY($1)`, [ids]);
  }
  await client.query("DELETE FROM clinics WHERE id = ANY($1)", [ids]);
  await client.query("DELETE FROM users WHERE email = ANY($1)", [
    Object.values(PEOPLE).map((person) => person.email),
  ]);
}

async function signUp(page: Page, person: typeof PEOPLE.done) {
  await page.goto(`/${REVIEW.slug}/cadastro`);
  await page.getByLabel("Nome").fill(person.name);
  await page.getByLabel("Celular (WhatsApp)").fill(person.phone);
  await page.getByLabel("E-mail").fill(person.email);
  await page.getByLabel("Senha").fill(person.password);
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(new RegExp(`/${REVIEW.slug}/marcar$`));
}

async function signIn(page: Page, person: typeof PEOPLE.done) {
  await page.goto(`/${REVIEW.slug}/entrar`);
  await page.getByLabel("E-mail").fill(person.email);
  await page.getByLabel("Senha").fill(person.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/entrar/);
}

// A completed appointment of the person in the REVIEW clinic, days ago.
async function addCompleted(client: Client, email: string, daysAgo: number) {
  const {
    rows: [row],
  } = await client.query<{ clinic_id: string; id: string }>(
    `SELECT p.clinic_id, p.id FROM patients p JOIN users u ON u.id = p.user_id
     JOIN clinics c ON c.id = p.clinic_id WHERE u.email = $1 AND c.slug = $2`,
    [email, REVIEW.slug],
  );
  const {
    rows: [service],
  } = await client.query<{ id: string }>(
    "SELECT id FROM services WHERE clinic_id = $1",
    [row!.clinic_id],
  );
  await client.query(
    `INSERT INTO appointments (clinic_id, patient_id, service_id, service_name,
       service_duration_minutes, starts_at, ends_at, occupied_from,
       occupied_until, status, source, confirmed_at)
     SELECT $1, $2, $3, $4, 60, t, t + interval '60 minutes', t,
       t + interval '60 minutes', 'completed', 'admin', now()
     FROM (SELECT now() - make_interval(days => $5::int) AS t) x`,
    [row!.clinic_id, row!.id, service!.id, REVIEW.service, daysAgo],
  );
}

async function addService(
  client: Client,
  clinicId: string,
  name: string,
): Promise<string> {
  const {
    rows: [category],
  } = await client.query<{ id: string }>(
    `INSERT INTO service_categories (clinic_id, name, slug)
     VALUES ($1, 'Estética (página)', 'estetica-pagina') RETURNING id`,
    [clinicId],
  );
  const {
    rows: [service],
  } = await client.query<{ id: string }>(
    `INSERT INTO services (clinic_id, category_id, name, slug,
       duration_minutes, price_cents, price_display, online_booking_enabled,
       is_active)
     VALUES ($1, $2, $3, 'servico-pagina', 60, 15000, 'fixed', true, true)
     RETURNING id`,
    [clinicId, category!.id, name],
  );
  return service!.id;
}

async function addHours(client: Client, clinicId: string) {
  for (let weekday = 0; weekday <= 6; weekday++) {
    await client.query(
      `INSERT INTO business_hours (clinic_id, weekday, start_time, end_time)
       VALUES ($1, $2, '00:00', '23:59')`,
      [clinicId, weekday],
    );
  }
}

test.describe("página inicial da clínica", () => {
  test.beforeAll(async () => {
    await withDb(async (client) => {
      await removeClinics(client);

      const {
        rows: [full],
      } = await client.query<{ id: string }>(
        `INSERT INTO clinics (slug, name, display_name, headline, about,
           area_label, whatsapp_phone, contact_email, address,
           instagram_handle, amenities, loyalty_enabled, loyalty_visits,
           loyalty_reward, online_booking_enabled)
         VALUES ($1, 'Clínica Página Cheia (teste)', 'Clínica Cheia',
           'Cuidado com a sua pele', 'Atendimento com hora marcada.',
           'Estética facial', '+5511987650101', 'cheia@example.test',
           'Rua Fictícia, 300 - São Paulo', $2, '{wifi}', true, 5,
           'Uma limpeza de pele grátis', true)
         RETURNING id`,
        [FULL.slug, FULL.handle],
      );
      const fullId = full!.id;
      await addHours(client, fullId);
      serviceId = await addService(client, fullId, FULL.service);
      await client.query(
        `INSERT INTO products (clinic_id, name, price_cents, description)
         VALUES ($1, 'Protetor solar (página)', 7990, 'FPS 50')`,
        [fullId],
      );
      await client.query(
        `INSERT INTO payment_methods (clinic_id, name) VALUES ($1, 'PIX')`,
        [fullId],
      );
      const {
        rows: [patient],
      } = await client.query<{ id: string }>(
        `INSERT INTO patients (clinic_id, name, name_normalized, phone)
         VALUES ($1, 'Ana Paula Souza', 'ana paula souza', '+5511900002001')
         RETURNING id`,
        [fullId],
      );
      await client.query(
        `INSERT INTO reviews (clinic_id, patient_id, rating, comment, is_hidden)
         VALUES ($1, $2, 5, 'Atendimento visível (página)', false),
                ($1, $2, 1, 'Comentário escondido (página)', true)`,
        [fullId, patient!.id],
      );

      await client.query(
        `INSERT INTO clinics (slug, name) VALUES ($1, 'Clínica Página Vazia (teste)')`,
        [BARE.slug],
      );

      const {
        rows: [offline],
      } = await client.query<{ id: string }>(
        `INSERT INTO clinics (slug, name, whatsapp_phone,
           online_booking_enabled)
         VALUES ($1, 'Clínica Página Sem Online (teste)', '+5511987650102',
           false)
         RETURNING id`,
        [OFFLINE.slug],
      );
      await addService(client, offline!.id, OFFLINE.service);

      const {
        rows: [review],
      } = await client.query<{ id: string }>(
        `INSERT INTO clinics (slug, name, display_name, loyalty_enabled,
           loyalty_visits, loyalty_reward, online_booking_enabled)
         VALUES ($1, 'Clínica Página Avaliação (teste)', 'Clínica Avaliação',
           true, 2, $2, true)
         RETURNING id`,
        [REVIEW.slug, REVIEW.reward],
      );
      await addHours(client, review!.id);
      await addService(client, review!.id, REVIEW.service);
    });
  });

  test.afterAll(async () => {
    await withDb(removeClinics);
  });

  test("full page", async ({ page }) => {
    await page.goto(`/${FULL.slug}`);
    const tabs = page.getByRole("tablist");
    for (const name of [
      "Serviços",
      "Fotos",
      "Fidelidade",
      "Produtos",
      "Sobre",
    ]) {
      await expect(tabs.getByRole("tab", { name })).toBeVisible();
    }
    await expect(page.getByText("Aberto agora · até 23:59")).toBeVisible();

    await tabs.getByRole("tab", { name: "Fotos" }).click();
    await expect(
      page.getByRole("tabpanel").getByText("Fotos em breve"),
    ).toBeVisible();

    await tabs.getByRole("tab", { name: "Fidelidade" }).click();
    await expect(
      page.getByRole("tabpanel").getByText("Uma limpeza de pele grátis"),
    ).toBeVisible();

    await tabs.getByRole("tab", { name: "Produtos" }).click();
    await expect(
      page.getByRole("tabpanel").getByText("Protetor solar (página)"),
    ).toBeVisible();

    await expect(page.getByText("Wi-Fi", { exact: true })).toBeVisible();
    await expect(page.getByText("Atendimento visível (página)")).toBeVisible();
    await expect(page.getByText("Nota 5 de 5")).toBeVisible();
    await expect(page.getByText("Ana S.", { exact: true })).toBeVisible();
    await expect(page.getByText("Ana Paula Souza")).toHaveCount(0);
    await expect(page.getByText("Comentário escondido (página)")).toHaveCount(
      0,
    );
    await expect(page.getByText("PIX", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Instagram" })).toHaveAttribute(
      "href",
      `https://www.instagram.com/${FULL.handle}/`,
    );
  });

  test("tabs work with the keyboard", async ({ page }) => {
    await page.goto(`/${FULL.slug}`);
    await page.getByRole("tab", { name: "Serviços" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Fotos" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("bare clinic hides empty sections", async ({ page }) => {
    await page.goto(`/${BARE.slug}`);
    for (const name of [
      "Comodidades",
      "Avaliações",
      "Localização",
      "Formas de pagamento",
    ]) {
      await expect(page.getByRole("heading", { name })).toHaveCount(0);
    }
    const tabs = page.getByRole("tablist");
    await expect(tabs.getByRole("tab", { name: "Produtos" })).toHaveCount(0);
    await expect(tabs.getByRole("tab", { name: "Fidelidade" })).toHaveCount(0);
    await tabs.getByRole("tab", { name: "Fotos" }).click();
    await expect(
      page.getByRole("tabpanel").getByText("Fotos em breve"),
    ).toBeVisible();
    await expect(page.getByText("Fechado hoje")).toBeVisible();
  });

  test("online booking off shows contact instead of Agendar", async ({
    page,
  }) => {
    await page.goto(`/${OFFLINE.slug}`);
    const main = page.getByRole("main");
    const item = main
      .getByRole("listitem")
      .filter({ hasText: OFFLINE.service });
    await expect(item).toBeVisible();
    await expect(main.getByRole("link", { name: "Agendar" })).toHaveCount(0);
    const contact = item.getByRole("link", { name: "Fale com a clínica" });
    await expect(contact).toHaveAttribute(
      "href",
      "https://wa.me/5511987650102",
    );
    await expect(contact).toHaveAttribute("target", "_blank");
  });

  test("Agendar on a service carries it to the booking page", async ({
    page,
  }) => {
    await page.goto(`/${FULL.slug}`);
    const item = page.getByRole("listitem").filter({ hasText: FULL.service });
    await expect(item.getByRole("link", { name: "Agendar" })).toHaveAttribute(
      "href",
      `/${FULL.slug}/marcar?servico=${serviceId}`,
    );
  });

  test("client with a completed appointment reviews", async ({ browser }) => {
    await clearRateLimits();
    const context = await browser.newContext({
      viewport: { width: 360, height: 800 },
    });
    const page = await context.newPage();
    await signUp(page, PEOPLE.done);
    await withDb((client) => addCompleted(client, PEOPLE.done.email, 3));

    await page.goto(`/${REVIEW.slug}`);
    await page.getByRole("link", { name: "Avaliar" }).click();
    await expect(page).toHaveURL(new RegExp(`/${REVIEW.slug}/avaliar$`));

    const five = page.getByRole("button", { name: "5 estrelas" });
    await expect(five).toHaveAttribute("aria-pressed", "false");
    await five.click();
    await expect(five).toHaveAttribute("aria-pressed", "true");
    await page
      .getByLabel("Comentário")
      .fill("Adorei o atendimento (avaliação)");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText("Obrigada pela avaliação!")).toBeVisible();

    await page.goto(`/${REVIEW.slug}`);
    await expect(page.getByText("Maria T.", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Adorei o atendimento (avaliação)"),
    ).toBeVisible();
    await expect(page.getByText("Maria Clara Teste")).toHaveCount(0);
    await context.close();
  });

  test("client without a completed appointment cannot review", async ({
    browser,
  }) => {
    await clearRateLimits();
    const context = await browser.newContext({
      viewport: { width: 360, height: 800 },
    });
    const page = await context.newPage();
    await signUp(page, PEOPLE.fresh);

    await page.goto(`/${REVIEW.slug}/avaliar`);
    await expect(
      page.getByText("Você poderá avaliar depois do seu primeiro atendimento."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /estrela/ })).toHaveCount(0);

    await page.goto(`/${REVIEW.slug}`);
    await expect(page.getByRole("link", { name: "Avaliar" })).toHaveCount(0);
    await context.close();
  });

  test("loyalty card shows progress", async ({ browser }) => {
    await clearRateLimits();
    const context = await browser.newContext({
      viewport: { width: 360, height: 800 },
    });
    const page = await context.newPage();
    await signIn(page, PEOPLE.done);

    await page.goto(`/${REVIEW.slug}`);
    await page.getByRole("tab", { name: "Fidelidade" }).click();
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByText(REVIEW.reward)).toBeVisible();
    await expect(panel.getByText("1 de 2")).toBeVisible();

    await withDb((client) => addCompleted(client, PEOPLE.done.email, 5));
    await page.reload();
    await page.getByRole("tab", { name: "Fidelidade" }).click();
    await expect(
      page.getByRole("tabpanel").getByText(`Você ganhou: ${REVIEW.reward}`),
    ).toBeVisible();
    await context.close();
  });
});
