import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Database for the integration tests. It is dropped and recreated on every
// run, so its name must end in "_test". In CI the workflow sets TEST_DATABASE_URL.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://clinic:clinic@localhost:5432/clinic_scheduler_test";

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
      BETTER_AUTH_SECRET: "segredo-apenas-para-testes-automatizados-0123456789",
      BETTER_AUTH_URL: "http://localhost:3000",
      LOG_LEVEL: "warn",
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
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
