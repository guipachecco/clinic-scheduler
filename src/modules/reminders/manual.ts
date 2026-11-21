import "server-only";

import { and, asc, eq, gte, isNull, lt } from "drizzle-orm";
import { DateTime } from "luxon";

import { inClinic } from "@/db/client";
import { appointments, auditLogs, clinics, patients } from "@/db/schema";

import { manualReminderText, whatsappLink } from "./message";

// The "Avisar pelo WhatsApp" queue of the agenda: the clinic reminds the day's
// patients from its own WhatsApp, one tap each (a WhatsApp link with the text
// ready). Without the Cloud API nothing can send on the owner's behalf, so
// each message still needs her tap on "enviar".
//
// A reminder marked here uses the same marker as the automatic one
// (reminder_sent_for = the appointment's start), so when the API is on the
// daily run skips who was already reminded, and moving the appointment to
// another time makes it due again.

export type DayReminder = {
  id: string;
  startsAt: Date;
  serviceName: string;
  patientName: string;
  // Null without a usable phone: the row shows why it cannot be sent.
  link: string | null;
  reminded: boolean;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// The confirmed appointments of `date` (yyyy-mm-dd, the clinic's calendar
// day), in time order. Anonymised patients are left out.
export async function listDayReminders(
  clinicId: string,
  date: string,
  now: Date = new Date(),
): Promise<{ clinicName: string; items: DayReminder[] } | null> {
  if (!DATE.test(date)) return null;
  return inClinic(clinicId, async (tx) => {
    const [clinic] = await tx
      .select({
        name: clinics.name,
        displayName: clinics.displayName,
        timezone: clinics.timezone,
        address: clinics.address,
        mapsUrl: clinics.mapsUrl,
      })
      .from(clinics)
      .where(eq(clinics.id, clinicId))
      .limit(1);
    if (!clinic) return null;
    const day = DateTime.fromISO(date, { zone: clinic.timezone });
    if (!day.isValid) return null;
    const from = day.startOf("day").toJSDate();
    const to = day.startOf("day").plus({ days: 1 }).toJSDate();

    const rows = await tx
      .select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        serviceName: appointments.serviceName,
        reminderSentFor: appointments.reminderSentFor,
        patientName: patients.name,
        phone: patients.phone,
      })
      .from(appointments)
      .innerJoin(
        patients,
        and(
          eq(patients.clinicId, appointments.clinicId),
          eq(patients.id, appointments.patientId),
        ),
      )
      .where(
        and(
          eq(appointments.clinicId, clinicId),
          eq(appointments.status, "confirmed"),
          gte(appointments.startsAt, from),
          lt(appointments.startsAt, to),
          isNull(patients.anonymizedAt),
        ),
      )
      .orderBy(asc(appointments.startsAt));

    const clinicName = clinic.displayName?.trim() || clinic.name;
    return {
      clinicName,
      items: rows.map((row) => ({
        id: row.id,
        startsAt: row.startsAt,
        serviceName: row.serviceName,
        patientName: row.patientName,
        link: row.phone
          ? whatsappLink(
              row.phone,
              manualReminderText({
                patientName: row.patientName,
                clinicName,
                serviceName: row.serviceName,
                startsAt: row.startsAt,
                timezone: clinic.timezone,
                address: clinic.address,
                mapsUrl: clinic.mapsUrl,
                now,
              }),
            )
          : null,
        reminded:
          row.reminderSentFor !== null &&
          row.reminderSentFor.getTime() === row.startsAt.getTime(),
      })),
    };
  });
}

// Marks the reminder of a confirmed appointment as sent for its current start
// and logs who did it. False when the appointment is not there (another
// clinic, cancelled meanwhile). Marking twice is harmless.
export async function markReminded(
  clinicId: string,
  appointmentId: string,
  actorUserId: string,
): Promise<boolean> {
  return inClinic(clinicId, async (tx) => {
    const [row] = await tx
      .select({
        startsAt: appointments.startsAt,
        reminderSentFor: appointments.reminderSentFor,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.id, appointmentId),
          eq(appointments.clinicId, clinicId),
          eq(appointments.status, "confirmed"),
        ),
      )
      .limit(1);
    if (!row) return false;
    if (row.reminderSentFor?.getTime() === row.startsAt.getTime()) return true;
    await tx
      .update(appointments)
      .set({ reminderSentFor: row.startsAt })
      .where(
        and(
          eq(appointments.id, appointmentId),
          eq(appointments.clinicId, clinicId),
        ),
      );
    await tx.insert(auditLogs).values({
      clinicId,
      actorType: "admin",
      actorUserId,
      action: "appointment.reminder_sent",
      entityType: "appointment",
      entityId: appointmentId,
      changes: {
        channel: "whatsapp_manual",
        startsAt: row.startsAt.toISOString(),
      },
    });
    return true;
  });
}

// The same reminder for one appointment (the "WhatsApp" button of the panel
// home's "Próxima" card). Null when the patient has no usable phone.
export async function reminderLinkFor(
  clinicId: string,
  item: {
    patientName: string;
    patientPhone: string | null;
    serviceName: string;
    startsAt: Date;
  },
  now: Date = new Date(),
): Promise<string | null> {
  if (!item.patientPhone) return null;
  const [clinic] = await inClinic(clinicId, (tx) =>
    tx
      .select({
        name: clinics.name,
        displayName: clinics.displayName,
        timezone: clinics.timezone,
        address: clinics.address,
        mapsUrl: clinics.mapsUrl,
      })
      .from(clinics)
      .where(eq(clinics.id, clinicId))
      .limit(1),
  );
  if (!clinic) return null;
  return whatsappLink(
    item.patientPhone,
    manualReminderText({
      patientName: item.patientName,
      clinicName: clinic.displayName?.trim() || clinic.name,
      serviceName: item.serviceName,
      startsAt: item.startsAt,
      timezone: clinic.timezone,
      address: clinic.address,
      mapsUrl: clinic.mapsUrl,
      now,
    }),
  );
}
