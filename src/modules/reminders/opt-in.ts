import "server-only";

import { and, eq, gt, isNull } from "drizzle-orm";

import { inClinic, platformDb } from "@/db/client";
import { findPgError } from "@/db/errors";
import {
  appointments,
  auditLogs,
  clinics,
  patients,
  whatsappOptInCodes,
  whatsappPending,
} from "@/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import {
  confirmedText,
  declinedText,
  newOptInCode,
  optInAckText,
  optInCodeFrom,
  optInMessage,
  replyChoice,
  whatsappNumber,
} from "./message";
import { sendWhatsAppText } from "./whatsapp";

// The patient writes first: the booking confirmation gives her a WhatsApp
// link to Zemana's number with a code; the Meta webhook
// (/api/webhooks/whatsapp) sees the code and turns her reminders on. Her
// sender id is the wa_id Meta gives her messages. Later her "1" or "2" answers the
// last reminder sent to her (whatsapp_pending). The codes and the pending map
// are app_platform's; the patient and the appointment are written inside
// their clinic (inClinic), like the rest of the panel.

type Send = (to: string, text: string) => Promise<void>;

// The activation link for a patient, or null when Zemana's number is not set
// or she already activated.
export async function optInLink(
  clinicId: string,
  patientId: string,
  clinicName: string,
): Promise<string | null> {
  if (!env.WHATSAPP_PHONE) return null;
  const [patient] = await inClinic(clinicId, (tx) =>
    tx
      .select({ optIn: patients.whatsappOptInAt })
      .from(patients)
      .where(and(eq(patients.id, patientId), eq(patients.clinicId, clinicId))),
  );
  if (!patient || patient.optIn) return null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = newOptInCode();
    try {
      await platformDb
        .insert(whatsappOptInCodes)
        .values({ code, clinicId, patientId });
    } catch (error) {
      if (findPgError(error)?.code === "23505") continue;
      throw error;
    }
    // api.whatsapp.com, not wa.me: wa.me turns emoji into "�" on the way.
    return `https://api.whatsapp.com/send?phone=${env.WHATSAPP_PHONE}&text=${encodeURIComponent(optInMessage(clinicName, code))}`;
  }
  return null;
}

// One message she sent to Zemana's number (the webhook already checked it is
// hers, not ours). Activation codes first, then "1"/"2"; anything else is
// left alone.
export async function handleIncoming(
  senderId: string,
  text: string,
  now: Date = new Date(),
  send: Send = sendWhatsAppText,
): Promise<void> {
  const code = optInCodeFrom(text);
  if (code) {
    await activate(code, senderId, now, send);
    return;
  }
  const choice = replyChoice(text);
  if (choice) await answer(senderId, choice, now, send);
}

async function activate(code: string, senderId: string, now: Date, send: Send) {
  const [row] = await platformDb
    .select()
    .from(whatsappOptInCodes)
    .where(eq(whatsappOptInCodes.code, code));
  if (!row) return;
  const result = await inClinic(row.clinicId, async (tx) => {
    const [patient] = await tx
      .update(patients)
      .set({ whatsappOptInAt: now, whatsappSenderId: senderId })
      .where(
        and(
          eq(patients.id, row.patientId),
          eq(patients.clinicId, row.clinicId),
          isNull(patients.anonymizedAt),
        ),
      )
      .returning({ phone: patients.phone });
    const [clinic] = await tx
      .select({ name: clinics.name, displayName: clinics.displayName })
      .from(clinics)
      .where(eq(clinics.id, row.clinicId));
    return patient && clinic ? { phone: patient.phone, clinic } : null;
  });
  if (!result) return;
  // Every code of hers is spent: the next booking asks nothing.
  await platformDb
    .delete(whatsappOptInCodes)
    .where(eq(whatsappOptInCodes.patientId, row.patientId));
  const to = result.phone ? whatsappNumber(result.phone) : null;
  if (to) {
    const name = result.clinic.displayName?.trim() || result.clinic.name;
    await send(to, optInAckText(name));
  }
}

async function answer(
  senderId: string,
  choice: "confirmed" | "declined",
  now: Date,
  send: Send,
) {
  const [pending] = await platformDb
    .select()
    .from(whatsappPending)
    .where(eq(whatsappPending.senderId, senderId));
  if (!pending) return;
  const result = await inClinic(pending.clinicId, async (tx) => {
    const [current] = await tx
      .select({
        reply: appointments.patientReply,
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
          eq(appointments.id, pending.appointmentId),
          eq(appointments.clinicId, pending.clinicId),
          eq(appointments.status, "confirmed"),
          gt(appointments.startsAt, now),
        ),
      );
    // Gone, past, or the same answer again (a webhook retry): nothing to do.
    if (!current || current.reply === choice) return null;
    await tx
      .update(appointments)
      .set({ patientReply: choice, patientReplyAt: now })
      .where(
        and(
          eq(appointments.id, pending.appointmentId),
          eq(appointments.clinicId, pending.clinicId),
        ),
      );
    await tx.insert(auditLogs).values({
      clinicId: pending.clinicId,
      actorType: "system",
      actorUserId: null,
      action: "appointment.patient_replied",
      entityType: "appointment",
      entityId: pending.appointmentId,
      changes: { channel: "whatsapp", reply: choice },
    });
    const [clinic] = await tx
      .select({
        name: clinics.name,
        displayName: clinics.displayName,
        address: clinics.address,
        mapsUrl: clinics.mapsUrl,
        whatsappPhone: clinics.whatsappPhone,
      })
      .from(clinics)
      .where(eq(clinics.id, pending.clinicId));
    return clinic ? { phone: current.phone, clinic } : null;
  });
  if (!result) return;
  const to = result.phone ? whatsappNumber(result.phone) : null;
  if (!to) return;
  const contact = {
    clinicName: result.clinic.displayName?.trim() || result.clinic.name,
    address: result.clinic.address,
    mapsUrl: result.clinic.mapsUrl,
    clinicPhone: result.clinic.whatsappPhone,
  };
  await send(
    to,
    choice === "confirmed" ? confirmedText(contact) : declinedText(contact),
  ).catch((error: unknown) => {
    logger.error("whatsapp reply: follow-up failed", {
      clinicId: pending.clinicId,
      appointmentId: pending.appointmentId,
      error,
    });
  });
}
