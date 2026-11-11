import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/owner";
import {
  auditLogs,
  clinics,
  expenseCategories,
  paymentMethods,
  serviceCategories,
  services,
  users,
} from "@/db/schema";
import * as panel from "@/modules/clinic-page/panel";
import {
  createClinic,
  getClinic,
  getClinicForEdit,
  updateClinic,
} from "@/modules/clinics/clinics";

import { otherClinic } from "../helpers/clinic";

// Root creating and editing a clinic with its modules and type. Every record
// is fictitious.

const SLUG = "modulos-t3-teste";
let actor: string;
let createdId: string;
let pageClinic: string;
let before: typeof clinics.$inferSelect;

async function cleanup() {
  const rows = await db
    .select({ id: clinics.id })
    .from(clinics)
    .where(eq(clinics.slug, SLUG));
  for (const { id } of rows) {
    await db.delete(auditLogs).where(eq(auditLogs.clinicId, id));
    await db.delete(services).where(eq(services.clinicId, id));
    await db
      .delete(serviceCategories)
      .where(eq(serviceCategories.clinicId, id));
    await db.delete(paymentMethods).where(eq(paymentMethods.clinicId, id));
    await db
      .delete(expenseCategories)
      .where(eq(expenseCategories.clinicId, id));
  }
  await db.delete(clinics).where(eq(clinics.slug, SLUG));
  await db.delete(users).where(like(users.email, "%@modulos-t3.example.test"));
}

beforeAll(async () => {
  await cleanup();
  const [user] = await db
    .insert(users)
    .values({
      name: "Root Fictício",
      email: "root@modulos-t3.example.test",
      role: "root",
    })
    .returning({ id: users.id });
  actor = user!.id;
  pageClinic = await otherClinic("modulos-t3-pagina");
  const [row] = await db
    .select()
    .from(clinics)
    .where(eq(clinics.id, pageClinic));
  before = row!;
});

afterAll(async () => {
  await db
    .update(clinics)
    .set({
      modules: before.modules,
      onlineBookingChoice: before.onlineBookingChoice,
    })
    .where(eq(clinics.id, pageClinic));
  await cleanup();
  await endPools();
});

describe("clinic modules (root)", () => {
  it("createClinic stores the chosen modules and type", async () => {
    const result = await createClinic(
      {
        name: "Clínica Módulos",
        slug: SLUG,
        businessType: "nail_salon",
        modules: ["finance"],
      },
      actor,
    );
    expect(result.ok).toBe(true);
    createdId = (result as { id: string }).id;
    const clinic = await getClinic(createdId);
    expect(clinic?.modules).toEqual(["finance"]);
    expect(clinic?.businessType).toBe("nail_salon");
  });

  it("updateClinic changes modules and type and audits it", async () => {
    const result = await updateClinic(
      createdId,
      { name: "Clínica Módulos 2", businessType: "clinic", modules: [] },
      actor,
    );
    expect(result).toEqual({ ok: true, id: createdId });
    const edit = await getClinicForEdit(createdId);
    expect(edit).toMatchObject({
      slug: SLUG,
      name: "Clínica Módulos 2",
      businessType: "clinic",
      modules: [],
    });
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.clinicId, createdId));
    const log = logs.find((l) => l.action === "clinic.updated");
    expect(log).toBeDefined();
    expect(JSON.stringify(log)).toContain("nail_salon");
  });

  it("updateClinic reports a missing clinic", async () => {
    expect(
      await updateClinic(
        "00000000-0000-4000-8000-000000000000",
        { name: "X", businessType: "clinic", modules: [] },
        actor,
      ),
    ).toMatchObject({ ok: false });
  });

  it("saving the page keeps the owner's online booking choice while the module is off", async () => {
    await db
      .update(clinics)
      .set({ onlineBookingChoice: true, modules: ["finance"] })
      .where(eq(clinics.id, pageClinic));
    const settings = await panel.getClinicPageSettings(pageClinic);
    expect(settings?.onlineBookingEnabled).toBe(true);
    await panel.updateClinicPage(pageClinic, {
      whatsappPhone: settings!.whatsappPhone,
      contactEmail: settings!.contactEmail,
      address: settings!.address,
      mapsUrl: settings!.mapsUrl,
      instagramHandle: settings!.instagramHandle,
      amenities: settings!.amenities,
      onlineBookingEnabled: settings!.onlineBookingEnabled,
    });
    const [row] = await db
      .select()
      .from(clinics)
      .where(eq(clinics.id, pageClinic));
    expect(row!.onlineBookingChoice).toBe(true);
    expect(row!.onlineBookingEnabled).toBe(false);
  });
});
