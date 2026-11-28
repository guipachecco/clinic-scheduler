import "server-only";

import { and, eq, gt, isNull } from "drizzle-orm";

import { inClinic, platformDb } from "@/db/client";
import {
  appointments,
  auditLogs,
  clinics,
  patients,
  whatsappOptInCodes,
  whatsappPending,
} from "@/db/schema";
import { logger } from "@/lib/logger";
import { recordMessage } from "@/modules/platform/message-log";

import {
  confirmedText,
  declinedText,
  optInAckText,
  optInCodeFrom,
  replyChoice,
  whatsappNumber,
} from "./message";
import { sendWhatsAppText } from "./whatsapp";

// Messages she sends to Zemana's number (the Meta webhook,
// /api/webhooks/whatsapp). An old activation code still links her number;
// her "1" or "2" answers the last reminder sent to her (whatsapp_pending). The codes and the pending map
// are app_platform's; the patient and the appointment are written inside
// their clinic (inClinic), like the rest of the panel.

type Send = (to: string, text: string) => Promise<void>;

// Sends and writes it to root's message log, sent or failed.
async function sendLogged(
  send: Send,
  to: string,
  body: string,
  log: Omit<Parameters<typeof recordMessage>[0], "to" | "body" | "error">,
) {
  try {
    await send(to, body);
  } catch (error) {
    await recordMessage({ ...log, to, body, error });
    throw error;
  }
  await recordMessage({ ...log, to, body });
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
    await sendLogged(send, to, optInAckText(name), {
      clinicId: row.clinicId,
      kind: "opt_in",
    });
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
  await sendLogged(
    send,
    to,
    choice === "confirmed" ? confirmedText(contact) : declinedText(contact),
    {
      clinicId: pending.clinicId,
      appointmentId: pending.appointmentId,
      kind: "reply",
    },
  ).catch((error: unknown) => {
    logger.error("whatsapp reply: follow-up failed", {
      clinicId: pending.clinicId,
      appointmentId: pending.appointmentId,
      error,
    });
  });
}
