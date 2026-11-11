import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/owner";
import {
  appointments,
  auditLogs,
  clinics,
  expenseCategories,
  patients,
  paymentMethods,
  products,
  reviews,
  serviceCategories,
  services,
  users,
} from "@/db/schema";
import * as panel from "@/modules/clinic-page/panel";
import { createReview, getClinicPage } from "@/modules/clinic-page/public";
import { CLINIC_MODULES } from "@/modules/clinics/modules";
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
// A client with a completed appointment in pageClinic (panel/public tests).
const CLIENT_DOMAIN = "@modulos-t5.example.test";
const PAGE_SLUG = "modulos-t3-pagina";
const client = { userId: "", patientId: "" };

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
  await cleanupPageFixtures();
}

async function cleanupPageFixtures() {
  const ids = (
    await db
      .select({ id: clinics.id })
      .from(clinics)
      .where(eq(clinics.slug, PAGE_SLUG))
  ).map((row) => row.id);
  if (ids.length > 0) {
    await db.delete(reviews).where(inArray(reviews.clinicId, ids));
    await db.delete(appointments).where(inArray(appointments.clinicId, ids));
    await db.delete(products).where(inArray(products.clinicId, ids));
    await db.delete(patients).where(inArray(patients.clinicId, ids));
    await db.delete(services).where(inArray(services.clinicId, ids));
    await db
      .delete(serviceCategories)
      .where(inArray(serviceCategories.clinicId, ids));
  }
  await db.delete(users).where(like(users.email, `%${CLIENT_DOMAIN}`));
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
  pageClinic = await otherClinic(PAGE_SLUG);
  const [row] = await db
    .select()
    .from(clinics)
    .where(eq(clinics.id, pageClinic));
  before = row!;

  const [u] = await db
    .insert(users)
    .values({
      name: "Cliente Fictícia",
      email: `cliente${CLIENT_DOMAIN}`,
      role: "client",
      clinicId: null,
    })
    .returning({ id: users.id });
  client.userId = u!.id;
  const [p] = await db
    .insert(patients)
    .values({
      clinicId: pageClinic,
      userId: u!.id,
      name: "Cliente Fictícia",
      nameNormalized: "cliente ficticia",
      phone: "+5511900005501",
    })
    .returning({ id: patients.id });
  client.patientId = p!.id;
  const [category] = await db
    .insert(serviceCategories)
    .values({
      clinicId: pageClinic,
      name: "Categoria T5",
      slug: "categoria-t5",
    })
    .returning({ id: serviceCategories.id });
  const [service] = await db
    .insert(services)
    .values({
      clinicId: pageClinic,
      categoryId: category!.id,
      name: "Serviço fictício T5",
      slug: "servico-t5",
      durationMinutes: 60,
    })
    .returning({ id: services.id });
  const startsAt = new Date(Date.UTC(2026, 0, 12, 13));
  const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
  await db.insert(appointments).values({
    clinicId: pageClinic,
    patientId: p!.id,
    serviceId: service!.id,
    serviceName: "Serviço fictício T5",
    serviceDurationMinutes: 60,
    startsAt,
    endsAt,
    occupiedFrom: startsAt,
    occupiedUntil: endsAt,
    status: "completed",
    source: "admin",
  });
  await db
    .insert(products)
    .values({ clinicId: pageClinic, name: "Produto T5", priceCents: 1000 });
});

afterAll(async () => {
  await db
    .update(clinics)
    .set({
      modules: before.modules,
      onlineBookingChoice: before.onlineBookingChoice,
      isActive: before.isActive,
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

describe("clinic modules (panel and public page)", () => {
  const withoutProductsAndReviews = CLINIC_MODULES.filter(
    (key) => key !== "products" && key !== "reviews",
  );
  const reviewCtx = () => ({
    clinicId: pageClinic,
    patientId: client.patientId,
    userId: client.userId,
    emailVerified: true,
  });
  const storedReviews = () =>
    db
      .select({ id: reviews.id })
      .from(reviews)
      .where(eq(reviews.clinicId, pageClinic));

  it("public page hides products and reviews while their modules are off", async () => {
    await db
      .update(clinics)
      .set({ modules: [...CLINIC_MODULES], isActive: true })
      .where(eq(clinics.id, pageClinic));
    expect(
      await createReview(reviewCtx(), { rating: 5, comment: null }),
    ).toEqual({ ok: true });
    const on = (await getClinicPage(PAGE_SLUG))!;
    expect(on.products.map((p) => p.name)).toEqual(["Produto T5"]);
    expect(on.reviews).toHaveLength(1);
    expect(on.reviewSummary.total).toBe(1);
    expect(on.modules).toEqual([...CLINIC_MODULES]);

    await db
      .update(clinics)
      .set({ modules: withoutProductsAndReviews })
      .where(eq(clinics.id, pageClinic));
    const off = (await getClinicPage(PAGE_SLUG))!;
    expect(off.products).toEqual([]);
    expect(off.reviews).toEqual([]);
    expect(off.reviewSummary).toEqual({ average: null, total: 0 });
    expect(off.modules).toEqual(withoutProductsAndReviews);
    // Turning a module off never deletes its data.
    expect(await storedReviews()).toHaveLength(1);
  });

  it("client cannot submit a review while reviews module is off", async () => {
    await db
      .update(clinics)
      .set({ modules: withoutProductsAndReviews, isActive: true })
      .where(eq(clinics.id, pageClinic));
    expect(
      await createReview(reviewCtx(), { rating: 4, comment: null }),
    ).toEqual({ ok: false, reason: "module_off" });
    expect(await storedReviews()).toHaveLength(1);
  });
});
