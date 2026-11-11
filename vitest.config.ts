import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Database for the integration tests. It is dropped and recreated on every
// run, so its name must end in "_test". In CI the workflow sets TEST_DATABASE_URL.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://clinic:clinic@localhost:5432/clinic_scheduler_test";

// The app roles on that database, with the development passwords "<role>_dev"
// (as tests/helpers/roles.ts builds them; the config loader cannot import it).
function roleUrl(role: string) {
  const url = new URL(TEST_DATABASE_URL);
  url.username = role;
  url.password = `${role}_dev`;
  return url.toString();
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // "server-only" throws outside Next.js's server bundle. Tests run on the
    // server, so they use an empty stand-in.
    alias: {
      "server-only": fileURLToPath(
        new URL("./tests/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    // Values for automated tests only. Real secrets never go in the repository.
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      DATABASE_URL_AUTH: roleUrl("app_auth"),
      DATABASE_URL_PANEL: roleUrl("app_panel"),
      DATABASE_URL_CLIENT: roleUrl("app_client"),
      DATABASE_URL_PLATFORM: roleUrl("app_platform"),
      BETTER_AUTH_SECRET: "segredo-apenas-para-testes-automatizados-0123456789",
      BETTER_AUTH_URL: "http://localhost:3000",
      LOG_LEVEL: "warn",
      // Without MAILERSEND_API_KEY the e-mails the tests send are written here.
      EMAIL_OUTBOX_DIR: path.join(tmpdir(), "clinic-scheduler-test-emails"),
      // Fictitious Mercado Pago application. The tests never call Mercado
      // Pago: they pass a fake fetch.
      MP_CLIENT_ID: "1234567890",
      MP_CLIENT_SECRET: "segredo-ficticio-do-cliente",
      MP_WEBHOOK_SECRET: "segredo-ficticio-do-webhook",
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.{ts,tsx}"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          // The test files share one database.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
