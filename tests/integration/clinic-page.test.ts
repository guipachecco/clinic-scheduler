import { eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/owner";
import {
  appointments,
  clinics,
  loyaltyRedemptions,
  patients,
  paymentMethods,
  products,
  reviews,
  serviceCategories,
  services,
  users,
} from "@/db/schema";
import type { BookingContext } from "@/modules/booking/booking";
import * as panel from "@/modules/clinic-page/panel";
import {
  canReview,
  createReview,
  getClinicPage,
  getLoyaltyProgress,
  getOwnerPhoto,
} from "@/modules/clinic-page/public";

import { CLINIC, otherClinic } from "../helpers/clinic";

// The clinic page module (public reads, client writes, owner panel). Every
// record is fictitious; e-mails end in @modulo-pagina.example.test and the
// other rows carry "Modulo Pagina" so the cleanup touches only them.

const DOMAIN = "@modulo-pagina.example.test";
const TAG = "Modulo Pagina";
const MINUTE = 60_000;
const SPARE_SLUG = "clinica-modulo-pagina";

let slug: string;
let original: typeof clinics.$inferSelect;
let serviceId: string;
let actor: string;
const user = { ana: "", bia: "" };
const patient = { ana: "", bia: "" };

const ctx = (who: keyof typeof user): BookingContext => ({
  clinicId: CLINIC,
  patientId: patient[who],
  userId: user[who],
  emailVerified: true,
});

function completed(patientId: string, day: number) {
  const startsAt = new Date(Date.UTC(2026, 0, day, 13));
  const endsAt = new Date(startsAt.getTime() + 60 * MINUTE);
  return {
    clinicId: CLINIC,
    patientId,
    serviceId,
    serviceName: "Serviço fictício módulo",
    serviceDurationMinutes: 60,
    startsAt,
    endsAt,
    occupiedFrom: startsAt,
    occupiedUntil: endsAt,
    status: "completed" as const,
    source: "admin" as const,
  };
}

async function cleanup() {
  const userIds = (
    await db
      .select({ id: users.id })
      .from(users)
      .where(like(users.email, `%${DOMAIN}`))
  ).map((row) => row.id);
  if (userIds.length > 0) {
    const patientIds = (
      await db
        .select({ id: patients.id })
        .from(patients)
        .where(inArray(patients.userId, userIds))
    ).map((row) => row.id);
    if (patientIds.length > 0) {
      await db.delete(reviews).where(inArray(reviews.patientId, patientIds));
      await db
        .delete(loyaltyRedemptions)
        .where(inArray(loyaltyRedemptions.patientId, patientIds));
      await db
        .delete(appointments)
        .where(inArray(appointments.patientId, patientIds));
      await db.delete(patients).where(inArray(patients.id, patientIds));
    }
    await db.delete(users).where(inArray(users.id, userIds));
  }
  await db.delete(products).where(like(products.name, `%${TAG}%`));
  const [spare] = await db
    .select({ id: clinics.id })
    .from(clinics)
    .where(eq(clinics.slug, SPARE_SLUG));
  if (spare) await db.delete(products).where(eq(products.clinicId, spare.id));
  await db.delete(paymentMethods).where(like(paymentMethods.name, `%${TAG}%`));
  await db.delete(services).where(eq(services.slug, "servico-modulo-pagina"));
  await db
    .delete(serviceCategories)
    .where(eq(serviceCategories.slug, "categoria-modulo-pagina"));
}

beforeAll(async () => {
  await cleanup();
  const [clinic] = await db
    .select()
    .from(clinics)
    .where(eq(clinics.id, CLINIC));
  original = clinic!;
  slug = original.slug;
  await db
    .update(clinics)
    .set({
      amenities: ["wifi", "aceita_pets"],
      instagramHandle: "zemana.teste",
      loyaltyEnabled: true,
      loyaltyVisits: 2,
      loyaltyReward: "Brinde fictício",
    })
    .where(eq(clinics.id, CLINIC));

  const [admin] = await db
    .insert(users)
    .values({
      name: `Admin ${TAG}`,
      email: `admin${DOMAIN}`,
      role: "client",
      clinicId: null,
    })
    .returning({ id: users.id });
  actor = admin!.id;
  for (const who of ["ana", "bia"] as const) {
    const [u] = await db
      .insert(users)
      .values({
        name: `Cliente ${who}`,
        email: `${who}${DOMAIN}`,
        role: "client",
        clinicId: null,
      })
      .returning({ id: users.id });
    user[who] = u!.id;
    const name = who === "ana" ? `Ana ${TAG} Souza` : `Bia ${TAG}`;
    const [p] = await db
      .insert(patients)
      .values({
        clinicId: CLINIC,
        userId: u!.id,
        name,
        nameNormalized: name.toLowerCase(),
        phone: who === "ana" ? "+5511900004401" : "+5511900004402",
      })
      .returning({ id: patients.id });
    patient[who] = p!.id;
  }
  const [category] = await db
    .insert(serviceCategories)
    .values({
      clinicId: CLINIC,
      name: "Categoria módulo página",
      slug: "categoria-modulo-pagina",
    })
    .returning({ id: serviceCategories.id });
  const [service] = await db
    .insert(services)
    .values({
      clinicId: CLINIC,
      categoryId: category!.id,
      name: "Serviço fictício módulo",
      slug: "servico-modulo-pagina",
      durationMinutes: 60,
      isActive: true,
    })
    .returning({ id: services.id });
  serviceId = service!.id;
  await db.insert(appointments).values([completed(patient.ana, 10)]);
  await db
    .insert(paymentMethods)
    .values({ clinicId: CLINIC, name: `Pix ${TAG}` });
  await db.insert(products).values([
    { clinicId: CLINIC, name: `Ativo ${TAG}`, priceCents: 1000 },
    { clinicId: CLINIC, name: `Inativo ${TAG}`, isActive: false },
  ]);
});

afterAll(async () => {
  await db
    .update(clinics)
    .set({
      amenities: original.amenities,
      instagramHandle: original.instagramHandle,
      loyaltyEnabled: original.loyaltyEnabled,
      loyaltyVisits: original.loyaltyVisits,
      loyaltyReward: original.loyaltyReward,
      headline: original.headline,
      about: original.about,
      whatsappPhone: original.whatsappPhone,
      contactEmail: original.contactEmail,
      address: original.address,
      mapsUrl: original.mapsUrl,
      onlineBookingEnabled: original.onlineBookingEnabled,
    })
    .where(eq(clinics.id, CLINIC));
  await cleanup();
  await endPools();
});

describe("clinic page module", () => {
  it("returns null for an unknown slug", async () => {
    expect(await getClinicPage("nao-existe")).toBeNull();
    expect(await getOwnerPhoto("nao-existe")).toBeNull();
  });

  it("reviews need a completed appointment", async () => {
    expect(await canReview(ctx("ana"))).toBe(true);
    expect(await canReview(ctx("bia"))).toBe(false);
    expect(
      await createReview(ctx("bia"), { rating: 4, comment: null }),
    ).toEqual({ ok: false, reason: "not_allowed" });
    expect(
      await createReview(ctx("ana"), { rating: 5, comment: "Muito bom" }),
    ).toEqual({ ok: true });
    expect(
      await createReview(ctx("ana"), { rating: 9, comment: null }),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("assembles the public page", async () => {
    const page = (await getClinicPage(slug))!;
    expect(page.amenities).toEqual(["wifi", "aceita_pets"]);
    expect(page.instagramHandle).toBe("zemana.teste");
    expect(page.paymentMethods).toContain(`Pix ${TAG}`);
    expect(page.products.map((p) => p.name)).toEqual([`Ativo ${TAG}`]);
    expect(page.loyalty).toEqual({ visits: 2, reward: "Brinde fictício" });
    expect(page.hours).toHaveLength(7);
    expect(page.reviewSummary).toEqual({ average: 5, total: 1 });
    expect(page.reviews[0]).toMatchObject({
      rating: 5,
      comment: "Muito bom",
      author: "Ana S.",
    });
  });

  it("hides a review from the page", async () => {
    const [review] = await panel.listReviews(CLINIC);
    expect(review!.patientName).toContain("Ana");
    await panel.setReviewHidden(CLINIC, review!.id, true, actor);
    const page = (await getClinicPage(slug))!;
    expect(page.reviews).toHaveLength(0);
    expect(page.reviewSummary).toEqual({ average: null, total: 0 });
    await panel.setReviewHidden(CLINIC, review!.id, false, actor);
    expect((await getClinicPage(slug))!.reviews).toHaveLength(1);
  });

  it("adds the example products once", async () => {
    const throwaway = await otherClinic(SPARE_SLUG);
    expect(await panel.addExampleProducts(throwaway)).toBe(3);
    expect(await panel.addExampleProducts(throwaway)).toBe(0);
    const list = await panel.listProducts(throwaway);
    expect(list.map((p) => p.priceCents).sort()).toEqual([6990, 7990, 9500]);
  });

  it("redeems loyalty only with a prize", async () => {
    expect(await getLoyaltyProgress(ctx("ana"), 2)).toEqual({
      stamps: 1,
      prize: false,
    });
    expect(await panel.redeemLoyalty(CLINIC, patient.ana, actor)).toEqual({
      ok: false,
      reason: "no_prize",
    });
    await db
      .insert(appointments)
      .values([
        completed(patient.ana, 11),
        completed(patient.ana, 12),
        completed(patient.ana, 13),
      ]);
    expect(await getLoyaltyProgress(ctx("ana"), 2)).toEqual({
      stamps: 2,
      prize: true,
    });
    expect(await panel.getPatientLoyalty(CLINIC, patient.ana)).toMatchObject({
      enabled: true,
      stamps: 2,
      prize: true,
    });
    expect(await panel.redeemLoyalty(CLINIC, patient.ana, actor)).toEqual({
      ok: true,
    });
    expect(await getLoyaltyProgress(ctx("ana"), 2)).toEqual({
      stamps: 2,
      prize: true,
    });
    expect(await panel.redeemLoyalty(CLINIC, patient.ana, actor)).toEqual({
      ok: true,
    });
    expect(await panel.getPatientLoyalty(CLINIC, patient.ana)).toMatchObject({
      stamps: 0,
      prize: false,
    });
    expect(await panel.redeemLoyalty(CLINIC, patient.ana, actor)).toEqual({
      ok: false,
      reason: "no_prize",
    });
  });

  it("updates the page and loyalty settings", async () => {
    await panel.updateClinicPage(CLINIC, {
      headline: "Olá",
      about: null,
      whatsappPhone: null,
      contactEmail: null,
      address: null,
      mapsUrl: "https://maps.example.test/x",
      instagramHandle: "outro",
      amenities: ["banheiro"],
      onlineBookingEnabled: original.onlineBookingEnabled,
    });
    await panel.updateLoyalty(CLINIC, {
      enabled: true,
      visits: 5,
      reward: "Outro brinde",
    });
    const settings = await panel.getClinicPageSettings(CLINIC);
    expect(settings).toMatchObject({
      headline: "Olá",
      instagramHandle: "outro",
      amenities: ["banheiro"],
      loyaltyVisits: 5,
      loyaltyReward: "Outro brinde",
    });
  });
});
