import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "../playwright.config";

import { signInWithFreshTwoFactor } from "./helpers";
import { TEST_ADMIN_ANAMNESIS, TEST_ROOT_ANAMNESIS } from "./test-account";

// The anamnesis of a patient in the panel, with fictitious patients inserted
// straight into the throwaway e2e database.
test.describe.configure({ mode: "serial" });

// The Grais clinic (drizzle/0007_multi_clinic.sql) has the anamnesis on.
const GRAIS_ID = "00000000-0000-4000-8000-000000000100";
const PATIENTS = {
  fill: {
    id: "00000000-0000-4000-8000-0000000a0001",
    name: "Paciente Anamnese Um",
    phone: "+5511988800001",
  },
  copy: {
    id: "00000000-0000-4000-8000-0000000a0002",
    name: "Paciente Anamnese Dois",
    phone: "+5511988800002",
  },
  remove: {
    id: "00000000-0000-4000-8000-0000000a0003",
    name: "Paciente Anamnese Três",
    phone: "+5511988800003",
  },
};
const OTHER_CLINIC = {
  slug: "clinica-sem-anamnese",
  name: "Clínica Sem Anamnese (teste)",
};
const OTHER_PATIENT = {
  id: "00000000-0000-4000-8000-0000000a0009",
  name: "Paciente de Outra Clínica",
  phone: "+5511988800009",
};

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const FORM_PATH = new RegExp(`^/admin/pacientes/${UUID}/anamneses/${UUID}$`);

let context: BrowserContext;
let page: Page;
// The anamnesis of the first test, reused by the later ones.
let anamnesisPath = "";

async function withDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

function normalize(name: string) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

