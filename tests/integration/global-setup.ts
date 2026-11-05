import type { TestProject } from "vitest/node";

import { resetDatabase } from "../helpers/test-database";

export default async function setup(project: TestProject) {
  const databaseUrl = project.config.env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error("DATABASE_URL não definida para os testes.");
  await resetDatabase(databaseUrl);
}
