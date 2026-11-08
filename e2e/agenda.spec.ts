import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { DateTime } from "luxon";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "../playwright.config";

import { signInWithFreshTwoFactor } from "./helpers";
import { TEST_ADMIN_AGENDA } from "./test-account";

// The calendar page (views, the mobile default and the empty state), then one
// story with fictitious data: create, reschedule by drag, cancel and the
// patient's history.
test.describe.configure({ mode: "serial" });

const FLEXIBLE_SERVICE = "Avaliação / encaixe";
// Seeded by drizzle/0005_flexible_service_seed.sql.
const FLEXIBLE_SERVICE_ID = "00000000-0000-4000-8000-000000000002";
const FIXTURE_PATIENT_ID = "00000000-0000-4000-8000-0000000000a1";
// The first clinic, created by drizzle/0007_multi_clinic.sql.
const CLINIC_ID = "00000000-0000-4000-8000-000000000100";
const FIXTURE_APPOINTMENT_ID = "00000000-0000-4000-8000-0000000000a2";

// A fictitious confirmed appointment today at 10:00 (clinic time), straight
// into the throwaway e2e database.
async function withFixtureAppointment(run: () => Promise<void>) {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `INSERT INTO patients (id, clinic_id, name, name_normalized, phone)
       VALUES ($1, $2, 'Fixture de Teste', 'fixture de teste', '+5511900000001')`,
      [FIXTURE_PATIENT_ID, CLINIC_ID],
    );
    await client.query(
      `WITH slot AS (
         SELECT (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
                 + interval '10 hours') AT TIME ZONE 'America/Sao_Paulo' AS starts_at
       )
       INSERT INTO appointments (id, clinic_id, patient_id, service_id, service_name,
         service_duration_minutes, custom_label, starts_at, ends_at,
         occupied_from, occupied_until, status, source, confirmed_at)
       SELECT $1, $4, $2, $3, 'Avaliação / encaixe', 30, 'Encaixe (teste)',
         starts_at, starts_at + interval '30 minutes',
         starts_at, starts_at + interval '30 minutes',
         'confirmed', 'admin', now()
       FROM slot`,
      [
        FIXTURE_APPOINTMENT_ID,
        FIXTURE_PATIENT_ID,
        FLEXIBLE_SERVICE_ID,
        CLINIC_ID,
      ],
    );
    await run();
  } finally {
    await client.query("DELETE FROM appointments WHERE id = $1", [
      FIXTURE_APPOINTMENT_ID,
    ]);
    await client.query("DELETE FROM patients WHERE id = $1", [
      FIXTURE_PATIENT_ID,
    ]);
    await client.end();
  }
}

let context: BrowserContext;
let page: Page;

function calendar() {
  return page.getByRole("region", { name: "Agenda" });
}

// The view switcher above the calendar.
function views() {
  return page.getByRole("group", { name: "Visualização" });
}

async function setServiceActive(active: boolean) {
  await page.goto("/admin/servicos");
  await page.getByRole("link", { name: FLEXIBLE_SERVICE, exact: true }).click();
  await page.getByLabel("Ativo", { exact: true }).setChecked(active);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page).toHaveURL(/\/admin\/servicos$/);
}

