import "server-only";

import { and, asc, eq, gt, isNotNull, isNull, or, sql } from "drizzle-orm";

import { inClinic, platformDb } from "@/db/client";
import {
  appointments,
  auditLogs,
  clinics,
  patients,
  whatsappPending,
} from "@/db/schema";
import { logger } from "@/lib/logger";
import { recordMessage } from "@/modules/platform/message-log";

import { reminderParams, reminderText, whatsappNumber } from "./message";
import { sendWhatsAppTemplate, type WhatsAppTemplate } from "./whatsapp";

// The run of the WhatsApp reminder (GET /api/cron/lembretes, every 15 min from
// cron-job.org plus the daily Vercel cron). For every active clinic, the
// confirmed appointments whose patient asked for the reminder (or whose owner
// ticked it), now inside their chosen lead, not started, and without one for
// this start yet. The ticked box is her consent; the Cloud API template needs
// no message from her first.
//
// Root's role (app_platform) lists the clinics; each clinic's appointments are
// read as app_panel inside that clinic (inClinic). Each appointment is claimed
// (reminder_sent_for = its starts_at) before the message goes out, so two runs
// at once never send it twice; a failed send gives the claim back.

export type ReminderRun = { sent: number; failed: number };

type Send = (message: WhatsAppTemplate) => Promise<string | void>;

type Clinic = {
  id: string;
  name: string;
  displayName: string | null;
  timezone: string;
  slug: string;
  address: string | null;
};

type Due = {
  clinic: Clinic;
  id: string;
  startsAt: Date;
  serviceName: string;
  patientName: string;
  phone: string;
  senderId: string | null;
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
      slug: clinics.slug,
      address: clinics.address,
    })
    .from(clinics)
    .where(eq(clinics.isActive, true))
    .orderBy(asc(clinics.createdAt));

  const due: Due[] = [];
  for (const clinic of list) {
    try {
      due.push(...(await dueInClinic(clinic, now)));
    } catch (error) {
      logger.error("whatsapp reminder: clinic run failed", {
        clinicId: clinic.id,
        error,
      });
      run.failed += 1;
    }
  }
  // Soonest first, whatever the clinic: they have the least time left.
  due.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  for (const row of due) {
    const to = whatsappNumber(row.phone);
    if (!to) continue;
    if (!(await claim(row))) continue;
    const clinicName = row.clinic.displayName?.trim() || row.clinic.name;
    const params = reminderParams({
      patientName: row.patientName,
      clinicName,
      serviceName: row.serviceName,
      startsAt: row.startsAt,
      timezone: row.clinic.timezone,
      address: row.clinic.address,
    });
    const text = reminderText(params);
    const log = { clinicId: row.clinic.id, appointmentId: row.id, to };
    try {
      const body = await send({ to, params, button: row.clinic.slug });
      await recordMessage({ ...log, kind: "reminder", body: body || text });
    } catch (error) {
      await recordMessage({ ...log, kind: "reminder", body: text, error });
      run.failed += 1;
      logger.error("whatsapp reminder: send failed", {
        clinicId: row.clinic.id,
        appointmentId: row.id,
        error,
      });
      await release(row).catch(() => {});
      continue;
    }
    run.sent += 1;
    await afterSend(row, now).catch((error: unknown) => {
      logger.error("whatsapp reminder: bookkeeping failed", {
        clinicId: row.clinic.id,
        appointmentId: row.id,
        error,
      });
    });
  }
  return run;
}

async function afterSend(row: Due, now: Date) {
  if (row.senderId) {
    // Her "1" or "2" answers this appointment.
    await platformDb
      .insert(whatsappPending)
      .values({
        senderId: row.senderId,
        clinicId: row.clinic.id,
        appointmentId: row.id,
        sentAt: now,
      })
      .onConflictDoUpdate({
        target: whatsappPending.senderId,
        set: { clinicId: row.clinic.id, appointmentId: row.id, sentAt: now },
      });
  }
  await inClinic(row.clinic.id, (tx) =>
    tx.insert(auditLogs).values({
      clinicId: row.clinic.id,
      actorType: "system",
      actorUserId: null,
      action: "appointment.reminder_sent",
      entityType: "appointment",
      entityId: row.id,
      changes: { channel: "whatsapp", startsAt: row.startsAt.toISOString() },
    }),
  );
}

async function dueInClinic(clinic: Clinic, now: Date): Promise<Due[]> {
  const rows = await inClinic(clinic.id, (tx) =>
    tx
      .select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        serviceName: appointments.serviceName,
        patientName: patients.name,
        phone: patients.phone,
        senderId: patients.whatsappSenderId,
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
          // Inside its chosen lead (1 day, 3 h or 1 h) and not started yet.
          gt(appointments.startsAt, now),
          sql`${appointments.startsAt} - make_interval(mins => ${appointments.reminderLeadMinutes}) <= ${now}`,
          notSentForThisStart(),
          isNotNull(patients.phone),
          isNull(patients.anonymizedAt),
        ),
      )
      .orderBy(asc(appointments.startsAt)),
  );
  return rows.map((row) => ({ ...row, phone: row.phone!, clinic }));
}

function notSentForThisStart() {
  return or(
    isNull(appointments.reminderSentFor),
    sql`${appointments.reminderSentFor} <> ${appointments.startsAt}`,
  );
}

// Marks the reminder as sent for this start, unless another run did, or the
// appointment changed since it was read.
async function claim(row: Due): Promise<boolean> {
  const claimed = await inClinic(row.clinic.id, (tx) =>
    tx
      .update(appointments)
      .set({ reminderSentFor: row.startsAt })
      .where(
        and(
          eq(appointments.id, row.id),
          eq(appointments.clinicId, row.clinic.id),
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

async function release(row: Due) {
  await inClinic(row.clinic.id, (tx) =>
    tx
      .update(appointments)
      .set({ reminderSentFor: null })
      .where(
        and(
          eq(appointments.id, row.id),
          eq(appointments.clinicId, row.clinic.id),
          eq(appointments.reminderSentFor, row.startsAt),
        ),
      ),
  );
}
