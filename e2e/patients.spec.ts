import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { ageOn, todayInClinic } from "../src/modules/patients/fields";

import { signInWithFreshTwoFactor } from "./helpers";
import { TEST_ADMIN_PATIENTS } from "./test-account";

// One story with fictitious data: register, search, edit and anonymize.
test.describe.configure({ mode: "serial" });

const PATIENT = {
  name: "Paciente Teste Um",
  phone: "(48) 99999-0001",
  birthDate: "1990-05-10",
};

let context: BrowserContext;
let page: Page;
let patientUrl = "";
const requestedUrls: string[] = [];

test.describe("pacientes", () => {
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    page.on("request", (request) => requestedUrls.push(request.url()));
    await signInWithFreshTwoFactor(page, TEST_ADMIN_PATIENTS);
  });

  test.afterAll(async () => {
    await context.close();
  });

  async function fillRequired(name: string) {
    await page.getByLabel("Nome completo").fill(name);
    await page.getByLabel("WhatsApp").fill(PATIENT.phone);
    await page.getByLabel("Data de nascimento").fill(PATIENT.birthDate);
  }

  test("the Pacientes link is the current page in the menu", async () => {
    await page.goto("/admin/pacientes");
    const nav = page.getByRole("navigation", { name: "Menu principal" });
    await expect(nav.getByRole("link", { name: "Pacientes" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page.getByText("Nenhum paciente cadastrado ainda"),
    ).toBeVisible();
  });

  test("registers a patient and opens the record", async () => {
    await page.getByRole("link", { name: "Novo paciente" }).first().click();
    await expect(page).toHaveURL(/\/admin\/pacientes\/novo$/);

    await fillRequired(PATIENT.name);
    await expect(page.getByLabel("Indicado por")).toHaveCount(0);
    await page.getByLabel("Como conheceu").selectOption({ label: "Indicação" });
    await page.getByLabel("Indicado por").fill("Pessoa Indicadora");
    await expect(
      page.getByText("Não registre informações de saúde aqui"),
    ).toBeVisible();
    await page.getByLabel("Observações").fill("Prefere contato à tarde.");
    await page.getByRole("button", { name: "Cadastrar paciente" }).click();

    await expect(page).toHaveURL(/\/admin\/pacientes\/[0-9a-f-]{36}$/);
    patientUrl = page.url();
    await expect(
      page.getByRole("heading", { name: PATIENT.name }),
    ).toBeVisible();
    const age = ageOn(PATIENT.birthDate, todayInClinic());
    await expect(page.getByText(`${age} anos`)).toBeVisible();
  });

  test("searches without putting the term in the URL", async () => {
    await page.goto("/admin/pacientes");
    await page.getByLabel("Buscar paciente").fill("teste um");
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(
      page.getByRole("link", { name: new RegExp(PATIENT.name) }),
    ).toBeVisible();

    expect(new URL(page.url()).pathname).toBe("/admin/pacientes");
    expect(new URL(page.url()).search).toBe("");
    expect(requestedUrls.filter((url) => /teste/i.test(url))).toEqual([]);

    await page.getByLabel("Buscar paciente").fill("ninguem assim");
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page.getByText("Nenhum paciente encontrado")).toBeVisible();
  });

  test("edits the nickname", async () => {
    await page.goto(patientUrl);
    await page.getByLabel("Apelido").fill("Pacu");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Apelido: Pacu")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Apelido")).toHaveValue("Pacu");
  });

  test("a duplicate WhatsApp and name links to the existing record", async () => {
    await page.goto("/admin/pacientes/novo");
    await fillRequired(PATIENT.name);
    await page.getByRole("button", { name: "Cadastrar paciente" }).click();

    await expect(
      page.getByText("Já existe um paciente com este WhatsApp e nome."),
    ).toBeVisible();
    const link = page.getByRole("link", { name: "Ver cadastro existente" });
    await expect(link).toHaveAttribute("href", new URL(patientUrl).pathname);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Já existe um paciente com estes dados." }),
    ).toBeVisible();
    await expect(page.getByLabel("WhatsApp")).toBeFocused();
  });

  test("CPF and WhatsApp are formatted while typing", async () => {
    await page.goto("/admin/pacientes/novo");
    await page.getByLabel("CPF").pressSequentially("52998224725");
    await expect(page.getByLabel("CPF")).toHaveValue("529.982.247-25");
    // Backspace never gets stuck on the separators.
    await page.getByLabel("CPF").press("Backspace");
    await page.getByLabel("CPF").press("Backspace");
    await page.getByLabel("CPF").press("Backspace");
    await expect(page.getByLabel("CPF")).toHaveValue("529.982.24");
    await page.getByLabel("CPF").pressSequentially("725");
    await expect(page.getByLabel("CPF")).toHaveValue("529.982.247-25");
    await page.getByLabel("WhatsApp").pressSequentially("48999990001");
    await expect(page.getByLabel("WhatsApp")).toHaveValue("(48) 99999-0001");
    await page.getByLabel("Telefone fixo").pressSequentially("4833331234");
    await expect(page.getByLabel("Telefone fixo")).toHaveValue(
      "(48) 3333-1234",
    );
  });

  test("the record shows stored values formatted", async () => {
    await page.goto(patientUrl);
    await expect(page.getByLabel("WhatsApp")).toHaveValue(PATIENT.phone);
  });

  test("anonymizing is optional, tucked in a closed section", async () => {
    await page.goto(patientUrl);
    const summary = page.getByText("Anonimizar paciente (LGPD)");
    await expect(summary).toBeVisible();
    await expect(page.getByLabel(/Digite ANONIMIZAR/)).toBeHidden();
  });

  test("anonymizing needs the exact confirmation word and keeps the record", async () => {
    await page.goto(patientUrl);
    await page.getByText("Anonimizar paciente (LGPD)").click();
    const button = page.getByRole("button", { name: "Anonimizar paciente" });
    await expect(button).toBeDisabled();
    await page.getByLabel(/Digite ANONIMIZAR/).fill("anonimizar");
    await expect(button).toBeDisabled();
    await page.getByLabel(/Digite ANONIMIZAR/).fill("ANONIMIZAR");
    await expect(button).toBeEnabled();
    await button.click();

    await expect(page).toHaveURL(patientUrl);
    await expect(
      page.getByRole("heading", { name: "Paciente anonimizado" }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toContainText(
      "Dados pessoais apagados em",
    );
    await expect(page.getByRole("status")).toContainText(
      "O histórico de agendamentos é mantido.",
    );
    await expect(page.getByLabel("Nome completo")).toHaveCount(0);
    await expect(page.getByText("Anonimizar paciente (LGPD)")).toHaveCount(0);

    await page.goto("/admin/pacientes");
    const row = page.getByRole("link", { name: /Paciente anonimizado/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("Anonimizado", { exact: true })).toBeVisible();
    await page.getByLabel("Buscar paciente").fill("teste um");
    await page.getByRole("button", { name: "Buscar" }).click();
    await expect(page.getByText("Nenhum paciente encontrado")).toBeVisible();
  });
});
