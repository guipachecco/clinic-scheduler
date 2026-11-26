-- WhatsApp reminders only after the patient writes first (src/modules/reminders):
-- activation codes, the last reminder per sender (for her "1"/"2" reply) and
-- the daily count for the warm-up. patients and appointments get the opt-in
-- and the reply; app_panel already has both whole tables.
CREATE TABLE "whatsapp_daily_sends" (
	"day" date PRIMARY KEY NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_opt_in_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_pending" (
	"sender_id" text PRIMARY KEY NOT NULL,
	"clinic_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"sent_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patients" DROP CONSTRAINT "patients_anonymized_check";--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "patient_reply" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "patient_reply_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "whatsapp_opt_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "whatsapp_sender_id" text;--> statement-breakpoint
CREATE INDEX "whatsapp_opt_in_codes_patient_idx" ON "whatsapp_opt_in_codes" USING btree ("patient_id");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_reply_check" CHECK ("appointments"."patient_reply" in ('confirmed', 'declined'));--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_anonymized_check" CHECK ("patients"."anonymized_at" is null or ("patients"."phone" is null and "patients"."email" is null and "patients"."name_normalized" is null and "patients"."nickname" is null and "patients"."cpf" is null and "patients"."rg" is null and "patients"."landline_phone" is null and "patients"."birth_date" is null and "patients"."gender" is null and "patients"."referral_source" is null and "patients"."referred_by" is null and "patients"."notes" is null and "patients"."user_id" is null and "patients"."whatsapp_sender_id" is null));--> statement-breakpoint
-- Zemana's own WhatsApp number serves every clinic: only app_platform reads
-- and writes these, never a clinic, panel or client.
ALTER TABLE "whatsapp_opt_in_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "whatsapp_pending" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "whatsapp_daily_sends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_opt_in_codes, whatsapp_pending, whatsapp_daily_sends TO app_platform;--> statement-breakpoint
CREATE POLICY whatsapp_opt_in_codes_platform ON whatsapp_opt_in_codes FOR ALL TO app_platform USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY whatsapp_pending_platform ON whatsapp_pending FOR ALL TO app_platform USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY whatsapp_daily_sends_platform ON whatsapp_daily_sends FOR ALL TO app_platform USING (true) WITH CHECK (true);
