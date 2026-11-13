import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "../playwright.config";

import {
  clearRateLimits,
  readOutbox,
  signInToPanel,
  waitForEmailLink,
} from "./helpers";
import { TEST_ADMIN } from "./test-account";

// The Zemana client pages (/entrar, /minhas-clinicas, /esqueci-senha,
// /nova-senha). Clinics and people are seeded straight into the e2e database
// with their own slugs and e-mails, and removed afterwards. Every record is
// fictitious.
test.describe.configure({ mode: "serial" });

const PREFIX = "zemana-entrar-";
const DOMAIN = "@zemana-entrar.example.test";
const SLUGS = { a: `${PREFIX}a`, b: `${PREFIX}b`, other: `${PREFIX}outra` };
const PASSWORD = TEST_ADMIN.password;
const NEW_PASSWORD = "nova-senha-da-cliente-zemana-longa";

const people = {
  client: { name: "Cliente Zemana", email: `cliente${DOMAIN}` },
  empty: { name: "Cliente Sem Clinica", email: `sem-clinica${DOMAIN}` },
  neighbour: { name: "Outra Cliente", email: `outra${DOMAIN}` },
  // Client of the four "many" clinics, for the search and the order.
  many: { name: "Cliente Muitas", email: `muitas${DOMAIN}` },
  // Root with 2FA: the client sign-in can't finish it, so it shows a message.
  panel: { name: "Root do Painel Zemana", email: `painel${DOMAIN}` },
  // Clinic owner: signs in with the password alone (no 2FA).
  owner: { name: "Dona Logada Zemana", email: `dona-logada${DOMAIN}` },
};

const MANY: {
  slug: string;
  name: string;
  address: string | null;
  appointment?: { days: number; status: "confirmed" | "completed" };
}[] = [
  {
    slug: `${PREFIX}bela-joinville`,
    name: "Zemana Entrar Studio Bela",
    address: "Rua das Flores, 10 — Joinville",
  },
  {
    slug: `${PREFIX}bela-blumenau`,
    name: "Zemana Entrar Studio Bela",
    address: "Av. Brasil, 20 — Blumenau",
    appointment: { days: 3, status: "confirmed" },
  },
  {
    slug: `${PREFIX}c`,
    name: "Zemana Entrar Clínica C",
    address: null,
    appointment: { days: -10, status: "completed" },
  },
  {
    slug: `${PREFIX}d`,
    name: "Zemana Entrar Clínica D",
    address: null,
  },
];

// Signs up during the tests (not seeded).
const newcomer = { name: "Nova Cliente Zemana", email: `nova${DOMAIN}` };

async function withDb<T>(run: (db: Client) => Promise<T>) {
  const db = new Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  try {
    return await run(db);
  } finally {
    await db.end();
  }
}

async function cleanUp(db: Client) {
  for (const table of [
    "audit_logs",
    "appointments",
    "services",
    "service_categories",
  ]) {
    await db.query(
      `DELETE FROM ${table} WHERE clinic_id IN
         (SELECT id FROM clinics WHERE slug LIKE $1)`,
      [`${PREFIX}%`],
    );
  }
  await db.query(
    `DELETE FROM patients WHERE clinic_id IN
       (SELECT id FROM clinics WHERE slug LIKE $1)`,
    [`${PREFIX}%`],
  );
  await db.query("DELETE FROM users WHERE email LIKE $1", [`%${DOMAIN}`]);
  await db.query("DELETE FROM clinics WHERE slug LIKE $1", [`${PREFIX}%`]);
}

