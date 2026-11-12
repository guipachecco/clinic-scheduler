import { and, eq, inArray, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asClient, clientDb, inClinic, type ClientScope } from "@/db/client";
import { db, endPools } from "@/db/owner";
import { findPgError } from "@/db/errors";
import {
  appointments,
  clinics,
  loyaltyRedemptions,
  media,
  patients,
  paymentMethods,
  products,
  reviews,
  serviceCategories,
  services,
  users,
} from "@/db/schema";

import { CLINIC, otherClinic, productCategory } from "../helpers/clinic";

// The database rules of the clinic page (migration 0017): products, reviews,
// loyalty and the definer functions the public page reads through. Every
// record is fictitious. The e-mails end in @pagina-clinica.example.test and
// the other rows carry "Pagina Clinica" so the cleanup touches only them.

const DOMAIN = "@pagina-clinica.example.test";
const TAG = "Pagina Clinica";
const MINUTE = 60_000;

let clinicB: string;
let serviceId: string;
const user: Record<"ana" | "bia" | "carla" | "dora", string> = {
  ana: "",
  bia: "",
  carla: "",
  dora: "",
};
const patient: Record<keyof typeof user, string> = {
  ana: "",
  bia: "",
  carla: "",
  dora: "",
};

const scope = (
  who: keyof typeof user,
  extra: Partial<ClientScope> = {},
): ClientScope => ({
  clinicId: who === "dora" ? clinicB : CLINIC,
  patientId: patient[who],
  userId: user[who],
  ...extra,
});

async function pgErrorCode(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return findPgError(error)?.code;
  }
  return "no error";
}

// app_client may insert only these four columns, so the insert lists them
// (a Drizzle insert also names the defaulted columns).
function insertReview(
  ctx: ClientScope,
  values: {
    clinicId: string;
    patientId: string;
    rating: number;
    comment?: string;
  },
) {
  return asClient(ctx, (tx) =>
    tx.execute(sql`
      insert into reviews (clinic_id, patient_id, rating, comment)
      values (${values.clinicId}, ${values.patientId}, ${values.rating}, ${values.comment ?? null})
    `),
  );
}

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

async function createPatient(
  clinicId: string,
  userId: string,
  name: string,
  phone: string,
) {
  const [row] = await db
    .insert(patients)
    .values({
      clinicId,
      userId,
      name,
      nameNormalized: name.toLowerCase(),
      phone,
    })
    .returning({ id: patients.id });
  return row!.id;
}

