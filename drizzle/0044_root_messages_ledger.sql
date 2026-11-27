-- Root screens: one row per WhatsApp message sent (proof per clinic) and
-- Zemana's own money in and bills (src/modules/platform).
CREATE TABLE "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"appointment_id" uuid,
	"kind" text NOT NULL,
	"phone_last4" text NOT NULL,
	"body" text NOT NULL,
	"ok" boolean NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zemana_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"direction" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"due_on" date NOT NULL,
	"paid_on" date,
	"clinic_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zemana_ledger_direction_check" CHECK ("zemana_ledger"."direction" in ('in', 'out')),
	CONSTRAINT "zemana_ledger_amount_check" CHECK ("zemana_ledger"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE INDEX "whatsapp_messages_clinic_created_idx" ON "whatsapp_messages" USING btree ("clinic_id","created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_created_at_idx" ON "whatsapp_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "zemana_ledger_due_on_idx" ON "zemana_ledger" USING btree ("due_on");--> statement-breakpoint
-- Root's area only: app_platform reads and writes these, never a clinic,
-- panel or client.
ALTER TABLE "whatsapp_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "zemana_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON whatsapp_messages TO app_platform;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON zemana_ledger TO app_platform;--> statement-breakpoint
CREATE POLICY whatsapp_messages_platform ON whatsapp_messages FOR ALL TO app_platform USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY zemana_ledger_platform ON zemana_ledger FOR ALL TO app_platform USING (true) WITH CHECK (true);
