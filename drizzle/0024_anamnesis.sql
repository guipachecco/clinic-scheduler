CREATE TYPE "public"."anamnesis_status" AS ENUM('in_progress', 'completed');--> statement-breakpoint
CREATE TABLE "anamneses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"template" text NOT NULL,
	"taken_on" date NOT NULL,
	"status" "anamnesis_status" DEFAULT 'in_progress' NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anamneses_answers_size_check" CHECK (pg_column_size("anamneses"."answers") <= 200000)
);
--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "anamnesis_template" text;--> statement-breakpoint
ALTER TABLE "anamneses" ADD CONSTRAINT "anamneses_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anamneses" ADD CONSTRAINT "anamneses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anamneses" ADD CONSTRAINT "anamneses_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anamneses" ADD CONSTRAINT "anamneses_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "public"."patients"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anamneses_patient_idx" ON "anamneses" USING btree ("clinic_id","patient_id","taken_on" DESC NULLS LAST);--> statement-breakpoint
-- The Grais clinic starts with the integrative anamnesis on (GRAIS_CLINIC_ID).
UPDATE "clinics" SET "anamnesis_template" = 'integrativa-ads-v1' WHERE "id" = '00000000-0000-4000-8000-000000000100';--> statement-breakpoint

-- Anamneses: only the panel of the clinic reads and writes them. app_panel has
-- only column-level UPDATE on clinics, so anamnesis_template stays out of it.
-- Clients, platform and auth have no grant at all.
GRANT SELECT, INSERT, UPDATE, DELETE ON anamneses TO app_panel;--> statement-breakpoint
ALTER TABLE anamneses ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY anamneses_panel ON anamneses FOR ALL TO app_panel
  USING (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
  WITH CHECK (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);
