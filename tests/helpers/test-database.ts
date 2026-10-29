import { Client } from "pg";

import { runMigrations } from "../../src/db/migrate";

// Drops and recreates the database, then applies every migration. Refuses to
// touch a database whose name does not end in "_test".
export async function resetDatabase(connectionString: string) {
  const url = new URL(connectionString);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Recusando recriar o banco "${databaseName}": o nome precisa terminar em _test.`,
    );
  }

  url.pathname = "/postgres";
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const identifier = `"${databaseName.replaceAll('"', '""')}"`;
    await client.query(`DROP DATABASE IF EXISTS ${identifier} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${identifier}`);
  } finally {
    await client.end();
  }

  await runMigrations(connectionString);
}