function appointmentValues(
  patientId: string,
  start: string,
  status: "completed" | "confirmed" | "cancelled",
): typeof appointments.$inferInsert {
  const startsAt = new Date(start);
  const endsAt = new Date(startsAt.getTime() + 60 * MINUTE);
  return {
    clinicId: CLINIC,
    patientId,
    serviceId,
    serviceName: "Serviço fictício página",
    serviceDurationMinutes: 60,
    startsAt,
    endsAt,
    occupiedFrom: startsAt,
    occupiedUntil: endsAt,
    status,
    source: "admin",
    ...(status === "cancelled"
      ? { cancelledAt: new Date(), cancelledBy: "clinic" as const }
      : {}),
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
  await db.delete(paymentMethods).where(like(paymentMethods.name, `%${TAG}%`));
  const photoIds = (
    await db
      .select({ id: media.id })
      .from(media)
      .where(like(media.altText, `%${TAG}%`))
  ).map((row) => row.id);
  if (photoIds.length > 0) {
    await db
      .update(clinics)
      .set({ ownerPhotoMediaId: null })
      .where(inArray(clinics.ownerPhotoMediaId, photoIds));
    await db.delete(media).where(inArray(media.id, photoIds));
  }
  await db.delete(services).where(eq(services.slug, "servico-pagina-clinica"));
  await db
    .delete(serviceCategories)
    .where(eq(serviceCategories.slug, "categoria-pagina-clinica"));
}

async function addPhoto(clinicId: string) {
  const [row] = await db
    .insert(media)
    .values({
      clinicId,
      kind: "photo",
      mimeType: "image/png",
      data: Buffer.from([7, 8, 9]),
      byteSize: 3,
      width: 1,
      height: 1,
      altText: `Foto ${TAG}`,
    })
    .returning({ id: media.id });
  return row!.id;
}

const call = (query: ReturnType<typeof sql>) =>
  clientDb.execute(query).then((result) => result.rows);

beforeAll(async () => {
  await cleanup();
  clinicB = await otherClinic("clinica-pagina-teste");
  for (const who of Object.keys(user) as (keyof typeof user)[]) {
    user[who] = await createUser(who);
  }
  patient.ana = await createPatient(
    CLINIC,
    user.ana,
    `Ana ${TAG} Souza`,
    "+5511900003301",
  );
  patient.bia = await createPatient(
    CLINIC,
    user.bia,
    `Bia ${TAG}`,
    "+5511900003302",
  );
  patient.carla = await createPatient(
    CLINIC,
    user.carla,
    `Carla ${TAG}`,
    "+5511900003303",
  );
  patient.dora = await createPatient(
    clinicB,
    user.dora,
    `Dora ${TAG}`,
    "+5511900003304",
  );

  const [category] = await db
    .insert(serviceCategories)
    .values({
      clinicId: CLINIC,
      name: "Categoria página clínica",
      slug: "categoria-pagina-clinica",
    })
    .returning({ id: serviceCategories.id });
  const [service] = await db
    .insert(services)
    .values({
      clinicId: CLINIC,
      categoryId: category!.id,
      name: "Serviço fictício página",
      slug: "servico-pagina-clinica",
      durationMinutes: 60,
      isActive: true,
    })
    .returning({ id: services.id });
  serviceId = service!.id;

  await db
    .insert(appointments)
    .values([
      appointmentValues(patient.ana, "2026-01-10T13:00:00Z", "completed"),
      appointmentValues(patient.bia, "2034-04-10T13:00:00Z", "confirmed"),
      appointmentValues(patient.carla, "2026-01-11T13:00:00Z", "cancelled"),
    ]);
});

afterAll(async () => {
  await db
    .update(clinics)
    .set({ isActive: true })
    .where(eq(clinics.id, clinicB));
  await cleanup();
  await endPools();
});

describe("clinic page rules", () => {
  it("lets a client with a completed appointment review, any number of times", async () => {
    await insertReview(scope("ana"), {
      clinicId: CLINIC,
      patientId: patient.ana,
      rating: 5,
      comment: "Atendimento ótimo",
    });
    await insertReview(scope("ana"), {
      clinicId: CLINIC,
      patientId: patient.ana,
      rating: 3,
    });
    const rows = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(eq(reviews.patientId, patient.ana));
    expect(rows).toHaveLength(2);
  });

  it("refuses a review without a completed appointment", async () => {
    for (const who of ["bia", "carla"] as const) {
      const code = await pgErrorCode(
        insertReview(scope(who), {
          clinicId: CLINIC,
          patientId: patient[who],
          rating: 4,
        }),
      );
      expect(code, who).toBe("42501");
    }
  });

  it("refuses a review for another patient or clinic", async () => {
    const forBia = await pgErrorCode(
      insertReview(scope("ana"), {
        clinicId: CLINIC,
        patientId: patient.bia,
        rating: 4,
      }),
    );
    expect(forBia).toBe("42501");
    const inB = await pgErrorCode(
      insertReview(scope("ana"), {
        clinicId: clinicB,
        patientId: patient.ana,
        rating: 4,
      }),
    );
    expect(inB).toBe("42501");
    // Nor may she write the moderation columns.
    const hidden = await pgErrorCode(
      asClient(scope("ana"), (tx) =>
        tx.execute(sql`
          insert into reviews (clinic_id, patient_id, rating, is_hidden)
          values (${CLINIC}, ${patient.ana}, 4, false)
        `),
      ),
    );
    expect(hidden).toBe("42501");
    // A Drizzle insert names every column (defaults as DEFAULT), so it is
    // refused too: the client area must list the four columns itself.
    const drizzleInsert = await pgErrorCode(
      asClient(scope("ana"), (tx) =>
        tx
          .insert(reviews)
          .values({ clinicId: CLINIC, patientId: patient.ana, rating: 4 }),
      ),
    );
    expect(drizzleInsert).toBe("42501");
  });

  it("gives app_client no SELECT on reviews", async () => {
    const code = await pgErrorCode(
      asClient(scope("ana"), (tx) => tx.execute(sql`select id from reviews`)),
    );
    expect(code).toBe("42501");
  });

  it("public reviews hide hidden ones and abbreviate the author", async () => {
    await inClinic(CLINIC, (tx) =>
      tx
        .update(reviews)
        .set({ isHidden: true, hiddenAt: new Date() })
        .where(and(eq(reviews.patientId, patient.ana), eq(reviews.rating, 3))),
    );
    const visible = await call(
      sql`select * from client_public_reviews(${CLINIC}, 10)`,
    );
    const ours = visible.filter((row) => row.author === "Ana S.");
    expect(ours).toEqual([
      expect.objectContaining({ rating: 5, comment: "Atendimento ótimo" }),
    ]);
    expect(Object.keys(visible[0]!).sort()).toEqual(
      ["author", "comment", "created_at", "id", "rating"].sort(),
    );

    const [summary] = await call(
      sql`select * from client_review_summary(${CLINIC})`,
    );
    expect(summary).toEqual({ average: "5.0", total: 1 });
  });

  it("returns nothing for an inactive clinic or another clinic's data", async () => {
    const [reviewB] = await db
      .insert(reviews)
      .values({ clinicId: clinicB, patientId: patient.dora, rating: 4 })
      .returning({ id: reviews.id });
    await db
      .insert(paymentMethods)
      .values({ clinicId: clinicB, name: `Pix ${TAG}` });
    const photoB = await addPhoto(clinicB);
    await db
      .update(clinics)
      .set({ ownerPhotoMediaId: photoB })
      .where(eq(clinics.id, clinicB));

    const reviewsB = await call(
      sql`select * from client_public_reviews(${clinicB}, 50)`,
    );
    expect(reviewsB.map((row) => row.id)).toEqual([reviewB!.id]);
    expect(reviewsB[0]!.author).toBe("Dora C.");

    const functions = [
      sql`select * from client_public_reviews(${clinicB}, 50)`,
      sql`select * from client_review_summary(${clinicB})`,
      sql`select * from client_payment_methods(${clinicB})`,
      sql`select * from client_owner_photo(${clinicB})`,
    ];
    const loyalty = () =>
      asClient(scope("dora"), (tx) =>
        tx.execute(sql`select * from client_loyalty_progress()`),
      ).then((result) => result.rows);
    for (const query of functions) {
      expect((await call(query)).length).toBe(1);
    }
    expect(await loyalty()).toEqual([{ completed: 0, redeemed: 0 }]);

    await db
      .update(clinics)
      .set({ isActive: false })
      .where(eq(clinics.id, clinicB));
    try {
      for (const query of functions) {
        expect(await call(query)).toEqual([]);
      }
      expect(await loyalty()).toEqual([]);
    } finally {
      await db
        .update(clinics)
        .set({ isActive: true })
        .where(eq(clinics.id, clinicB));
    }
  });

  it("withdraws the reviews of an anonymized patient (migration 0018)", async () => {
    const eva = await createPatient(
      clinicB,
      await createUser("eva"),
      `Eva ${TAG} Lima`,
      "+5511900003305",
    );
    const [review] = await db
      .insert(reviews)
      .values({ clinicId: clinicB, patientId: eva, rating: 2 })
      .returning({ id: reviews.id });
    const listed = async () =>
      (
        await call(sql`select * from client_public_reviews(${clinicB}, 50)`)
      ).map((row) => row.id);
    expect(await listed()).toContain(review!.id);
    expect(
      await call(sql`select * from client_review_summary(${clinicB})`),
    ).toEqual([{ average: "3.0", total: 2 }]);

    // What anonymizePatient leaves (without its audit row). The row loses its
    // user link, so this test removes it itself.
    await db
      .update(patients)
      .set({
        name: "Paciente anonimizada",
        nameNormalized: null,
        phone: null,
        userId: null,
        anonymizedAt: new Date(),
      })
      .where(eq(patients.id, eva));
    try {
      expect(await listed()).not.toContain(review!.id);
      expect(
        await call(sql`select * from client_review_summary(${clinicB})`),
      ).toEqual([{ average: "4.0", total: 1 }]);
    } finally {
      await db.delete(reviews).where(eq(reviews.patientId, eva));
      await db.delete(patients).where(eq(patients.id, eva));
    }
  });

  it("shows clients only active products of their clinic", async () => {
    const mine = await productCategory(CLINIC);
    const theirs = await productCategory(clinicB);
    await db.insert(products).values([
      {
        clinicId: CLINIC,
        categoryId: mine,
        name: `Creme ${TAG} A`,
        priceCents: 4500,
      },
      {
        clinicId: CLINIC,
        categoryId: mine,
        name: `Óleo ${TAG} A`,
        isActive: false,
      },
      { clinicId: clinicB, categoryId: theirs, name: `Creme ${TAG} B` },
    ]);
    const seen = await clientDb.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.clinic_id', ${CLINIC}, true)`,
      );
      return tx
        .select({ name: products.name, priceCents: products.priceCents })
        .from(products)
        .where(like(products.name, `%${TAG}%`));
    });
    expect(seen).toEqual([{ name: `Creme ${TAG} A`, priceCents: 4500 }]);
    // Without the setting, nothing.
    expect(
      await clientDb
        .select({ id: products.id })
        .from(products)
        .where(like(products.name, `%${TAG}%`)),
    ).toEqual([]);
  });

  it("panel can hide a review but not change its rating or text", async () => {
    for (const change of [{ rating: 1 }, { comment: "Texto trocado" }]) {
      const code = await pgErrorCode(
        inClinic(CLINIC, (tx) =>
          tx
            .update(reviews)
            .set(change)
            .where(eq(reviews.patientId, patient.ana)),
        ),
      );
      expect(code).toBe("42501");
    }
    const hidden = await inClinic(CLINIC, (tx) =>
      tx
        .update(reviews)
        .set({ isHidden: true, hiddenAt: new Date() })
        .where(eq(reviews.patientId, patient.ana))
        .returning({ id: reviews.id }),
    );
    expect(hidden).toHaveLength(2);

    const fromB = await inClinic(clinicB, (tx) =>
      tx
        .select({ id: reviews.id })
        .from(reviews)
        .where(eq(reviews.patientId, patient.ana)),
    );
    expect(fromB).toEqual([]);
  });

  it("loyalty progress counts only her completed appointments and redemptions", async () => {
    const progress = (ctx: ClientScope) =>
      asClient(ctx, (tx) =>
        tx.execute(sql`select * from client_loyalty_progress()`),
      ).then((result) => result.rows);

    expect(await progress(scope("ana"))).toEqual([
      { completed: 1, redeemed: 0 },
    ]);
    expect(await progress(scope("bia"))).toEqual([
      { completed: 0, redeemed: 0 },
    ]);

    await inClinic(CLINIC, (tx) =>
      tx
        .insert(loyaltyRedemptions)
        .values({ clinicId: CLINIC, patientId: patient.ana }),
    );
    expect(await progress(scope("ana"))).toEqual([
      { completed: 1, redeemed: 1 },
    ]);
    // Her patient id under another account counts nothing.
    expect(await progress(scope("ana", { userId: user.bia }))).toEqual([
      { completed: 0, redeemed: 0 },
    ]);
  });

  it("payment methods and owner photo are readable only through the functions", async () => {
    await db.insert(paymentMethods).values([
      { clinicId: CLINIC, name: `Dinheiro ${TAG}`, sortOrder: 99 },
      { clinicId: CLINIC, name: `Cheque ${TAG}`, isActive: false },
    ]);
    for (const table of ["payment_methods", "media"]) {
      const code = await pgErrorCode(
        asClient(scope("ana"), (tx) =>
          tx.execute(sql`select 1 from ${sql.identifier(table)}`),
        ),
      );
      expect(code, table).toBe("42501");
    }
    const names = (
      await call(sql`select * from client_payment_methods(${CLINIC})`)
    ).map((row) => row.name);
    expect(names).toContain(`Dinheiro ${TAG}`);
    expect(names).not.toContain(`Cheque ${TAG}`);

    const [before] = await db
      .select({ photo: clinics.ownerPhotoMediaId })
      .from(clinics)
      .where(eq(clinics.id, CLINIC));
    const photo = await addPhoto(CLINIC);
    await addPhoto(CLINIC); // another image of the clinic, not the photo
    await db
      .update(clinics)
      .set({ ownerPhotoMediaId: photo })
      .where(eq(clinics.id, CLINIC));
    try {
      const rows = await call(sql`select * from client_owner_photo(${CLINIC})`);
      expect(rows).toEqual([
        { mime_type: "image/png", data: Buffer.from([7, 8, 9]) },
      ]);
    } finally {
      await db
        .update(clinics)
        .set({ ownerPhotoMediaId: before!.photo })
        .where(eq(clinics.id, CLINIC));
    }
  });

  it("enforces the clinic checks", async () => {
    const cases: Partial<typeof clinics.$inferInsert>[] = [
      { amenities: ["sauna"] },
      { instagramHandle: "bad handle" },
      { loyaltyVisits: 1 },
      { loyaltyChoice: true, loyaltyReward: null },
      { mapsUrl: "javascript:alert(1)" },
    ];
    for (const change of cases) {
      const code = await pgErrorCode(
        db.update(clinics).set(change).where(eq(clinics.id, CLINIC)),
      );
      expect(code, JSON.stringify(change)).toBe("23514");
    }
  });

  it("panel may update the new clinic page columns", async () => {
    const [before] = await db
      .select({ online: clinics.onlineBookingChoice })
      .from(clinics)
      .where(eq(clinics.id, CLINIC));
    try {
      await inClinic(CLINIC, (tx) =>
        tx
          .update(clinics)
          .set({
            instagramHandle: "clinica.teste_1",
            amenities: ["wifi", "cafe_agua"],
            onlineBookingChoice: !before!.online,
            loyaltyChoice: true,
            loyaltyVisits: 8,
            loyaltyReward: "Uma sessão grátis",
          })
          .where(eq(clinics.id, CLINIC)),
      );
      const [after] = await db
        .select({
          instagram: clinics.instagramHandle,
          amenities: clinics.amenities,
        })
        .from(clinics)
        .where(eq(clinics.id, CLINIC));
      expect(after).toEqual({
        instagram: "clinica.teste_1",
        amenities: ["wifi", "cafe_agua"],
      });
    } finally {
      await db
        .update(clinics)
        .set({
          instagramHandle: null,
          amenities: [],
          onlineBookingChoice: before!.online,
          loyaltyChoice: false,
          loyaltyVisits: 10,
          loyaltyReward: null,
        })
        .where(eq(clinics.id, CLINIC));
    }
  });
});
