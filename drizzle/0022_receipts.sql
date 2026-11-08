-- Money received outside a sale ("Receber" on an appointment, "Nova entrada").
-- The panel of the clinic reads, adds and reverses them; nothing deletes a
-- receipt and only the reversal columns ever change. Clients never see it.
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"appointment_id" uuid,
	"patient_id" uuid,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"payment_method_id" uuid NOT NULL,
	"received_on" date NOT NULL,
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_by_user_id" uuid,
	"reversal_reason" text,
	CONSTRAINT "receipts_amount_check" CHECK ("receipts"."amount_cents" > 0),
	CONSTRAINT "receipts_description_check" CHECK (char_length("receipts"."description") between 1 and 80),
	CONSTRAINT "receipts_notes_check" CHECK ("receipts"."notes" is null or char_length("receipts"."notes") <= 200),
	CONSTRAINT "receipts_reversal_check" CHECK (("receipts"."reversed_at" is null) = ("receipts"."reversal_reason" is null))
);
--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_reversed_by_user_id_users_id_fk" FOREIGN KEY ("reversed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_appointment_fk" FOREIGN KEY ("clinic_id","appointment_id") REFERENCES "public"."appointments"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "public"."patients"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_method_fk" FOREIGN KEY ("clinic_id","payment_method_id") REFERENCES "public"."payment_methods"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_appointment_active_idx" ON "receipts" USING btree ("appointment_id") WHERE "receipts"."appointment_id" is not null and "receipts"."reversed_at" is null;--> statement-breakpoint
CREATE INDEX "receipts_received_on_idx" ON "receipts" USING btree ("clinic_id","received_on");--> statement-breakpoint

GRANT SELECT, INSERT ON receipts TO app_panel;--> statement-breakpoint
GRANT UPDATE (reversed_at, reversed_by_user_id, reversal_reason) ON receipts TO app_panel;--> statement-breakpoint
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY receipts_panel ON receipts FOR ALL TO app_panel
  USING (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
  WITH CHECK (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);
