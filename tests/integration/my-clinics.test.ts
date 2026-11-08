import { randomUUID } from "node:crypto";

import { and, eq, inArray, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inClinic } from "@/db/client";
import { findPgError } from "@/db/errors";
import { db, endPools } from "@/db/owner";
import {
  appointments,
  clinics,
  patients,
  reviews,
  serviceCategories,
  services,
  users,
} from "@/db/schema";
import { listMyClinics, listPublicClinics } from "@/modules/clients/my-clinics";

import { CLINIC } from "../helpers/clinic";

// client_my_clinics: the active clinics where the signed-in client has a
// patients row. Every record is fictitious; e-mails end in
// @minhas-clinicas.example.test and clinic slugs start with "minhas-clinicas-".

const DOMAIN = "@minhas-clinicas.example.test";
const PREFIX = "minhas-clinicas-";

const slugs = {
  a: `${PREFIX}a`,
  b: `${PREFIX}b`,
  c: `${PREFIX}c`,
  d: `${PREFIX}d`,
  e: `${PREFIX}e`,
  f: `${PREFIX}f`,
};
let userU: string;
let userV: string;

async function createUser(local: string) {
  const [row] = await db
    .insert(users)
    .values({
      name: `Cliente ${local}`,
      email: `${local}${DOMAIN}`,
      role: "client",
      clinicId: null,
    })
    .returning({ id: users.id });
  return row!.id;
}

async function createClinic(
  slug: string,
  values: Partial<typeof clinics.$inferInsert>,
) {
  const [row] = await db
    .insert(clinics)
    .values({ slug, name: "Clínica", ...values })
    .returning({ id: clinics.id });
  return row!.id;
}

async function addPatient(
  clinicId: string,
  userId: string,
  extra: Partial<typeof patients.$inferInsert> = {},
) {
  await db.insert(patients).values({
    clinicId,
    userId,
    name: "Paciente Minhas Clinicas",
    nameNormalized: "paciente minhas clinicas",
    phone: "+5511900009901",
    ...extra,
  });
}

async function cleanup() {
  const clinicIds = (
    await db
      .select({ id: clinics.id })
      .from(clinics)
      .where(like(clinics.slug, `${PREFIX}%`))
  ).map((row) => row.id);
  if (clinicIds.length > 0) {
    for (const table of [reviews, appointments, services, serviceCategories]) {
      await db.delete(table).where(inArray(table.clinicId, clinicIds));
    }
    await db.delete(patients).where(inArray(patients.clinicId, clinicIds));
    await db.delete(clinics).where(inArray(clinics.id, clinicIds));
  }
  await db.delete(users).where(like(users.email, `%${DOMAIN}`));
}

beforeAll(async () => {
  await cleanup();
  userU = await createUser("u");
  userV = await createUser("v");
  const a = await createClinic(slugs.a, { name: "Beta Clínica" });
  const b = await createClinic(slugs.b, {
    name: "Zzz Nome Legal",
    displayName: "Alfa Estética",
    areaLabel: "Estética",
  });
  const c = await createClinic(slugs.c, { name: "Clínica C" });
  const d = await createClinic(slugs.d, { name: "Clínica D" });
  const e = await createClinic(slugs.e, { name: "Clínica E", isActive: false });
  // A provisional record (pending a link to an existing patient) counts.
  const f = await createClinic(slugs.f, { name: "Gama Provisória" });
  const [existing] = await db
    .insert(patients)
    .values({
      clinicId: f,
      name: "Existente Minhas Clinicas",
      nameNormalized: "existente minhas clinicas",
      phone: "+5511900009902",
    })
    .returning({ id: patients.id });
  await addPatient(f, userU, { pendingLinkPatientId: existing!.id });
  await addPatient(a, userU);
  await addPatient(b, userU);
  await addPatient(c, userV);
  // Anonymization clears the identity and the account link.
  await db.insert(patients).values({
    clinicId: d,
    name: "Paciente anonimizado Minhas Clinicas",
    anonymizedAt: new Date(),
  });
  await addPatient(e, userU);
});

afterAll(async () => {
  await cleanup();
  await endPools();
});

