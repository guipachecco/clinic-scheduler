-- WhatsApp reminder the day before (src/modules/reminders, docs/lembrete-whatsapp.md).
-- whatsapp_reminder: the patient ticked "me avise 1 dia antes" when she booked
-- online, or the owner ticked it in the panel. Off for every existing row.
-- reminder_sent_for: the starts_at the reminder went out for; a rescheduled
-- appointment no longer matches it and gets a new reminder.
-- app_client keeps the table-level INSERT of 0013 (it writes whatsapp_reminder
-- on her own booking) and still reads only the columns of 0016. app_panel
-- already has the whole table.
ALTER TABLE "appointments" ADD COLUMN "whatsapp_reminder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "reminder_sent_for" timestamp with time zone;