test.describe("agenda", () => {
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    await signInWithFreshTwoFactor(page, TEST_ADMIN_AGENDA);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test("the Agenda link is current and the week view is the default", async () => {
    await page.goto("/admin/agenda");
    const nav = page.getByRole("navigation", { name: "Menu principal" });
    await expect(nav.getByRole("link", { name: "Agenda" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      page.getByRole("link", { name: "Novo agendamento" }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Hoje", exact: true }),
    ).toBeVisible();
    for (const label of ["Dia", "Mês", "Lista"]) {
      await expect(
        views().getByRole("button", { name: label, exact: true }),
      ).toBeVisible();
    }
    await expect(
      views().getByRole("button", { name: "Semana", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(calendar().locator(".fc-timegrid")).toBeVisible();
  });

  test("a confirmed appointment can be dragged and resized on desktop", async () => {
    await withFixtureAppointment(async () => {
      await page.goto("/admin/agenda");
      const event = calendar()
        .locator(".fc-event")
        .filter({ hasText: "Fixture · Encaixe (teste)" });
      await expect(event).toHaveClass(/fc-status-confirmed/);
      await expect(event).toHaveClass(/fc-event-draggable/);
      await expect(event).toHaveClass(/fc-event-resizable/);
      await expect(
        page.getByRole("complementary", { name: "Resumo da agenda" }),
      ).toContainText("Fixture");
    });
    await page.goto("/admin/agenda");
  });

  test("Confirmar and Recusar answer requests from the side panel", async () => {
    const PATIENT_ID = "00000000-0000-4000-8000-0000000000a3";
    const CONFIRM_ID = "00000000-0000-4000-8000-0000000000a4";
    const REFUSE_ID = "00000000-0000-4000-8000-0000000000a5";
    const client = new Client({ connectionString: E2E_DATABASE_URL });
    await client.connect();
    const tomorrow = DateTime.now()
      .setZone("America/Sao_Paulo")
      .startOf("day")
      .plus({ days: 1 });
    try {
      // Two fictitious requests for tomorrow, 09:00 and 10:00 clinic time.
      await client.query(
        `INSERT INTO patients (id, clinic_id, name, name_normalized, phone)
         VALUES ($1, $2, 'Pedido de Teste', 'pedido de teste', '+5511900000003')`,
        [PATIENT_ID, CLINIC_ID],
      );
      for (const [id, hour] of [
        [CONFIRM_ID, 9],
        [REFUSE_ID, 10],
      ] as const) {
        const start = tomorrow.set({ hour }).toUTC().toISO();
        const end = tomorrow.set({ hour, minute: 30 }).toUTC().toISO();
        await client.query(
          `INSERT INTO appointments (id, clinic_id, patient_id, service_id, service_name,
             service_duration_minutes, custom_label, starts_at, ends_at,
             occupied_from, occupied_until, status, source)
           VALUES ($1, $6, $2, $3, 'Avaliação / encaixe', 30, 'Encaixe (teste)',
             $4, $5, $4, $5, 'requested', 'online')`,
          [id, PATIENT_ID, FLEXIBLE_SERVICE_ID, start, end, CLINIC_ID],
        );
      }

      await page.goto("/admin/agenda");
      const nav = page.getByRole("navigation", { name: "Menu principal" });
      await expect(nav.getByRole("link", { name: "Agenda" })).toContainText(
        "2 aguardando confirmação",
      );
      const panel = page.getByRole("region", {
        name: "Aguardando confirmação",
      });
      const items = panel.getByRole("listitem");
      await expect(items).toHaveCount(2);
      await expect(items.first()).toContainText("Pedido");
      await expect(items.first()).toContainText("Encaixe (teste)");

      await items
        .first()
        .getByRole("button", { name: "Confirmar", exact: true })
        .click();
      await expect(page.getByText("Agendamento confirmado.")).toBeVisible();
      await expect(items).toHaveCount(1);

      // Recusar asks first; Voltar keeps the request.
      const last = items.first();
      await last.getByRole("button", { name: "Recusar" }).click();
      await last.getByRole("button", { name: "Voltar" }).click();
      await expect(last.getByRole("button", { name: "Recusar" })).toBeVisible();
      await last.getByRole("button", { name: "Recusar" }).click();
      await last.getByRole("button", { name: "Confirmar recusa" }).click();
      await expect(page.getByText("Solicitação recusada.")).toBeVisible();
      await expect(
        panel.getByText("Nenhuma solicitação pendente."),
      ).toBeVisible();
      await expect(nav.getByRole("link", { name: "Agenda" })).not.toContainText(
        "aguardando",
      );

      const { rows } = await client.query(
        `SELECT id, status, cancellation_reason FROM appointments
         WHERE id IN ($1, $2) ORDER BY starts_at`,
        [CONFIRM_ID, REFUSE_ID],
      );
      expect(rows).toEqual([
        { id: CONFIRM_ID, status: "confirmed", cancellation_reason: null },
        {
          id: REFUSE_ID,
          status: "cancelled",
          cancellation_reason: "clinic_unavailable",
        },
      ]);
    } finally {
      await client.query("DELETE FROM appointments WHERE patient_id = $1", [
        PATIENT_ID,
      ]);
      await client.query("DELETE FROM patients WHERE id = $1", [PATIENT_ID]);
      await client.end();
    }
    await page.goto("/admin/agenda");
  });

  test("the list view shows the empty text", async () => {
    await views().getByRole("button", { name: "Lista", exact: true }).click();
    await expect(
      views().getByRole("button", { name: "Lista", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(calendar().getByText("Nenhum atendimento")).toBeVisible();
  });

  test("the month and day views load without an error", async () => {
    // A range outside the one already loaded asks the server again (a Server
    // Action POST); its answer must be a success.
    const expectLoad = async (action: () => Promise<void>) => {
      const loaded = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/admin/agenda",
      );
      await action();
      const body = await (await loaded).text();
      expect(body).toContain('"ok":true');
    };
    const month = views().getByRole("button", { name: "Mês", exact: true });
    await expectLoad(() => month.click());
    await expect(month).toHaveAttribute("aria-pressed", "true");
    await expectLoad(() =>
      page.getByRole("button", { name: "Próximo mês" }).click(),
    );

    const day = views().getByRole("button", { name: "Dia", exact: true });
    await day.click();
    await expect(day).toHaveAttribute("aria-pressed", "true");
    await expect(calendar().locator(".fc-timegrid")).toBeVisible();
    await expect(page.getByText("Não foi possível carregar")).toHaveCount(0);
  });

  test("a phone shows the day list instead of the calendar", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/agenda");
    await expect(
      page.getByRole("navigation", { name: "Dias da semana" }),
    ).toBeVisible();
    await expect(calendar()).toBeHidden();
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test("without active services the page asks for one", async () => {
    // The seeded flexible service is the only active one; it is turned back
    // on afterwards so the other suites see the catalog as seeded.
    await setServiceActive(false);
    try {
      await page.goto("/admin/agenda");
      await expect(
        page.getByText("Cadastre ao menos um serviço ativo para agendar."),
      ).toBeVisible();
      await expect(
        page.getByRole("main").getByRole("link", { name: "Serviços" }),
      ).toHaveAttribute("href", "/admin/servicos");
      await expect(
        page.getByRole("link", { name: "Novo agendamento" }),
      ).toHaveCount(0);
    } finally {
      await setServiceActive(true);
    }
  });

  test.describe("agendamentos", () => {
    const CATEGORY = "Agenda (teste)";
    const SERVICE = "Consulta (teste agenda)";
    const PATIENT = {
      name: "Marina Agenda Teste",
      phone: "(48) 99999-0042",
      birthDate: "1988-03-15",
    };
    const BLOCKER_PATIENT_ID = "00000000-0000-4000-8000-0000000000b1";
    const BLOCKER_APPOINTMENT_ID = "00000000-0000-4000-8000-0000000000b2";

    // Tomorrow in the clinic zone (Monday when tomorrow is a Sunday, the only
    // closed day here), and the Sunday after it.
    const tomorrow = DateTime.now()
      .setZone("America/Sao_Paulo")
      .startOf("day")
      .plus({ days: 1 });
    const target =
      tomorrow.weekday === 7 ? tomorrow.plus({ days: 1 }) : tomorrow;
    const sunday = target.plus({ days: 7 - target.weekday });
    const TARGET_DATE = target.toFormat("yyyy-MM-dd");
    const TARGET_BR = target.toFormat("dd/MM/yyyy");
    const SUNDAY_DATE = sunday.toFormat("yyyy-MM-dd");

    let appointmentUrl = "";
    let patientUrl = "";

    async function sql(text: string, values: unknown[] = []) {
      const client = new Client({ connectionString: E2E_DATABASE_URL });
      await client.connect();
      try {
        await client.query(text, values);
      } finally {
        await client.end();
      }
    }

    // The first appointment, on the target date. The week starts on Monday,
    // so the Sunday ones can share the week.
    function firstEvent(): Locator {
      return calendar()
        .locator(
          `.fc-timegrid-col[data-date="${TARGET_DATE}"] .fc-timegrid-event`,
        )
        .filter({ hasText: `Marina · ${SERVICE}` });
    }

    // Opens the calendar on the week that holds the target date.
    async function showTargetWeek() {
      await page.goto("/admin/agenda");
      await expect(
        calendar().locator(".fc-timegrid-col").first(),
      ).toBeVisible();
      const column = calendar().locator(
        `.fc-timegrid-col[data-date="${TARGET_DATE}"]`,
      );
      if ((await column.count()) === 0) {
        await page.getByRole("button", { name: "Próxima semana" }).click();
      }
      await expect(column).toBeVisible();
    }

    // Grabs the event near its top edge and drops it with that edge on the
    // slot that starts at `time` on the target date.
    async function dragFirstEventTo(time: string) {
      const event = firstEvent();
      await expect(event).toBeVisible();
      const target = calendar().locator(
        `.fc-timegrid-slot-lane[data-time="${time}:00"]`,
      );
      await target.scrollIntoViewIfNeeded();
      const from = await event.boundingBox();
      const column = await calendar()
        .locator(`.fc-timegrid-col[data-date="${TARGET_DATE}"]`)
        .boundingBox();
      const slot = await target.boundingBox();
      if (!from || !column || !slot) throw new Error("calendar not laid out");
      const startX = from.x + from.width / 2;
      const startY = from.y + 4;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX, startY + 12, { steps: 4 });
      await page.mouse.move(column.x + column.width / 2, slot.y + 4, {
        steps: 12,
      });
      await page.mouse.up();
    }

    async function fillAppointment(date: string, time: string) {
      await page.getByLabel("Buscar paciente").fill("Marina Agenda");
      await page.getByRole("button", { name: "Buscar", exact: true }).click();
      await expect(page.getByText("1 paciente encontrado.")).toBeVisible();
      await page.getByRole("button", { name: /Marina Agenda Teste/ }).click();
      await expect(
        page.getByText(`Paciente: ${PATIENT.name}`, { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Trocar" })).toBeFocused();
      await page.getByLabel("Serviço").selectOption({ label: SERVICE });
      await expect(page.getByLabel("Duração (min)")).toHaveValue("50");
      await page.getByLabel("Data", { exact: true }).fill(date);
      await page.getByLabel("Horário").fill(time);
    }

    test.beforeAll(async () => {
      // Monday to Saturday, 08:00-12:00 and 13:00-18:00; Sunday closed.
      await sql(
        `INSERT INTO business_hours (clinic_id, weekday, start_time, end_time)
         SELECT '00000000-0000-4000-8000-000000000100', d, t.s::time, t.e::time
         FROM generate_series(1, 6) AS d,
              (VALUES ('08:00', '12:00'), ('13:00', '18:00')) AS t(s, e)`,
      );
    });

    // Leaves the shared e2e database as the other suites expect it: no
    // patients, no business hours, only the seeded catalog.
    test.afterAll(async () => {
      await sql(
        `DELETE FROM appointments WHERE patient_id IN (
           SELECT id FROM patients WHERE name = $1 OR id = $2)`,
        [PATIENT.name, BLOCKER_PATIENT_ID],
      );
      await sql("DELETE FROM patients WHERE name = $1 OR id = $2", [
        PATIENT.name,
        BLOCKER_PATIENT_ID,
      ]);
      await sql("DELETE FROM services WHERE name = $1", [SERVICE]);
      await sql("DELETE FROM service_categories WHERE name = $1", [CATEGORY]);
      // Only this clinic's: the client-area clinics keep theirs.
      await sql("DELETE FROM business_hours WHERE clinic_id = $1", [CLINIC_ID]);
    });

    test("sets up a fictitious patient and service", async () => {
      await page.goto("/admin/pacientes/novo");
      await page.getByLabel("Nome completo").fill(PATIENT.name);
      await page.getByLabel("WhatsApp").fill(PATIENT.phone);
      await page.getByLabel("Data de nascimento").fill(PATIENT.birthDate);
      await page.getByRole("button", { name: "Cadastrar paciente" }).click();
      await expect(page).toHaveURL(/\/admin\/pacientes\/[0-9a-f-]{36}$/);
      patientUrl = page.url();

      await page.goto("/admin/servicos");
      await page.getByText("Nova categoria").click();
      await page.getByLabel("Nome da categoria").first().fill(CATEGORY);
      await page.getByRole("button", { name: "Criar categoria" }).click();
      await expect(
        page.getByRole("heading", { name: CATEGORY, level: 2 }),
      ).toBeVisible();

      await page.goto("/admin/servicos/novo");
      await page.getByLabel("Categoria").selectOption({ label: CATEGORY });
      await page.getByLabel("Nome", { exact: true }).fill(SERVICE);
      await page.getByLabel("Duração (min)").fill("50");
      await page
        .getByLabel("Forma de exibir o preço")
        .selectOption("on_request");
      await page.getByRole("button", { name: "Cadastrar serviço" }).click();
      await expect(page).toHaveURL(/\/admin\/servicos$/);
    });

    test("creates an appointment and opens its record", async () => {
      await page.goto("/admin/agenda/novo");
      await expect(
        page.getByRole("link", { name: "Cadastrar paciente" }),
      ).toHaveAttribute(
        "href",
        /^\/admin\/pacientes\/novo\?voltar=agenda&inicio=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
      );
      // The label is only for the flexible service.
      await expect(page.getByLabel("Rótulo")).toHaveCount(0);
      await fillAppointment(TARGET_DATE, "10:00");
      await page.getByRole("button", { name: "Agendar", exact: true }).click();

      await expect(page).toHaveURL(/\/admin\/agenda\/[0-9a-f-]{36}$/);
      appointmentUrl = page.url();
      await expect(page.getByText("Confirmado", { exact: true })).toBeVisible();
      await expect(page.getByText(TARGET_BR)).toBeVisible();
      await expect(page.getByText("10:00–10:50")).toBeVisible();
      await expect(page.getByText("Origem: Painel")).toBeVisible();
      await expect(
        page.getByRole("link", { name: PATIENT.name }),
      ).toHaveAttribute("href", new URL(patientUrl).pathname);
    });

    test("the week view shows it with the patient's first name", async () => {
      await showTargetWeek();
      await expect(firstEvent()).toBeVisible();
      await expect(firstEvent()).toHaveClass(/fc-status-confirmed/);
    });

    test("the same time again is refused with the overlap message", async () => {
      await page.goto(`/admin/agenda/novo?inicio=${TARGET_DATE}T10:00`);
      await expect(page.getByLabel("Data", { exact: true })).toHaveValue(
        TARGET_DATE,
      );
      await expect(page.getByLabel("Horário")).toHaveValue("10:00");
      await fillAppointment(TARGET_DATE, "10:00");
      await page.getByRole("button", { name: "Agendar", exact: true }).click();
      await expect(
        page.getByText(
          "Este horário conflita com outro atendimento das 10:00 às 10:50.",
        ),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/admin\/agenda\/novo/);
    });

    test("a Sunday needs Agendar mesmo assim", async () => {
      await page.goto("/admin/agenda/novo");
      await fillAppointment(SUNDAY_DATE, "10:00");
      await page.getByRole("button", { name: "Agendar", exact: true }).click();
      await expect(page.getByText("Fora do expediente.")).toBeVisible();
      await expect(page).toHaveURL(/\/admin\/agenda\/novo/);
      await expect(page.getByLabel("Agendar mesmo assim")).toBeFocused();

      await page.getByLabel("Agendar mesmo assim").check();
      await page.getByRole("button", { name: "Agendar", exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/agenda\/[0-9a-f-]{36}$/);
      await expect(page.getByText("Confirmado", { exact: true })).toBeVisible();
      const sundayUrl = page.url();

      // Back restores the form page; booking again there creates a new
      // appointment instead of reopening the first one.
      await page.goBack();
      await expect(page).toHaveURL(/\/admin\/agenda\/novo/);
      await fillAppointment(SUNDAY_DATE, "11:00");
      await page.getByRole("button", { name: "Agendar", exact: true }).click();
      await page.getByLabel("Agendar mesmo assim").check();
      await page.getByRole("button", { name: "Agendar", exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/agenda\/[0-9a-f-]{36}$/);
      expect(page.url()).not.toBe(sundayUrl);
      await expect(page.getByText("11:00–11:50")).toBeVisible();
    });

    test("dragging inside business hours reschedules", async () => {
      await showTargetWeek();
      await dragFirstEventTo("11:00");
      await expect(page.getByText("Agendamento remarcado.")).toBeVisible();
      await page.goto(appointmentUrl);
      await expect(page.getByText("11:00–11:50")).toBeVisible();
    });

    test("a drop outside business hours asks first; Desfazer keeps it", async () => {
      await showTargetWeek();
      await dragFirstEventTo("12:00");
      await expect(page.getByText("Este horário tem avisos:")).toBeVisible();
      await expect(page.getByText("Fora do expediente.")).toBeVisible();
      await page.getByRole("button", { name: "Desfazer" }).click();
      await expect(page.getByText("Remarcação desfeita.")).toBeVisible();
      await page.goto(appointmentUrl);
      await expect(page.getByText("11:00–11:50")).toBeVisible();

      await showTargetWeek();
      await dragFirstEventTo("12:00");
      await page.getByRole("button", { name: "Agendar mesmo assim" }).click();
      await expect(page.getByText("Agendamento remarcado.")).toBeVisible();
      await page.goto(appointmentUrl);
      await expect(page.getByText("12:00–12:50")).toBeVisible();
    });

    test("a drop on another appointment is refused and goes back", async () => {
      await sql(
        `INSERT INTO patients (id, clinic_id, name, name_normalized, phone)
         VALUES ($1, $2, 'Fixture de Bloqueio', 'fixture de bloqueio', '+5511900000002')`,
        [BLOCKER_PATIENT_ID, CLINIC_ID],
      );
      await sql(
        `INSERT INTO appointments (id, clinic_id, patient_id, service_id, service_name,
           service_duration_minutes, custom_label, starts_at, ends_at,
           occupied_from, occupied_until, status, source, confirmed_at)
         VALUES ($1, $6, $2, $3, 'Avaliação / encaixe', 30, 'Encaixe (teste)',
           $4, $5, $4, $5, 'confirmed', 'admin', now())`,
        [
          BLOCKER_APPOINTMENT_ID,
          BLOCKER_PATIENT_ID,
          FLEXIBLE_SERVICE_ID,
          target.set({ hour: 15, minute: 0 }).toUTC().toISO(),
          target.set({ hour: 15, minute: 30 }).toUTC().toISO(),
          CLINIC_ID,
        ],
      );
      await showTargetWeek();
      await dragFirstEventTo("15:00");
      await expect(
        page.getByText(
          "Este horário conflita com outro atendimento das 15:00 às 15:30.",
        ),
      ).toBeVisible();
      await expect(firstEvent()).toContainText("12:00");
      await page.goto(appointmentUrl);
      await expect(page.getByText("12:00–12:50")).toBeVisible();
    });

    test("cancelling shows the reason and hides it from the week", async () => {
      await page.goto(appointmentUrl);
      await page.getByRole("button", { name: "Cancelar agendamento" }).click();
      await page
        .getByLabel("Motivo do cancelamento")
        .selectOption({ label: "Pedido do paciente" });
      await page
        .getByRole("button", { name: "Confirmar cancelamento" })
        .click();
      await expect(page.getByText("Agendamento cancelado.")).toBeVisible();
      await expect(page.getByText("Cancelado", { exact: true })).toBeVisible();
      await expect(page.getByText("Motivo: Pedido do paciente")).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Salvar alterações" }),
      ).toHaveCount(0);

      await showTargetWeek();
      await expect(firstEvent()).toHaveCount(0);
      await page.getByLabel("Mostrar cancelados").check();
      await expect(firstEvent()).toBeVisible();
      await expect(firstEvent()).toHaveClass(/fc-status-cancelled/);
    });

    test("the patient record lists the appointment", async () => {
      await page.goto(patientUrl);
      const section = page.getByRole("region", { name: "Atendimentos" });
      await expect(section).toBeVisible();
      await expect(
        section.getByRole("link", { name: /Cancelado/ }),
      ).toHaveAttribute("href", new URL(appointmentUrl).pathname);
      await section.getByRole("link", { name: "Novo agendamento" }).click();
      await expect(page).toHaveURL(/\/admin\/agenda\/novo\?paciente=/);
      await expect(
        page.getByText(`Paciente: ${PATIENT.name}`, { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Trocar" }).click();
      await expect(page.getByLabel("Buscar paciente")).toBeFocused();
    });

    test("Cadastrar paciente returns to the new appointment form", async () => {
      const NEW_NAME = "Beatriz Retorno Teste";
      try {
        await page.goto(`/admin/agenda/novo?inicio=${TARGET_DATE}T15:30`);
        await page.getByRole("link", { name: "Cadastrar paciente" }).click();
        await expect(page).toHaveURL(/\/admin\/pacientes\/novo\?voltar=agenda/);
        await page.getByLabel("Nome completo").fill(NEW_NAME);
        await page.getByLabel("WhatsApp").fill("(48) 99999-0043");
        await page.getByLabel("Data de nascimento").fill("1990-05-20");
        await page.getByRole("button", { name: "Cadastrar paciente" }).click();
        await expect(page).toHaveURL(/\/admin\/agenda\/novo\?paciente=/);
        await expect(
          page.getByText(`Paciente: ${NEW_NAME}`, { exact: true }),
        ).toBeVisible();
        await expect(page.getByLabel("Data", { exact: true })).toHaveValue(
          TARGET_DATE,
        );
        await expect(page.getByLabel("Horário")).toHaveValue("15:30");
      } finally {
        await sql("DELETE FROM patients WHERE name = $1", [NEW_NAME]);
      }
    });

    test("an off-step inicio rounds down to the 5-minute step", async () => {
      await page.goto(`/admin/agenda/novo?inicio=${TARGET_DATE}T10:07`);
      await expect(page.getByLabel("Horário")).toHaveValue("10:05");
    });
  });
});
