import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CLINIC_MODULES } from "./modules";

// The default and the CHECK of clinics.modules are written out in the schema
// and in migration 0027. They must list exactly CLINIC_MODULES, in order.
const root = process.cwd();
const schema = readFileSync(join(root, "src/db/schema/clinic.ts"), "utf8");
const migration = readFileSync(
  join(root, "drizzle/0027_clinic_modules.sql"),
  "utf8",
);

const asDefault = `{${CLINIC_MODULES.join(",")}}`;
const asCheck = `ARRAY[${CLINIC_MODULES.map((key) => `'${key}'`).join(", ")}]::text[]`;

describe("clinics.modules default and check", () => {
  it("the schema matches CLINIC_MODULES", () => {
    expect(schema).toContain(`'${asDefault}'`);
    expect(schema).toContain(asCheck);
  });

  it("migration 0027 matches CLINIC_MODULES", () => {
    expect(migration).toContain(`DEFAULT '${asDefault}'`);
    expect(migration).toContain(asCheck);
  });
});
