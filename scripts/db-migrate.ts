import { runMigrations } from "../src/db/migrate";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Defina DATABASE_URL (veja o .env.example).");
  }
  await runMigrations(databaseUrl);
  console.log("Migrações aplicadas.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
