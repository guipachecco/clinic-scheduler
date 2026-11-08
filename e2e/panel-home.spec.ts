import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { DateTime } from "luxon";
import { Client } from "pg";

import { E2E_DATABASE_URL } from "../playwright.config";

import { signInWithFreshTwoFactor } from "./helpers";
import { PANEL_HOME_CLINIC_SLUG, TEST_ADMIN_PANEL_HOME } from "./test-account";

// The owner's Início: today's numbers, the next client and the day's list, in
// a clinic of its own so no other suite's appointments change the counts.
test.describe.configure({ mode: "serial" });

const ZONE = "America/Sao_Paulo";
const ID = (n: number) =>
  `00000000-0000-4000-8000-0000000b${String(n).padStart(4, "0")}`;
const PATIENTS = {
  done: { id: ID(1), name: "Paciente Concluída Teste" },
  cancelled: { id: ID(2), name: "Paciente Desmarcada Teste" },
  next: { id: ID(3), name: "Paciente Próxima Teste" },
  site: { id: ID(4), name: "Paciente do Site Teste" },
};
const CATEGORY_ID = ID(5);
const SERVICE_ID = ID(6);
const NEXT_APPOINTMENT_ID = ID(13);
const SERVICE_NAME = "Limpeza de pele (início)";

let context: BrowserContext;
let page: Page;
let seeded = false;

async function withOwner<T>(run: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

// Removes only the rows of this suite.
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
}

