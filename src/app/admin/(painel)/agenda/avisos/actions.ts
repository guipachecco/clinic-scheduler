"use server";

import * as z from "zod";

import { requireAdmin } from "@/modules/auth/session";
import { markReminded } from "@/modules/reminders/manual";

// Marks the reminder of one appointment as sent, after the owner opened its
// WhatsApp conversation from the queue. The clinic and the author come from
// the session; only the appointment id travels from the browser.
export async function markRemindedAction(
  appointmentId: unknown,
): Promise<{ ok: boolean }> {
  const session = await requireAdmin();
  const id = z.uuid().safeParse(appointmentId);
  if (!id.success) return { ok: false };
  try {
    return {
      ok: await markReminded(session.clinicId, id.data, session.user.id),
    };
  } catch {
    return { ok: false };
  }
}
