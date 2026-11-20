import "server-only";

import { and, asc, eq, gte, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import { inClinic, platformDb } from "@/db/client";
import { appointments, auditLogs, clinics, patients } from "@/db/schema";
import { logger } from "@/lib/logger";

import { reminderParams, tomorrowRange, whatsappNumber } from "./message";
import { sendWhatsAppTemplate, type WhatsAppTemplate } from "./whatsapp";

// The daily run of the WhatsApp reminder (GET /api/cron/lembretes, 10h in
// Brasília). For every active clinic, the confirmed appointments of tomorrow
// in the clinic's zone whose patient asked for the reminder (or whose owner
// ticked it) and have not had one for this start yet.
//
// Root's role (app_platform) only lists the clinics; each clinic's
// appointments are read as app_panel inside that clinic (inClinic), like the
// rest of the panel. Each appointment is claimed (reminder_sent_for = its
// starts_at) before the message goes out, so two runs at once never send it
// twice; a failed send gives the claim back.

export type ReminderRun = { sent: number; failed: number };

type Send = (message: WhatsAppTemplate) => Promise<void>;

type Due = {
  id: string;
  startsAt: Date;
  serviceName: string;
  patientName: string;
  phone: string;
};

export async function sendDueReminders(
  now: Date = new Date(),
  send: Send = (message) => sendWhatsAppTemplate(message),
): Promise<ReminderRun> {
  const run: ReminderRun = { sent: 0, failed: 0 };
  const list = await platformDb
    .select({
      id: clinics.id,
      name: clinics.name,
      displayName: clinics.displayName,
      timezone: clinics.timezone,
    })
    .from(clinics)
    .where(eq(clinics.isActive, true))
    .orderBy(asc(clinics.createdAt));

  for (const clinic of list) {
    try {
      const result = await remindClinic(clinic, now, send);
      run.sent += result.sent;
      run.failed += result.failed;
    } catch (error) {
      logger.error("whatsapp reminder: clinic run failed", {
        clinicId: clinic.id,
        error,
      });
      run.failed += 1;
    }
  }
  return run;
}

async function remindClinic(
  clinic: {
    id: string;
    name: string;
    displayName: string | null;
    timezone: string;
  },
  now: Date,
  send: Send,
): Promise<ReminderRun> {
  const run: ReminderRun = { sent: 0, failed: 0 };
  const { from, to } = tomorrowRange(now, clinic.timezone);
  const due = await inClinic(clinic.id, (tx) =>
    tx
      .select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        serviceName: appointments.serviceName,
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
          eq(appointments.clinicId, clinic.id),
          eq(appointments.whatsappReminder, true),
          eq(appointments.status, "confirmed"),
          gte(appointments.startsAt, from),
          lt(appointments.startsAt, to),
          notSentForThisStart(),
          isNotNull(patients.phone),
          isNull(patients.anonymizedAt),
        ),
      )
      .orderBy(asc(appointments.startsAt)),
  );

  const clinicName = clinic.displayName?.trim() || clinic.name;
  for (const row of due as Due[]) {
    const to = whatsappNumber(row.phone);
    if (!to) continue;
    if (!(await claim(clinic.id, row))) continue;
    try {
      await send({
        to,
        params: reminderParams({
          patientName: row.patientName,
          clinicName,
          serviceName: row.serviceName,
          startsAt: row.startsAt,
          timezone: clinic.timezone,
        }),
      });
    } catch (error) {
      run.failed += 1;
      logger.error("whatsapp reminder: send failed", {
        clinicId: clinic.id,
        appointmentId: row.id,
        error,
      });
      await release(clinic.id, row).catch(() => {});
      continue;
    }
    run.sent += 1;
    await inClinic(clinic.id, (tx) =>
      tx.insert(auditLogs).values({
        clinicId: clinic.id,
        actorType: "system",
        actorUserId: null,
        action: "appointment.reminder_sent",
        entityType: "appointment",
        entityId: row.id,
        changes: { channel: "whatsapp", startsAt: row.startsAt.toISOString() },
      }),
    ).catch((error: unknown) => {
      logger.error("whatsapp reminder: audit failed", {
        clinicId: clinic.id,
        appointmentId: row.id,
        error,
      });
    });
  }
  return run;
}

function notSentForThisStart() {
  return or(
    isNull(appointments.reminderSentFor),
    sql`${appointments.reminderSentFor} <> ${appointments.startsAt}`,
  );
}

// Marks the reminder as sent for this start, unless another run did, or the
// appointment changed since it was read.
async function claim(clinicId: string, row: Due): Promise<boolean> {
  const claimed = await inClinic(clinicId, (tx) =>
    tx
      .update(appointments)
      .set({ reminderSentFor: row.startsAt })
      .where(
        and(
          eq(appointments.id, row.id),
          eq(appointments.clinicId, clinicId),
          eq(appointments.status, "confirmed"),
          eq(appointments.whatsappReminder, true),
          eq(appointments.startsAt, row.startsAt),
          notSentForThisStart(),
        ),
      )
      .returning({ id: appointments.id }),
  );
  return claimed.length > 0;
}

async function release(clinicId: string, row: Due) {
  await inClinic(clinicId, (tx) =>
    tx
      .update(appointments)
      .set({ reminderSentFor: null })
      .where(
        and(
          eq(appointments.id, row.id),
          eq(appointments.clinicId, clinicId),
          eq(appointments.reminderSentFor, row.startsAt),
        ),
      ),
  );
}