async function openNewAnamnesis(patientId: string) {
  await page.goto(`/admin/pacientes/${patientId}`);
  await page.getByRole("button", { name: "Nova anamnese" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/pacientes/${patientId}/anamneses/${UUID}$`),
  );
  await expect(page.getByLabel("Principais queixas")).toBeVisible();
}

const saved = () => page.getByText(/Salvo às \d{2}:\d{2}/);
const conflict = () => page.getByText("Esta anamnese foi alterada em outro");
// The form has a Salvar button at the top and another at the bottom.
const saveButton = () =>
  page.getByRole("button", { name: "Salvar", exact: true }).first();

test.describe("anamnese", () => {
  test.beforeAll(async ({ browser }) => {
    await withDb(async (client) => {
      for (const patient of Object.values(PATIENTS)) {
        await client.query(
          `INSERT INTO patients (id, clinic_id, name, name_normalized, phone)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            patient.id,
            GRAIS_ID,
            patient.name,
            normalize(patient.name),
            patient.phone,
          ],
        );
      }
      const {
        rows: [clinic],
      } = await client.query<{ id: string }>(
        `INSERT INTO clinics (slug, name, slot_step_minutes)
         VALUES ($1, $2, 30) RETURNING id`,
        [OTHER_CLINIC.slug, OTHER_CLINIC.name],
      );
      await client.query(
        `INSERT INTO patients (id, clinic_id, name, name_normalized, phone)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          OTHER_PATIENT.id,
          clinic!.id,
          OTHER_PATIENT.name,
          normalize(OTHER_PATIENT.name),
          OTHER_PATIENT.phone,
        ],
      );
    });
    context = await browser.newContext();
    page = await context.newPage();
    await signInWithFreshTwoFactor(page, TEST_ADMIN_ANAMNESIS);
  });

  test.afterAll(async () => {
    await context.close();
    await withDb(async (client) => {
      // Other suites (e2e/patients.spec.ts) expect Grais to start without
      // patients.
      const ids = Object.values(PATIENTS).map((patient) => patient.id);
      await client.query(`DELETE FROM anamneses WHERE patient_id = ANY($1)`, [
        ids,
      ]);
      await client.query(`DELETE FROM patients WHERE id = ANY($1)`, [ids]);
      const inOther = `clinic_id IN (SELECT id FROM clinics WHERE slug = $1)`;
      await client.query(`DELETE FROM audit_logs WHERE ${inOther}`, [
        OTHER_CLINIC.slug,
      ]);
      await client.query(`DELETE FROM patients WHERE ${inOther}`, [
        OTHER_CLINIC.slug,
      ]);
      await client.query(`DELETE FROM clinics WHERE slug = $1`, [
        OTHER_CLINIC.slug,
      ]);
    });
  });

  test("fills an anamnesis, autosaves and downloads the PDF", async () => {
    await page.goto(`/admin/pacientes/${PATIENTS.fill.id}`);
    await expect(
      page.getByRole("heading", { name: "Anamneses" }),
    ).toBeVisible();
    await expect(page.getByText("Nenhuma anamnese ainda.")).toBeVisible();

    await openNewAnamnesis(PATIENTS.fill.id);
    anamnesisPath = new URL(page.url()).pathname;

    await page.getByLabel("Principais queixas").fill("Dor de cabeça fictícia");
    await expect(page.getByText("Alterações não salvas")).toBeVisible();
    // Autosave, without clicking Salvar.
    await expect(saved()).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByLabel("Principais queixas")).toHaveValue(
      "Dor de cabeça fictícia",
    );

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Gerar PDF" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      /^anamnese-\d{4}-\d{2}-\d{2}\.pdf$/,
    );

    const pdf = await context.request.get(`${anamnesisPath}/pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect(pdf.headers()["cache-control"]).toContain("no-store");

    const anamnesisId = anamnesisPath.split("/").at(-1);
    const audits = await withDb(async (client) => {
      const { rows } = await client.query(
        `SELECT 1 FROM audit_logs
         WHERE action = 'anamnesis.pdf_generated' AND entity_id = $1`,
        [anamnesisId],
      );
      return rows.length;
    });
    expect(audits).toBeGreaterThanOrEqual(1);
  });

  test("two quick edits do not conflict", async () => {
    await page.goto(anamnesisPath);
    await page.getByLabel("Duração dos sintomas").fill("Há dois anos");
    await page.waitForTimeout(1_000);
    await page.getByLabel("O que agrava ou melhora?").fill("Melhora ao dormir");
    await expect(saved()).toBeVisible({ timeout: 10_000 });
    await expect(conflict()).toHaveCount(0);

    // Two saves back to back: the second waits for the first and uses the
    // version it returned.
    await page.getByLabel("Duração dos sintomas").fill("Há três anos");
    await saveButton().click();
    await page.getByLabel("O que agrava ou melhora?").fill("Piora no frio");
    await saveButton().click();
    await expect(saved()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Alterações não salvas")).toHaveCount(0);
    await expect(conflict()).toHaveCount(0);

    await page.reload();
    await expect(page.getByLabel("Duração dos sintomas")).toHaveValue(
      "Há três anos",
    );
    await expect(page.getByLabel("O que agrava ou melhora?")).toHaveValue(
      "Piora no frio",
    );
  });

  test("marking as completed keeps the form editing", async () => {
    await page.goto(anamnesisPath);
    await page.getByRole("button", { name: "Marcar como concluída" }).click();
    await expect(page.getByRole("button", { name: "Reabrir" })).toBeVisible();
    await expect(page.getByText("Concluída", { exact: true })).toBeVisible();

    await page.getByLabel("Principais queixas").fill("Depois de concluída");
    await saveButton().click();
    await expect(saved()).toBeVisible({ timeout: 10_000 });
    await expect(conflict()).toHaveCount(0);

    await page.getByRole("button", { name: "Reabrir" }).click();
    await expect(
      page.getByRole("button", { name: "Marcar como concluída" }),
    ).toBeVisible();
    await page.getByLabel("Principais queixas").fill("Depois de reaberta");
    await saveButton().click();
    await expect(saved()).toBeVisible({ timeout: 10_000 });
    await expect(conflict()).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel("Principais queixas")).toHaveValue(
      "Depois de reaberta",
    );
  });

  test("second anamnesis comes prefilled, diagnosis blank", async () => {
    await openNewAnamnesis(PATIENTS.copy.id);
    await page.getByLabel("Principais queixas").fill("Insônia fictícia");
    await page.getByLabel("Estado Geral").fill("Cansaço fictício");
    await saveButton().click();
    await expect(saved()).toBeVisible({ timeout: 10_000 });

    await page.getByRole("link", { name: "Voltar à ficha" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/pacientes/${PATIENTS.copy.id}$`),
    );
    await page.getByRole("button", { name: "Nova anamnese" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/pacientes/${PATIENTS.copy.id}/anamneses/${UUID}$`),
    );
    await expect(page.getByLabel("Principais queixas")).toHaveValue(
      "Insônia fictícia",
    );
    await expect(page.getByLabel("Estado Geral")).toHaveValue("");

    await page.goto(`/admin/pacientes/${PATIENTS.copy.id}`);
    const list = page.getByRole("list", { name: "Anamneses" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list.getByRole("listitem").first()).toContainText(
      "Em andamento",
    );
    await expect(list.getByRole("listitem").first()).toContainText(
      /\d{2}\/\d{2}\/\d{4} · Em andamento · atualizada em \d{2}\/\d{2}\/\d{4}/,
    );
  });

  test("nothing of the anamnesis is kept in the browser", async () => {
    await page.goto(anamnesisPath);
    await page.getByLabel("Principais queixas").fill("Texto só do servidor");
    await expect(saved()).toBeVisible({ timeout: 10_000 });
    const stored = await page.evaluate(async () => {
      const dump = (storage: Storage) =>
        Array.from({ length: storage.length }, (_, i) => {
          const key = storage.key(i)!;
          return `${key}=${storage.getItem(key)}`;
        }).join("\n");
      const databases = (await indexedDB.databases()).length;
      return {
        local: dump(localStorage),
        session: dump(sessionStorage),
        databases,
      };
    });
    expect(stored.local).not.toContain("servidor");
    expect(stored.session).not.toContain("servidor");
    expect(stored.databases).toBe(0);
  });

  test("expired session keeps the text", async ({ browser }) => {
    const expired = await browser.newContext({
      storageState: await context.storageState(),
    });
    try {
      const tab = await expired.newPage();
      await tab.goto(anamnesisPath);
      await expect(tab.getByLabel("Principais queixas")).toBeVisible();
      await expired.clearCookies();

      await tab.getByLabel("Principais queixas").fill("Texto que não se perde");
      await expect(
        tab.getByText(
          "Sua sessão expirou. Entre de novo em outra aba e depois clique em Salvar.",
        ),
      ).toBeVisible({ timeout: 10_000 });
      await expect(tab.getByLabel("Principais queixas")).toHaveValue(
        "Texto que não se perde",
      );
      expect(new URL(tab.url()).pathname).toBe(anamnesisPath);
    } finally {
      await expired.close();
    }
  });

  test("deletes an anamnesis after confirming", async () => {
    await openNewAnamnesis(PATIENTS.remove.id);
    page.once("dialog", (dialog) => {
      expect(dialog.message()).toBe(
        "Excluir esta anamnese? Não dá para desfazer.",
      );
      void dialog.accept();
    });
    await page.getByRole("button", { name: "Excluir anamnese" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/pacientes/${PATIENTS.remove.id}$`),
    );
    await expect(page.getByText("Nenhuma anamnese ainda.")).toBeVisible();
  });

  test("no sideways scroll at 360 px", async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    try {
      await page.goto(anamnesisPath);
      await expect(page.getByLabel("Principais queixas")).toBeVisible();
      const width = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      expect(width).toBeLessThanOrEqual(360);
    } finally {
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  });

  test("title and URL carry no patient data", async () => {
    await page.goto(anamnesisPath);
    await expect(page).toHaveTitle(/^Anamnese \| /);
    const title = await page.title();
    expect(title).not.toContain(PATIENTS.fill.name);
    const url = new URL(page.url());
    expect(url.pathname).toMatch(FORM_PATH);
    expect(url.search).toBe("");
  });

  test("another clinic has no anamnesis", async ({ browser }) => {
    const rootContext = await browser.newContext();
    try {
      const root = await rootContext.newPage();
      await signInWithFreshTwoFactor(
        root,
        TEST_ROOT_ANAMNESIS,
        /\/admin\/clinicas$/,
      );
      await root
        .getByRole("listitem")
        .filter({ hasText: OTHER_CLINIC.name })
        .getByRole("button", { name: "Abrir painel" })
        .click();
      await expect(root).toHaveURL(/\/admin$/);

      await root.goto(`/admin/pacientes/${OTHER_PATIENT.id}`);
      await expect(
        root.getByRole("heading", { name: OTHER_PATIENT.name }),
      ).toBeVisible();
      await expect(
        root.getByRole("heading", { name: "Anamneses" }),
      ).toHaveCount(0);
      await expect(
        root.getByRole("button", { name: "Nova anamnese" }),
      ).toHaveCount(0);

      const form = await rootContext.request.get(anamnesisPath);
      expect(form.status()).toBe(404);
      const pdf = await rootContext.request.get(`${anamnesisPath}/pdf`);
      expect(pdf.status()).toBe(404);
    } finally {
      await rootContext.close();
    }
  });
});
