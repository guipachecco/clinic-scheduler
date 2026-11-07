import { expect, test } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "../playwright.config";

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
const SLUGS = [FULL.slug, BARE.slug, OFFLINE.slug];

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
});