test.describe("início do painel", () => {
  test.beforeAll(async ({ browser }) => {
    const now = DateTime.now().setZone(ZONE);
    // The scenario needs the upcoming appointments on the same local day.
    seeded = now.hour < 22;
    if (seeded) {
      await withOwner(async (client) => {
        await cleanUp(client);
        const {
          rows: [clinic],
        } = await client.query<{ id: string }>(
          "SELECT id FROM clinics WHERE slug = $1",
          [PANEL_HOME_CLINIC_SLUG],
        );
        const clinicId = clinic!.id;
        await client.query(
          `INSERT INTO service_categories (id, clinic_id, name, slug)
           VALUES ($1, $2, 'Estética (início)', 'estetica-inicio')`,
          [CATEGORY_ID, clinicId],
        );
        await client.query(
          `INSERT INTO services (id, clinic_id, category_id, name, slug,
             duration_minutes, price_cents, price_display, requires_approval,
             online_booking_enabled, is_active)
           VALUES ($1, $2, $3, $4, 'limpeza-inicio', 60, 12000, 'fixed',
             false, true, true)`,
          [SERVICE_ID, clinicId, CATEGORY_ID, SERVICE_NAME],
        );
        for (const [i, p] of Object.values(PATIENTS).entries()) {
          await client.query(
            `INSERT INTO patients (id, clinic_id, name, name_normalized, phone)
             VALUES ($1, $2, $3, $4, $5)`,
            [p.id, clinicId, p.name, p.name.toLowerCase(), `+55119000001${i}0`],
          );
        }
        const today = now.startOf("day");
        const minute = now.startOf("minute");
        const rows = [
          [ID(11), PATIENTS.done.id, today, "completed", "admin", 5],
          [
            ID(12),
            PATIENTS.cancelled.id,
            today.plus({ minutes: 10 }),
            "cancelled",
            "admin",
            5,
          ],
          [
            NEXT_APPOINTMENT_ID,
            PATIENTS.next.id,
            minute.plus({ minutes: 20 }),
            "confirmed",
            "admin",
            60,
          ],
          [
            ID(14),
            PATIENTS.site.id,
            minute.plus({ minutes: 90 }),
            "confirmed",
            "online",
            60,
          ],
        ] as const;
        for (const [id, patient, start, status, source, minutes] of rows) {
          await client.query(
            `INSERT INTO appointments (id, clinic_id, patient_id, service_id,
               service_name, service_duration_minutes, starts_at, ends_at,
               occupied_from, occupied_until, status, source, confirmed_at,
               cancelled_at, cancelled_by)
             VALUES ($1, $2, $3, $4, $5, $10, $6, $7, $6, $7, $8::appointment_status, $9, now(),
               CASE WHEN $8::text = 'cancelled' THEN now() END,
               CASE WHEN $8::text = 'cancelled' THEN 'clinic'::cancellation_actor END)`,
            [
              id,
              clinicId,
              patient,
              SERVICE_ID,
              SERVICE_NAME,
              start.toJSDate(),
              start.plus({ minutes }).toJSDate(),
              status,
              source,
              minutes,
            ],
          );
        }
      });
    }
    context = await browser.newContext();
    page = await context.newPage();
    await signInWithFreshTwoFactor(page, TEST_ADMIN_PANEL_HOME);
  });

  test.afterAll(async () => {
    await context.close();
    await withOwner(cleanUp);
  });

  test("home shows today's numbers, next client and list", async () => {
    test.skip(!seeded, "needs the upcoming appointments on the same local day");
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", {
        name: /^(Bom dia|Boa tarde|Boa noite), Karol/,
      }),
    ).toBeVisible();
    // Three counted appointments: the cancelled one is left out.
    const hoje = page.getByTestId("stat-hoje");
    await expect(hoje).toContainText("3");
    await expect(hoje).toContainText("hoje");
    await expect(page.getByTestId("stat-site")).toContainText("1");
    await expect(page.getByTestId("stat-previsto")).toContainText("R$ 360");

    const next = page.getByRole("region", { name: "Próxima" });
    await expect(next).toContainText(PATIENTS.next.name);
    await expect(next).toContainText(SERVICE_NAME);
    await expect(next.getByRole("link", { name: "Ver ficha" })).toHaveAttribute(
      "href",
      `/admin/pacientes/${PATIENTS.next.id}`,
    );
    await expect(next.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/5511900000120",
    );

    const list = page.getByRole("list", { name: "Atendimentos de hoje" });
    await expect(list.getByRole("listitem")).toHaveCount(4);
    await expect(
      list.getByRole("listitem").filter({ hasText: PATIENTS.cancelled.name }),
    ).toContainText("Desmarcado");
    await expect(
      list.getByRole("listitem").filter({ hasText: PATIENTS.site.name }),
    ).toContainText("Site");
    await expect(
      list.getByRole("link", { name: new RegExp(PATIENTS.next.name) }),
    ).toHaveAttribute("href", `/admin/agenda/${NEXT_APPOINTMENT_ID}`);
    await expect(page.getByRole("link", { name: "Ver agenda" })).toBeVisible();
  });

  test("Agendar does not cover the last list item", async () => {
    test.skip(!seeded, "needs the upcoming appointments on the same local day");
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/admin");
    const button = page.getByRole("link", { name: "Agendar" });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("href", "/admin/agenda/novo");
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    const items = page
      .getByRole("list", { name: "Atendimentos de hoje" })
      .getByRole("listitem");
    const last = (await items.last().boundingBox())!;
    const fab = (await button.boundingBox())!;
    const bar = (await page
      .getByRole("navigation", { name: "Navegação do painel" })
      .boundingBox())!;
    const overlaps =
      last.x < fab.x + fab.width &&
      fab.x < last.x + last.width &&
      last.y < fab.y + fab.height &&
      fab.y < last.y + last.height;
    expect(overlaps).toBe(false);
    // It floats above the bottom bar, not over it.
    expect(fab.y + fab.height).toBeLessThanOrEqual(bar.y);
  });

  test("a large previsto fits its tile at 360 px", async () => {
    test.skip(
      !seeded || DateTime.now().setZone(ZONE).hour >= 21,
      "needs room for extra appointments on the same local day",
    );
    const start = DateTime.now().setZone(ZONE).startOf("minute");
    await withOwner(async (client) => {
      const {
        rows: [clinic],
      } = await client.query<{ id: string }>(
        "SELECT id FROM clinics WHERE slug = $1",
        [PANEL_HOME_CLINIC_SLUG],
      );
      // Eight more priced appointments: 360 + 960 = R$ 1.320.
      for (let i = 0; i < 8; i++) {
        const at = start.plus({ minutes: 160 + i * 5 });
        await client.query(
          `INSERT INTO appointments (id, clinic_id, patient_id, service_id,
             service_name, service_duration_minutes, starts_at, ends_at,
             occupied_from, occupied_until, status, source, confirmed_at)
           VALUES ($1, $2, $3, $4, $5, 5, $6, $7, $6, $7, 'confirmed', 'admin', now())`,
          [
            ID(20 + i),
            clinic!.id,
            PATIENTS.done.id,
            SERVICE_ID,
            SERVICE_NAME,
            at.toJSDate(),
            at.plus({ minutes: 5 }).toJSDate(),
          ],
        );
      }
    });
    try {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto("/admin");
      const tile = page.getByTestId("stat-previsto");
      await expect(tile).toContainText("R$ 1.320");
      const fits = await tile.evaluate((el) =>
        Array.from(el.querySelectorAll("*")).every(
          (child) => child.scrollWidth <= el.clientWidth,
        ),
      );
      expect(fits).toBe(true);
      expect(
        await tile.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(360);
    } finally {
      await withOwner((client) =>
        client.query("DELETE FROM appointments WHERE id = ANY($1)", [
          Array.from({ length: 8 }, (_, i) => ID(20 + i)),
        ]),
      );
    }
  });

  test("old placeholder text is gone", async () => {
    await page.goto("/admin");
    await expect(
      page.getByText("O conteúdo do site chega na próxima etapa"),
    ).toHaveCount(0);
  });

  test("computer has a normal Agendar button at the top", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/admin");
    const button = page.getByRole("link", { name: "Agendar" });
    await expect(button).toBeVisible();
    const box = (await button.boundingBox())!;
    expect(box.y).toBeLessThan(200);
  });
});