async function signInAt(page: Page, email: string, password: string) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test.beforeAll(async () => {
  await clearRateLimits();
  await withDb(async (db) => {
    await cleanUp(db);
    // Same password as the e2e admin: reuse its stored hash.
    const {
      rows: [admin],
    } = await db.query<{ password: string }>(
      `SELECT a.password FROM accounts a JOIN users u ON u.id = a.user_id
       WHERE u.email = $1`,
      [TEST_ADMIN.email],
    );
    const clinicIds: Record<string, string> = {};
    for (const [key, name, area] of [
      ["a", "Zemana Entrar Clínica A", "Estética"],
      ["b", "Zemana Entrar Clínica B", "Massagem"],
      ["other", "Zemana Entrar Clínica Alheia", "Podologia"],
    ] as const) {
      const {
        rows: [clinic],
      } = await db.query<{ id: string }>(
        `INSERT INTO clinics (slug, name, area_label, online_booking_choice)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        // Only A takes signups from the clinic list.
        [SLUGS[key], name, area, key === "a"],
      );
      clinicIds[key] = clinic!.id;
    }
    const userIds: Record<string, string> = {};
    for (const [key, person] of Object.entries(people)) {
      const root = key === "panel";
      const owner = key === "owner";
      const {
        rows: [user],
      } = await db.query<{ id: string }>(
        `INSERT INTO users (name, email, email_verified, role, clinic_id,
           two_factor_enabled)
         VALUES ($1, $2, true, $3, $4, $5) RETURNING id`,
        [
          person.name,
          person.email,
          root ? "root" : owner ? "admin" : "client",
          owner ? clinicIds.a : null,
          root,
        ],
      );
      userIds[key] = user!.id;
      await db.query(
        `INSERT INTO accounts (user_id, account_id, provider_id, password)
         VALUES ($1::uuid, $1::text, 'credential', $2)`,
        [user!.id, admin!.password],
      );
    }
    const records: [string, string][] = [
      [clinicIds.a!, userIds.client!],
      [clinicIds.b!, userIds.client!],
      [clinicIds.other!, userIds.neighbour!],
    ];
    for (const [clinicId, userId] of records) {
      await db.query(
        `INSERT INTO patients (clinic_id, user_id, name, name_normalized, phone)
         VALUES ($1, $2, 'Ficha Zemana', 'ficha zemana', '+5511987658800')`,
        [clinicId, userId],
      );
    }

    // Four clinics of "many": two with the same name in different cities,
    // one with a future appointment and one with a past visit.
    for (const clinic of MANY) {
      const {
        rows: [row],
      } = await db.query<{ id: string }>(
        `INSERT INTO clinics (slug, name, address) VALUES ($1, $2, $3)
         RETURNING id`,
        [clinic.slug, clinic.name, clinic.address],
      );
      const {
        rows: [patient],
      } = await db.query<{ id: string }>(
        `INSERT INTO patients (clinic_id, user_id, name, name_normalized, phone)
         VALUES ($1, $2, 'Ficha Muitas', 'ficha muitas', '+5511987658801')
         RETURNING id`,
        [row!.id, userIds.many],
      );
      if (clinic.appointment === undefined) continue;
      const {
        rows: [category],
      } = await db.query<{ id: string }>(
        `INSERT INTO service_categories (clinic_id, name, slug)
         VALUES ($1, 'Categoria', 'categoria-muitas') RETURNING id`,
        [row!.id],
      );
      const {
        rows: [service],
      } = await db.query<{ id: string }>(
        `INSERT INTO services (clinic_id, category_id, name, slug,
           duration_minutes)
         VALUES ($1, $2, 'Limpeza', 'limpeza-muitas', 60) RETURNING id`,
        [row!.id, category!.id],
      );
      const startsAt = new Date(
        Date.now() + clinic.appointment.days * 86_400_000,
      );
      const endsAt = new Date(startsAt.getTime() + 3_600_000);
      await db.query(
        `INSERT INTO appointments (clinic_id, patient_id, service_id,
           service_name, service_duration_minutes, starts_at, ends_at,
           occupied_from, occupied_until, status, source)
         VALUES ($1, $2, $3, 'Limpeza', 60, $4, $5, $4, $5, $6, 'admin')`,
        [
          row!.id,
          patient!.id,
          service!.id,
          startsAt,
          endsAt,
          clinic.appointment.status,
        ],
      );
    }
  });
});

test.afterAll(async () => {
  await withDb(cleanUp);
});

test("client signs in at /entrar and sees only her clinics", async ({
  page,
}) => {
  await signInAt(page, people.client.email, PASSWORD);
  await expect(page).toHaveURL(/\/minhas-clinicas$/);
  await expect(
    page.getByRole("heading", { name: "Suas clínicas" }),
  ).toBeVisible();
  await expect(page.getByText("Zemana Entrar Clínica A")).toBeVisible();
  await expect(page.getByText("Zemana Entrar Clínica B")).toBeVisible();
  await expect(page.getByText("Zemana Entrar Clínica Alheia")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Agendar" }).first(),
  ).toHaveAttribute("href", `/${SLUGS.a}/marcar`);
  await expect(
    page.getByRole("link", { name: "Meus horários" }).first(),
  ).toHaveAttribute("href", `/${SLUGS.a}/meus-horarios`);
  // Two clinics: no search.
  await expect(page.getByRole("searchbox")).toHaveCount(0);

  // Already signed in: /entrar goes back to the list.
  await page.goto("/entrar");
  await expect(page).toHaveURL(/\/minhas-clinicas$/);

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/entrar$/);
});

test("client with many clinics finds hers by order, address and search", async ({
  page,
}) => {
  // One sign-in more in this file: keep the later ones under the limit.
  await clearRateLimits();
  await signInAt(page, people.many.email, PASSWORD);
  await expect(page).toHaveURL(/\/minhas-clinicas$/);
  const cards = page.getByRole("main").getByRole("list").getByRole("listitem");

  // Next appointment first, then the last visit, then by name.
  const bookHrefs = MANY.map((clinic) => `/${clinic.slug}/marcar`);
  await expect(cards).toHaveCount(4);
  const order = await cards
    .getByRole("link", { name: "Agendar" })
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(order).toEqual([
    bookHrefs[1],
    bookHrefs[2],
    bookHrefs[3],
    bookHrefs[0],
  ]);
  // The two clinics with the same name show their addresses.
  await expect(cards.nth(0)).toContainText("Av. Brasil, 20 — Blumenau");
  await expect(cards.nth(3)).toContainText("Rua das Flores, 10 — Joinville");

  const search = page.getByRole("searchbox", { name: "Buscar clínica" });
  await search.fill("joinville");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Zemana Entrar Studio Bela");
  await expect(cards.first()).toContainText("Joinville");

  await search.fill("STUDIO bela");
  await expect(cards).toHaveCount(2);

  await search.fill("clinica d");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Zemana Entrar Clínica D");

  await search.fill("podologia");
  await expect(cards).toHaveCount(0);
  await expect(
    page.getByText("Nenhuma clínica encontrada para “podologia”."),
  ).toBeVisible();

  await search.fill("");
  await expect(cards).toHaveCount(4);
});

test("client without clinics sees the empty message", async ({ page }) => {
  await signInAt(page, people.empty.email, PASSWORD);
  await expect(page).toHaveURL(/\/minhas-clinicas$/);
  await expect(
    page.getByText("Você ainda não é cliente de nenhuma clínica."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Escolher clínica" }),
  ).toHaveAttribute("href", "/clinicas");
});

test("a new client signs up from /entrar through the clinic list", async ({
  page,
}) => {
  await page.goto("/entrar");
  await page.getByRole("link", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/clinicas$/);
  await expect(
    page.getByRole("heading", { name: "Escolha sua clínica" }),
  ).toBeVisible();
  // Online booking off: not in the list.
  await expect(page.getByText("Zemana Entrar Clínica B")).toHaveCount(0);

  await page.getByRole("link", { name: /Zemana Entrar Clínica A/ }).click();
  await expect(page).toHaveURL(
    new RegExp(`/${SLUGS.a}/cadastro\\?next=%2Fminhas-clinicas$`),
  );
  await page.getByLabel("Nome").fill(newcomer.name);
  await page.getByLabel("Celular (WhatsApp)").fill("(11) 98765-8899");
  await page.getByLabel("E-mail").fill(newcomer.email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page).toHaveURL(/\/minhas-clinicas$/);
  await expect(page.getByText("Olá, Nova")).toBeVisible();
  await expect(page.getByText("Zemana Entrar Clínica A")).toBeVisible();
  await expect(page.getByText("Nenhum horário marcado")).toBeVisible();
  // Not confirmed yet: the page asks for it and offers to send it again.
  await expect(
    page.getByRole("heading", { name: "Confirme seu e-mail" }),
  ).toBeVisible();
  await expect(
    page.getByText(`Enviamos um link para ${newcomer.email}`),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reenviar e-mail" }),
  ).toBeVisible();

  // Her clinic is no longer offered when she adds another one.
  await page.getByRole("link", { name: "Adicionar outra clínica" }).click();
  await expect(
    page.getByRole("heading", { name: "Adicionar outra clínica" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Zemana Entrar Clínica A/ }),
  ).toHaveCount(0);
});

test("clinic owner signing in at /entrar lands in the panel", async ({
  page,
}) => {
  await clearRateLimits();
  await signInAt(page, people.owner.email, PASSWORD);
  await expect(page).toHaveURL(/\/admin$/);
  await page.context().clearCookies();
});

test("two-factor panel account is sent to the panel", async ({ page }) => {
  await signInAt(page, people.panel.email, PASSWORD);
  await expect(page.getByText("Essa conta entra pelo painel.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "É profissional? Entre no painel" }),
  ).toHaveAttribute("href", "/admin/entrar");
  await expect(page).toHaveURL(/\/entrar$/);
});

test("forgot password from Zemana e-mails a /nova-senha link", async ({
  page,
}) => {
  await page.goto("/entrar");
  await page.getByRole("link", { name: "Esqueci minha senha" }).click();
  await expect(page).toHaveURL(/\/esqueci-senha$/);
  await page.getByLabel("E-mail").fill(people.client.email);
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(
    page.getByText("Se existir uma conta com esse e-mail"),
  ).toBeVisible();

  const link = await waitForEmailLink(
    people.client.email,
    "/nova-senha?token=",
  );
  const mail = (await readOutbox())
    .filter((message) => message.to === people.client.email)
    .at(-1)!;
  expect(mail.subject).toBe("Troque sua senha da Zemana");

  await page.goto(link);
  await page.getByLabel("Nova senha", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Repita a nova senha").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page.getByText("Senha alterada")).toBeVisible();
  await page.getByRole("link", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/entrar$/);

  await page.getByLabel("E-mail").fill(people.client.email);
  await page.getByLabel("Senha").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/minhas-clinicas$/);
});

test("reserved paths are not clinics", async ({ page }) => {
  const response = await page.goto("/minhas-clinicas");
  await expect(page).toHaveURL(/\/entrar$/);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
});

test("signed-in panel owner is sent to the panel from /entrar and /minhas-clinicas", async ({
  page,
}) => {
  await signInToPanel(page, {
    ...people.owner,
    role: "admin",
    password: PASSWORD,
  });
  await page.goto("/entrar");
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/minhas-clinicas");
  await expect(page).toHaveURL(/\/admin$/);
});
