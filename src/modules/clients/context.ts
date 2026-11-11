import "server-only";

import { eq, sql } from "drizzle-orm";

import { clientDb } from "@/db/client";
import { clinics } from "@/db/schema";
import type { ClinicModule } from "@/modules/clinics/modules";
import { normalizeBrPhone } from "@/modules/patients/fields";

// Who the signed-in client is in a clinic, read through the definer functions
// of migration 0013 as app_client. She belongs to no clinic: each clinic knows
// her through her own patients row (patients.user_id).

// The clinic columns app_client may read (column grants in 0013).
const publicClinicColumns = {
  id: clinics.id,
  slug: clinics.slug,
  name: clinics.name,
  displayName: clinics.displayName,
  whatsappPhone: clinics.whatsappPhone,
  contactEmail: clinics.contactEmail,
  address: clinics.address,
  mapsUrl: clinics.mapsUrl,
  onlineBookingEnabled: clinics.onlineBookingEnabled,
  minAdvanceMinutes: clinics.minAdvanceMinutes,
  maxAdvanceDays: clinics.maxAdvanceDays,
  slotStepMinutes: clinics.slotStepMinutes,
  maxActiveAppointmentsPerPhone: clinics.maxActiveAppointmentsPerPhone,
  timezone: clinics.timezone,
  modules: clinics.modules,
};

export type PublicClinic = {
  id: string;
  slug: string;
  name: string;
  displayName: string | null;
  whatsappPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  mapsUrl: string | null;
  onlineBookingEnabled: boolean;
  minAdvanceMinutes: number;
  maxAdvanceDays: number;
  slotStepMinutes: number;
  maxActiveAppointmentsPerPhone: number;
  timezone: string;
  // The clinic's modules: a module turned off hides its pages and sections
  // (products, reviews...) even though its data stays stored.
  modules: ClinicModule[];
};

export type ClientContext = {
  clinic: PublicClinic;
  // Her patients row in this clinic; null until she completes her signup
  // there (registerClientPatient).
  patientId: string | null;
  // True while her row is a provisional record waiting for the owner to say
  // whether it is the same person as an existing patient.
  pending: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Stands for "nobody" in client_context: no patients row has it as user_id
// (user ids are random UUIDs), so only the clinic comes back.
const NO_USER = "00000000-0000-0000-0000-000000000000";

// Null when the slug is not an active clinic.
export async function getClientContext(
  slug: string,
  userId: string,
): Promise<ClientContext | null> {
  if (!UUID.test(userId) || userId === NO_USER) return null;
  return readContext(slug, userId);
}

// The public face of an active clinic, for visitors who are not signed in
// (the clinic link's pages). Null when the slug is not an active clinic.
export async function getPublicClinic(
  slug: string,
): Promise<PublicClinic | null> {
  return (await readContext(slug, NO_USER))?.clinic ?? null;
}

async function readContext(
  slug: string,
  userId: string,
): Promise<ClientContext | null> {
  return clientDb.transaction(async (tx) => {
    const result = await tx.execute<{
      clinic_id: string;
      patient_id: string | null;
      pending: boolean;
    }>(
      sql`select clinic_id, patient_id, pending from client_context(${slug}, ${userId}::uuid)`,
    );
    const row = result.rows[0];
    if (!row) return null;
    await tx.execute(
      sql`select set_config('app.clinic_id', ${row.clinic_id}, true)`,
    );
    const [clinic] = await tx
      .select(publicClinicColumns)
      .from(clinics)
      .where(eq(clinics.id, row.clinic_id));
    if (!clinic) return null;
    return { clinic, patientId: row.patient_id, pending: row.pending };
  });
}

// Creates her patients row in the clinic and returns its id. A Brazilian
// phone is turned into E.164 here; the function checks the rest. Raises
// P0001 when she already has a row there and 22023 for invalid input.
export async function registerClientPatient(input: {
  clinicId: string;
  userId: string;
  name: string;
  phone: string;
  email: string | null;
}): Promise<string> {
  const phone = normalizeBrPhone(input.phone) ?? input.phone.trim();
  const email = input.email?.trim().toLowerCase() || null;
  const result = await clientDb.execute<{ id: string }>(
    sql`select register_client_patient(${input.clinicId}::uuid, ${input.userId}::uuid, ${input.name}, ${phone}, ${email}) as id`,
  );
  return result.rows[0]!.id;
}
