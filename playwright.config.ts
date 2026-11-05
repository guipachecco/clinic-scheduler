import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

// Database for the end-to-end tests. It is dropped and recreated on every
// run, so its name must end in "_test". In CI the workflow sets E2E_DATABASE_URL.
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgres://clinic:clinic@localhost:5432/clinic_scheduler_e2e_test";

// Values for automated tests only. Real secrets never go in the repository.
export const E2E_SERVER_ENV = {
  DATABASE_URL: E2E_DATABASE_URL,
  BETTER_AUTH_SECRET: "segredo-apenas-para-testes-e2e-0123456789abcdef",
  BETTER_AUTH_URL: BASE_URL,
  LOG_LEVEL: "warn",
  NEXT_TELEMETRY_DISABLED: "1",
};

export default defineConfig({
  testDir: "./e2e",
  // The tests share one database and one admin account.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Optional: use an already installed Chromium instead of `playwright install`.
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        },
      },
    },
  ],
  // Runs the production build, the closest to what visitors get.
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 300_000,
    env: E2E_SERVER_ENV,
  },
});
