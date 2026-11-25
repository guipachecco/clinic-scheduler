-- How long before the start the WhatsApp reminder goes out (src/modules/reminders/lead.ts):
-- 1 day, 3 hours or 1 hour. Existing rows keep the old 1 day. app_client keeps
-- the table-level INSERT of 0013, so she writes it on her own booking.
ALTER TABLE "appointments" ADD COLUMN "reminder_lead_minutes" smallint DEFAULT 1440 NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_reminder_lead_check" CHECK ("appointments"."reminder_lead_minutes" in (60, 180, 1440));