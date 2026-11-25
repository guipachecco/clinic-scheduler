import { z } from "zod";

// How long before the appointment the WhatsApp reminder goes out (migration
// 0042). Shared by the online booking, the panel form and the cron, so it
// carries no server-only code.
export const REMINDER_LEADS = [
  { minutes: 1440, label: "1 dia antes" },
  { minutes: 180, label: "3 horas antes" },
  { minutes: 60, label: "1 hora antes" },
] as const;

export type ReminderLead = (typeof REMINDER_LEADS)[number]["minutes"];

export const DEFAULT_REMINDER_LEAD: ReminderLead = 1440;

export const reminderLeadSchema = z.coerce
  .number()
  .refine(
    (value): value is ReminderLead =>
      REMINDER_LEADS.some((lead) => lead.minutes === value),
    { error: "Escolha quando avisar." },
  );

export function reminderLeadLabel(minutes: number): string {
  return (
    REMINDER_LEADS.find((lead) => lead.minutes === minutes)?.label ??
    `${minutes} min antes`
  );
}
