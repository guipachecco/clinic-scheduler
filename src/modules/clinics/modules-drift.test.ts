import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CLINIC_MODULES, DEFAULT_CLINIC_MODULES } from "./modules";

// The default and the CHECK of clinics.modules are written out in the schema
// and in migrations 0027 (default) and 0040 (check). The default must list
// exactly DEFAULT_CLINIC_MODULES, the check exactly CLINIC_MODULES, in order.
const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const schema = read("src/db/schema/clinic.ts");
const defaultMigration = read("drizzle/0027_clinic_modules.sql");
const checkMigration = read("drizzle/0040_pix_deposit_module.sql");

const asDefault = `{${DEFAULT_CLINIC_MODULES.join(",")}}`;
const asCheck = `ARRAY[${CLINIC_MODULES.map((key) => `'${key}'`).join(", ")}]::text[]`;

describe("clinics.modules default and check", () => {
  it("the schema matches the module lists", () => {
    expect(schema).toContain(`'${asDefault}'`);
    expect(schema).toContain(asCheck);
  });

  it("the migrations match the module lists", () => {
    expect(defaultMigration).toContain(`DEFAULT '${asDefault}'`);
    expect(checkMigration).toContain(asCheck);
  });

  it("a new clinic starts without the Pix deposit", () => {
    expect(DEFAULT_CLINIC_MODULES).not.toContain("pix_deposit");
    expect(CLINIC_MODULES.length - DEFAULT_CLINIC_MODULES.length).toBe(1);
  });
});
