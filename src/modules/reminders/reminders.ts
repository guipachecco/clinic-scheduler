import "server-only";

import { and, asc, eq, gt, isNotNull, isNull, or, sql } from "drizzle-orm";
import { DateTime } from "luxon";

import { inClinic, platformDb } from "@/db/client";
import {
  appointments,
  auditLogs,
  clinics,
  patients,
  whatsappDailySends,
  whatsappPending,
} from "@/db/schema";
import { logger } from "@/lib/logger";
import { recordMessage } from "@/modules/platform/message-log";

import {
  reminderParams,
  reminderText,
  warmUpLimit,
  whatsappNumber,
} from "./message";
import { sendWhatsAppTemplate, type WhatsAppTemplate } from "./whatsapp";

// The run of the WhatsApp reminder (GET /api/cron/lembretes, every 15 min from
// cron-job.org plus the daily Vercel cron). For every active clinic, the
// confirmed appointments whose patient asked for the reminder (or whose owner
// ticked it) AND activated it by writing to Zemana's number first, now inside
// their chosen lead, not started, and without one for this start yet.
//
// To keep the number from being restricted: at most the warm-up limit per day
// (whatsapp_daily_sends), a random 30-120 s pause between messages, and a run
// stops before the route's time limit; what is left goes on the next run.
//
// Root's role (app_platform) lists the clinics and keeps the counters; each
// clinic's appointments are read as app_panel inside that clinic (inClinic).
// Each appointment is claimed (reminder_sent_for = its starts_at) before the
// message goes out, so two runs at once never send it twice; a failed send
// gives the claim back.

export type ReminderRun = { sent: number; failed: number };

type Send = (message: WhatsAppTemplate) => Promise<string | void>;

export type Pace = {
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  elapsedMs: () => number;
};

const ZONE = "America/Sao_Paulo";
const MIN_PAUSE_MS = 30_000;
const MAX_PAUSE_MS = 120_000;
// The route may run 300 s; leave room for the last send.
const RUN_BUDGET_MS = 240_000;

function realPace(): Pace {
  const started = Date.now();
  return {
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random: Math.random,
    elapsedMs: () => Date.now() - started,
  };
}

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
  pace: Pace = realPace(),
): Promise<ReminderRun> {
  const run: ReminderRun = { sent: 0, failed: 0 };
  let left = await remainingToday(now);
  if (left <= 0) return run;

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

  let first = true;
  for (const row of due) {
    if (left <= 0) break;
    const to = whatsappNumber(row.phone);
    if (!to) continue;
    if (!first) {
      const pause =
        MIN_PAUSE_MS +
        Math.round(pace.random() * (MAX_PAUSE_MS - MIN_PAUSE_MS));
      if (pace.elapsedMs() + pause > RUN_BUDGET_MS) break;
      await pace.sleep(pause);
    }
    first = false;
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
    left -= 1;
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

// Today's warm-up limit minus what already went out today (Brasília days).
async function remainingToday(now: Date): Promise<number> {
  const today = DateTime.fromJSDate(now, { zone: ZONE }).toISODate()!;
  const [stats] = await platformDb
    .select({
      first: sql<string | null>`min(${whatsappDailySends.day})::text`,
      today: sql<number>`coalesce(sum(${whatsappDailySends.sent}) filter (where ${whatsappDailySends.day} = ${today}), 0)::int`,
    })
    .from(whatsappDailySends);
  const days = stats?.first
    ? Math.floor(
        DateTime.fromISO(today).diff(DateTime.fromISO(stats.first), "days")
          .days,
      )
    : 0;
  return warmUpLimit(days) - (stats?.today ?? 0);
}

async function afterSend(row: Due, now: Date) {
  const today = DateTime.fromJSDate(now, { zone: ZONE }).toISODate()!;
  await platformDb
    .insert(whatsappDailySends)
    .values({ day: today, sent: 1 })
    .onConflictDoUpdate({
      target: whatsappDailySends.day,
      set: { sent: sql`${whatsappDailySends.sent} + 1` },
    });
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
          // She wrote to Zemana's number first.
          isNotNull(patients.whatsappOptInAt),
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
