import { randomUUID } from "node:crypto";

import { inArray, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inClinic } from "@/db/client";
import { findPgError } from "@/db/errors";
import { db, endPools } from "@/db/owner";
import { clinics, patients, users } from "@/db/schema";
import { listMyClinics } from "@/modules/clients/my-clinics";

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
    expect(list.map((c) => c.slug)).toEqual([slugs.b, slugs.a]);
    expect(list[0]).toEqual({
      slug: slugs.b,
      name: "Alfa Estética",
      areaLabel: "Estética",
      hasPhoto: false,
    });
    expect(list[1]!.areaLabel).toBeNull();
  });

  it("never returns another user's clinics", async () => {
    const list = await listMyClinics(userU);
    expect(list.map((c) => c.slug)).not.toContain(slugs.c);
    expect((await listMyClinics(userV)).map((c) => c.slug)).toEqual([slugs.c]);
  });

  it("ignores anonymized records and inactive clinics", async () => {
    const found = (await listMyClinics(userU)).map((c) => c.slug);
    expect(found).not.toContain(slugs.d);
    expect(found).not.toContain(slugs.e);
  });

  it("returns nothing for an unknown or malformed id", async () => {
    expect(await listMyClinics(randomUUID())).toEqual([]);
    expect(await listMyClinics("x")).toEqual([]);
    expect(
      await listMyClinics("00000000-0000-0000-0000-000000000000"),
    ).toEqual([]);
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
