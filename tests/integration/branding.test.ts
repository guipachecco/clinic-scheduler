import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, pool } from "@/db/client";
import { users } from "@/db/schema";
import {
  getClinicBranding,
  setClinicPalette,
} from "@/modules/branding/branding";
import { createClinic } from "@/modules/clinics/clinics";

import { CLINIC } from "../helpers/clinic";

let actor: string;
let karina: string;
let sirlei: string;
let nova: string;

async function newClinic(name: string, slug: string) {
  const result = await createClinic({ name, slug }, actor);
  if (!result.ok) throw new Error("expected ok");
  return result.id;
}

beforeAll(async () => {
  const [root] = await db
    .insert(users)
    .values({ name: "Root", email: "branding@example.com", role: "root" })
    .returning({ id: users.id });
  actor = root!.id;
  karina = await newClinic("Karina Manicure", "karina-manicure");
  sirlei = await newClinic("Sirlei Massoterapia", "sirlei-massoterapia");
  nova = await newClinic("Clínica Nova", "clinica-nova");
});

afterAll(async () => {
  await pool.end();
});

describe("clinic branding", () => {
  it("a new catalog clinic starts with its first palette and names", async () => {
    const branding = await getClinicBranding(karina);
    expect(branding?.palette.id).toBe("karina-rosa");
    expect(branding?.displayName).toBe("Karina");
    expect(branding?.areaLabel).toBe("Manicure");
    expect(branding?.usesBrandImages).toBe(false);
  });

  it("an unknown clinic starts neutral", async () => {
    const branding = await getClinicBranding(nova);
    expect(branding?.palette.id).toBe("painel");
    expect(branding?.displayName).toBe("Clínica Nova");
    expect(branding?.areaLabel).toBeNull();
  });

  it("refuses a palette of another clinic", async () => {
    const result = await setClinicPalette(karina, "karol-vinho", actor);
    expect(result.ok).toBe(false);
    expect((await getClinicBranding(karina))?.palette.id).toBe("karina-rosa");
  });

  it("changing one clinic never changes another", async () => {
    const result = await setClinicPalette(sirlei, "sirlei-argila", actor);
    expect(result).toEqual({ ok: true });
    expect((await getClinicBranding(sirlei))?.palette.id).toBe("sirlei-argila");
    expect((await getClinicBranding(karina))?.palette.id).toBe("karina-rosa");
  });

  it("grais keeps its brand", async () => {
    const branding = await getClinicBranding(CLINIC);
    expect(branding?.palette.id).toBe("grais");
    expect(branding?.usesBrandImages).toBe(true);
  });
});
