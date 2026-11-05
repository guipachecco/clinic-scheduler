import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/client";
import { clinics, users } from "@/db/schema";
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
  await endPools();
});

describe("clinic branding", () => {
  it("every clinic resolves to zemana", async () => {
    for (const id of [karina, sirlei, nova, CLINIC]) {
      const branding = await getClinicBranding(id);
      expect(branding?.palette.id).toBe("zemana");
    }
  });

  it("keeps display names and area labels", async () => {
    const k = await getClinicBranding(karina);
    expect(k?.displayName).toBe("Karina");
    expect(k?.areaLabel).toBe("Manicure");
    const n = await getClinicBranding(nova);
    expect(n?.displayName).toBe("Clínica Nova");
    expect(n?.areaLabel).toBeNull();
  });

  it("refuses any palette other than zemana", async () => {
    const result = await setClinicPalette(karina, "karina-rosa", actor);
    expect(result.ok).toBe(false);
  });

  it("accepts zemana", async () => {
    expect(await setClinicPalette(sirlei, "zemana", actor)).toEqual({
      ok: true,
    });
  });

  it("a stored legacy palette resolves to zemana", async () => {
    await db
      .update(clinics)
      .set({ theme: { paletteId: "karina-rosa" } })
      .where(eq(clinics.id, karina));
    expect((await getClinicBranding(karina))?.palette.id).toBe("zemana");
  });
});
