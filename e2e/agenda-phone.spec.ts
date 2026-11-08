import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { DateTime } from "luxon";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "../playwright.config";

import { signInWithFreshTwoFactor } from "./helpers";
import {
  PANEL_HOME_CLINIC_SLUG,
  TEST_ADMIN_AGENDA_PHONE,
} from "./test-account";

// The owner's agenda as a day list on a phone. It runs in the panel home
// clinic, on a weekday far in the future so no other suite is disturbed.
test.describe.configure({ mode: "serial" });

const ZONE = "America/Sao_Paulo";
const ID = (n: number) =>
  `00000000-0000-4000-8000-0000000c${String(n).padStart(4, "0")}`;
const PATIENTS = {
  first: { id: ID(1), name: "Paciente Manhã Celular" },
  second: { id: ID(2), name: "Paciente Tarde Celular" },
};
const CATEGORY_ID = ID(5);
const SERVICE_ID = ID(6);
const SERVICE_NAME = "Massagem (agenda celular)";

// A Wednesday 3 to 4 weeks ahead, as yyyy-MM-dd.
const DAY = DateTime.now()
  .setZone(ZONE)
  .plus({ days: 21 })
  .startOf("week")
  .plus({ days: 2 });
const DATE = DAY.toISODate()!;
const NEXT_WEEK = DAY.plus({ days: 7 }).toISODate()!;
const PREVIOUS_WEEK = DAY.minus({ days: 7 }).toISODate()!;

let context: BrowserContext;
let page: Page;
let clinicId = "";