describe("listMyClinics", () => {
  it("lists only the user's active clinics, by name", async () => {
    const list = await listMyClinics(userU);
    expect(list.map((c) => c.slug)).toEqual([slugs.b, slugs.a, slugs.f]);
    expect(list[0]).toMatchObject({
      slug: slugs.b,
      name: "Alfa Estética",
      areaLabel: "Estética",
      hasPhoto: false,
      coverPhotoId: null,
      rating: null,
      loyalty: null,
      nextAppointment: null,
    });
    expect(list[1]!.areaLabel).toBeNull();
  });

  it("never returns another user's clinics", async () => {
    const list = await listMyClinics(userU);
    expect(list.map((c) => c.slug)).not.toContain(slugs.c);
    expect((await listMyClinics(userV)).map((c) => c.slug)).toEqual([slugs.c]);
  });

  it("lists a clinic where her row is a provisional record", async () => {
    expect((await listMyClinics(userU)).map((c) => c.slug)).toContain(slugs.f);
  });

  // The schema forces user_id to null on anonymized rows, so the
  // anonymized_at filter in the function is defence in depth that no
  // fixture can reach; this checks the anonymized clinic and the inactive
  // one stay out.
  it("leaves out a clinic with only an anonymized record and an inactive clinic", async () => {
    const found = (await listMyClinics(userU)).map((c) => c.slug);
    expect(found).not.toContain(slugs.d);
    expect(found).not.toContain(slugs.e);
  });

  it("returns nothing for an unknown or malformed id", async () => {
    expect(await listMyClinics(randomUUID())).toEqual([]);
    expect(await listMyClinics("x")).toEqual([]);
    expect(await listMyClinics("00000000-0000-0000-0000-000000000000")).toEqual(
      [],
    );
  });

  it("shows her next appointment, loyalty, rating and cover in that clinic", async () => {
    const [clinic] = await db
      .select({ id: clinics.id })
      .from(clinics)
      .where(eq(clinics.slug, slugs.a));
    const clinicId = clinic!.id;
    await db
      .update(clinics)
      .set({
        loyaltyEnabled: true,
        loyaltyVisits: 3,
        loyaltyReward: "Brinde",
        whatsappPhone: "+5547999990000",
      })
      .where(eq(clinics.id, clinicId));
    const [category] = await db
      .insert(serviceCategories)
      .values({ clinicId, name: "Categoria", slug: "categoria-minhas" })
      .returning({ id: serviceCategories.id });
    const [service] = await db
      .insert(services)
      .values({
        clinicId,
        categoryId: category!.id,
        name: "Esmaltação",
        slug: "esmaltacao-minhas",
        durationMinutes: 60,
      })
      .returning({ id: services.id });
    const patientOf = async (userId: string) =>
      (
        await db
          .select({ id: patients.id })
          .from(patients)
          .where(
            and(eq(patients.clinicId, clinicId), eq(patients.userId, userId)),
          )
      )[0]!.id;
    const mine = await patientOf(userU);
    // Another client of the same clinic, with an earlier appointment.
    await addPatient(clinicId, userV, { phone: "+5511900009903" });
    const theirs = await patientOf(userV);

    const at = (hoursFromNow: number, patientId: string, extra = {}) => {
      const startsAt = new Date(Date.now() + hoursFromNow * 3_600_000);
      const endsAt = new Date(startsAt.getTime() + 3_600_000);
      return {
        clinicId,
        patientId,
        serviceId: service!.id,
        serviceName: "Esmaltação",
        serviceDurationMinutes: 60,
        startsAt,
        endsAt,
        occupiedFrom: startsAt,
        occupiedUntil: endsAt,
        source: "admin" as const,
        ...extra,
      };
    };
    const cancelled = {
      status: "cancelled" as const,
      cancelledAt: new Date(),
      cancelledBy: "clinic" as const,
    };
    await db
      .insert(appointments)
      .values([
        at(-48, mine, { status: "completed" }),
        at(-24, mine, { status: "completed" }),
        at(-1, mine, { status: "confirmed" }),
        at(2, mine, cancelled),
        at(3, theirs, { status: "confirmed" }),
        at(50, mine, { status: "requested" }),
        at(26, mine, { status: "confirmed", customLabel: "Pé e mão" }),
      ]);
    await db.insert(reviews).values([
      { clinicId, patientId: mine, rating: 5 },
      { clinicId, patientId: theirs, rating: 4 },
      { clinicId, patientId: theirs, rating: 1, isHidden: true },
    ]);

    const card = (await listMyClinics(userU)).find((c) => c.slug === slugs.a)!;
    expect(card.nextAppointment?.service).toBe("Pé e mão");
    expect(
      Math.round(
        (card.nextAppointment!.startsAt.getTime() - Date.now()) / 3_600_000,
      ),
    ).toBe(26);
    expect(card.loyalty).toEqual({
      visits: 3,
      reward: "Brinde",
      stamps: 2,
      prize: false,
    });
    expect(card.rating).toEqual({ average: 4.5, total: 2 });
    expect(card.whatsappPhone).toBe("+5547999990000");

    // The other client sees her own appointment, not this one's.
    const other = (await listMyClinics(userV)).find((c) => c.slug === slugs.a)!;
    expect(
      Math.round(
        (other.nextAppointment!.startsAt.getTime() - Date.now()) / 3_600_000,
      ),
    ).toBe(3);
    expect(other.loyalty?.stamps).toBe(0);
  });

  it("is executable only by app_client", async () => {
    let code: string | undefined;
    try {
      await inClinic(CLINIC, (tx) =>
        tx.execute(sql`select * from client_my_clinics(${userU}::uuid)`),
      );
    } catch (error) {
      code = findPgError(error)?.code;
    }
    expect(code).toBe("42501");
  });
});

describe("listPublicClinics", () => {
  it("lists active clinics with online booking on, without private data", async () => {
    const [c] = await db
      .select({ id: clinics.id })
      .from(clinics)
      .where(eq(clinics.slug, slugs.c));
    // New clinics start with online booking off; a and b turn it on, c stays
    // off.
    await db
      .update(clinics)
      .set({ onlineBookingEnabled: true })
      .where(inArray(clinics.slug, [slugs.a, slugs.b, slugs.e]));
    await db
      .update(clinics)
      .set({ onlineBookingEnabled: false })
      .where(eq(clinics.id, c!.id));
    const list = await listPublicClinics();
    const found = list.map((clinic) => clinic.slug);
    expect(found).toContain(slugs.a);
    expect(found).toContain(slugs.b);
    expect(found).not.toContain(slugs.c);
    expect(found).not.toContain(slugs.e);
    expect(list.find((clinic) => clinic.slug === slugs.b)).toEqual({
      slug: slugs.b,
      name: "Alfa Estética",
      areaLabel: "Estética",
      hasPhoto: false,
      coverPhotoId: null,
    });
  });
});
