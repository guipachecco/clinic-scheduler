import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { db, endPools } from "@/db/owner";
import { clinics, patients, users } from "@/db/schema";

import { otherClinic } from "../helpers/clinic";

// The Server Actions of the clinic link's signup page, called directly (as a
// hand-made request would), on a clinic whose online booking is off. The
// session helpers that read the request are replaced; everything else is real.
const signedIn = vi.hoisted(() => ({
  user: null as null | {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
  },
}));

vi.mock("@/modules/clients/session", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/modules/clients/session")>();
  return {
    ...original,
    getClientUser: async () => signedIn.user,
    requestIp: async () => "203.0.113.250",
  };
});

const { completeRegistration, signUp } =
  await import("@/app/[slug]/cadastro/actions");

const SLUG = "cadastro-desligado-teste";
const EMAIL = "estranha@cadastro-desligado.example.test";
let clinicId: string;

beforeAll(async () => {
  clinicId = await otherClinic(SLUG);
  await db
    .update(clinics)
    .set({ onlineBookingChoice: false, isActive: true })
    .where(eq(clinics.id, clinicId));
});

afterAll(async () => {
  await db.delete(patients).where(eq(patients.clinicId, clinicId));
  await db.delete(users).where(eq(users.email, EMAIL));
  await endPools();
});

describe("signup on a clinic with online booking off", () => {
  it("signUp refuses: no account and no record", async () => {
    const result = await signUp(SLUG, {
      name: "Visitante Fictícia",
      phone: "(11) 98765-4321",
      email: EMAIL,
      password: "senha-de-teste-bem-longa",
    });
    expect(result).toEqual({
      ok: false,
      fieldErrors: { form: expect.stringMatching(/agendamento online/i) },
    });
    expect(
      await db.select().from(users).where(eq(users.email, EMAIL)),
    ).toHaveLength(0);
    expect(
      await db.select().from(patients).where(eq(patients.clinicId, clinicId)),
    ).toHaveLength(0);
  });

  it("completeRegistration refuses for an account of another clinic", async () => {
    const userId = randomUUID();
    signedIn.user = {
      id: userId,
      name: "Cliente de Outra Clínica",
      email: "outra@cadastro-desligado.example.test",
      emailVerified: true,
    };
    const result = await completeRegistration(
      SLUG,
      { name: "Cliente de Outra Clínica", phone: "(11) 98765-4322" },
      undefined,
    );
    expect(result).toEqual({
      ok: false,
      fieldErrors: { form: expect.stringMatching(/agendamento online/i) },
    });
    expect(
      await db
        .select()
        .from(patients)
        .where(
          and(eq(patients.clinicId, clinicId), eq(patients.userId, userId)),
        ),
    ).toHaveLength(0);
  });
});