async function withOwner<T>(run: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function cleanUp(client: Client) {
  const ids = Object.values(PATIENTS).map((p) => p.id);
  await client.query("DELETE FROM appointments WHERE patient_id = ANY($1)", [
    ids,
  ]);
  await client.query("DELETE FROM patients WHERE id = ANY($1)", [ids]);
  await client.query("DELETE FROM services WHERE id = $1", [SERVICE_ID]);
  await client.query("DELETE FROM service_categories WHERE id = $1", [
    CATEGORY_ID,
  ]);
  await client.query(
    `DELETE FROM business_hours WHERE clinic_id IN
       (SELECT id FROM clinics WHERE slug = $1)`,
    [PANEL_HOME_CLINIC_SLUG],
  );
}

test.describe("agenda do celular", () => {
  test.beforeAll(async ({ browser }) => {
    await withOwner(async (client) => {
      await cleanUp(client);
      const {
        rows: [clinic],
      } = await client.query<{ id: string }>(
        "SELECT id FROM clinics WHERE slug = $1",
        [PANEL_HOME_CLINIC_SLUG],
      );
      clinicId = clinic!.id;
      // Every weekday: 09-12 and 13-18 (lunch is not free time).
      for (let weekday = 0; weekday < 7; weekday++) {
        for (const [start, end] of [
          ["09:00", "12:00"],
          ["13:00", "18:00"],
        ]) {
          await client.query(
            `INSERT INTO business_hours (clinic_id, weekday, start_time, end_time)
             VALUES ($1, $2, $3, $4)`,
            [clinicId, weekday, start, end],
          );
        }
      }
      await client.query(
        `INSERT INTO service_categories (id, clinic_id, name, slug)
         VALUES ($1, $2, 'Estética (agenda celular)', 'estetica-agenda-celular')`,
        [CATEGORY_ID, clinicId],
      );
      await client.query(
        `INSERT INTO services (id, clinic_id, category_id, name, slug,
           duration_minutes, price_cents, price_display, requires_approval,
           online_booking_enabled, is_active)
         VALUES ($1, $2, $3, $4, 'massagem-agenda-celular', 60, 9000, 'fixed',
           false, true, true)`,
        [SERVICE_ID, clinicId, CATEGORY_ID, SERVICE_NAME],
      );
      for (const [i, p] of Object.values(PATIENTS).entries()) {
        await client.query(
          `INSERT INTO patients (id, clinic_id, name, name_normalized, phone)
           VALUES ($1, $2, $3, $4, $5)`,
          [p.id, clinicId, p.name, p.name.toLowerCase(), `+55119100001${i}0`],
        );
      }
      const rows = [
        [ID(11), PATIENTS.first.id, "10:00"],
        [ID(12), PATIENTS.second.id, "14:00"],
      ] as const;
      for (const [id, patient, time] of rows) {
        const start = DateTime.fromISO(`${DATE}T${time}`, { zone: ZONE });
        await client.query(
          `INSERT INTO appointments (id, clinic_id, patient_id, service_id,
             service_name, service_duration_minutes, starts_at, ends_at,
             occupied_from, occupied_until, status, source, confirmed_at)
           VALUES ($1, $2, $3, $4, $5, 60, $6, $7, $6, $7, 'confirmed', 'admin', now())`,
          [
            id,
            clinicId,
            patient,
            SERVICE_ID,
            SERVICE_NAME,
            start.toJSDate(),
            start.plus({ minutes: 60 }).toJSDate(),
          ],
        );
      }
    });
    context = await browser.newContext();
    page = await context.newPage();
    await signInWithFreshTwoFactor(page, TEST_ADMIN_AGENDA_PHONE);
  });

  test.afterAll(async () => {
    await context.close();
    await withOwner(cleanUp);
  });

  test("phone agenda lists the chosen day with free intervals", async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/admin/agenda?dia=${DATE}`);
    const list = page.getByRole("list", { name: "Atendimentos do dia" });
    const rows = list.getByRole("listitem");
    await expect(rows).toHaveCount(6);
    const texts = await rows.allTextContents();
    const order = [
      "Livre das 09:00 às 10:00",
      PATIENTS.first.name,
      "Livre das 11:00 às 12:00",
      "Livre das 13:00 às 14:00",
      PATIENTS.second.name,
      "Livre das 15:00 às 18:00",
    ];
    order.forEach((text, i) => expect(texts[i]).toContain(text));

    const free = list.getByRole("link", { name: /Livre das 09:00 às 10:00/ });
    await expect(free).toContainText("tocar para agendar");
    await expect(free).toHaveAttribute(
      "href",
      `/admin/agenda/novo?inicio=${DATE}T09:00`,
    );
    // Lunch (12:00-13:00) is never free time.
    await expect(list.getByRole("link", { name: /Livre das 12:/ })).toHaveCount(
      0,
    );
    await expect(list.getByRole("link", { name: /às 13:00/ })).toHaveCount(0);

    const fab = page.getByRole("link", { name: "Agendar", exact: true });
    await expect(fab).toBeVisible();
    await expect(fab).toHaveAttribute("href", "/admin/agenda/novo");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(360);
  });

  test("day strip moves by week and marks days", async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/admin/agenda?dia=${DATE}`);
    const strip = page.getByRole("navigation", { name: "Dias da semana" });
    await expect(strip).toContainText(
      DAY.setLocale("pt-BR").toFormat("LLLL 'de' yyyy"),
    );
    await expect(strip.locator('[data-has-appointments="true"]')).toHaveCount(
      1,
    );
    await expect(strip.locator('a[aria-current="date"]')).toHaveAttribute(
      "href",
      `/admin/agenda?dia=${DATE}`,
    );
    await expect(
      strip.getByRole("link", { name: "Semana anterior" }),
    ).toHaveAttribute("href", `/admin/agenda?dia=${PREVIOUS_WEEK}`);

    await strip.getByRole("link", { name: "Próxima semana" }).click();
    await expect(page).toHaveURL(new RegExp(`dia=${NEXT_WEEK}$`));
    await expect(strip.locator('[data-has-appointments="true"]')).toHaveCount(
      0,
    );
    await strip.getByRole("link", { name: "Semana anterior" }).click();
    await expect(page).toHaveURL(new RegExp(`dia=${DATE}$`));
    await expect(strip.locator('[data-has-appointments="true"]')).toHaveCount(
      1,
    );
  });

  test("computer still shows the calendar", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/admin/agenda?dia=${DATE}`);
    await expect(page.getByRole("region", { name: "Agenda" })).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Atendimentos do dia" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Dias da semana" }),
    ).toHaveCount(0);
  });

  test("invalid dia falls back to today", async () => {
    await page.setViewportSize({ width: 360, height: 800 });
    const today = DateTime.now().setZone(ZONE).toISODate()!;
    for (const bad of ["abc", "2026-13-45", "2026-02-30"]) {
      await page.goto(`/admin/agenda?dia=${bad}`);
      const strip = page.getByRole("navigation", { name: "Dias da semana" });
      await expect(strip.locator('a[aria-current="date"]')).toHaveAttribute(
        "href",
        `/admin/agenda?dia=${today}`,
      );
    }
  });

  test("a closed day says Fechado", async () => {
    await withOwner((client) =>
      client.query(
        `DELETE FROM business_hours WHERE clinic_id = $1 AND weekday = 3`,
        [clinicId],
      ),
    );
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/admin/agenda?dia=${DATE}`);
    await expect(page.getByText("Fechado", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Livre das/ })).toHaveCount(0);
  });
});
