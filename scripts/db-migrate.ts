import { runMigrations } from "../src/db/migrate";
import { roleUrlsFromEnv } from "../src/db/roles";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Defina DATABASE_URL (veja o .env.example).");
  }
  // With DATABASE_URL_AUTH, _PANEL, _CLIENT and _PLATFORM set, also sets
  // each app role's login password from its URL.
  await runMigrations(databaseUrl, roleUrlsFromEnv(process.env));
  console.log("Migrações aplicadas.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
