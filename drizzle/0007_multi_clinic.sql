ALTER TYPE "public"."user_role" ADD VALUE 'root';--> statement-breakpoint
CREATE TABLE "clinics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"professional_name" text,
	"professional_registration" text,
	"headline" text,
	"about" text,
	"whatsapp_phone" text,
	"contact_email" text,
	"address" text,
	"maps_url" text,
	"logo_media_id" uuid,
	"theme" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"min_advance_minutes" integer DEFAULT 120 NOT NULL,
	"max_advance_days" integer DEFAULT 60 NOT NULL,
	"slot_step_minutes" integer DEFAULT 30 NOT NULL,
	"cancellation_deadline_minutes" integer DEFAULT 1440 NOT NULL,
	"max_active_appointments_per_phone" integer DEFAULT 2 NOT NULL,
	"online_booking_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinics_slug_unique" UNIQUE("slug"),
	CONSTRAINT "clinics_slug_check" CHECK ("clinics"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "clinics_name_check" CHECK (char_length("clinics"."name") between 1 and 100),
	CONSTRAINT "clinics_min_advance_check" CHECK ("clinics"."min_advance_minutes" >= 0),
	CONSTRAINT "clinics_max_advance_check" CHECK ("clinics"."max_advance_days" between 1 and 365),
	CONSTRAINT "clinics_slot_step_check" CHECK ("clinics"."slot_step_minutes" between 5 and 240),
	CONSTRAINT "clinics_cancellation_deadline_check" CHECK ("clinics"."cancellation_deadline_minutes" >= 0),
	CONSTRAINT "clinics_max_active_check" CHECK ("clinics"."max_active_appointments_per_phone" between 1 and 20)
);
--> statement-breakpoint
ALTER TABLE "service_categories" DROP CONSTRAINT "service_categories_slug_unique";--> statement-breakpoint
ALTER TABLE "services" DROP CONSTRAINT "services_slug_unique";--> statement-breakpoint
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_patient_id_patients_id_fk";
--> statement-breakpoint
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_service_id_services_id_fk";
--> statement-breakpoint
ALTER TABLE "services" DROP CONSTRAINT "services_category_id_service_categories_id_fk";
--> statement-breakpoint
DROP INDEX "appointments_starts_at_idx";--> statement-breakpoint
DROP INDEX "business_hours_weekday_idx";--> statement-breakpoint
DROP INDEX "patients_phone_name_idx";--> statement-breakpoint
DROP INDEX "patients_cpf_idx";--> statement-breakpoint
DROP INDEX "time_blocks_period_idx";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "clinic_id" uuid;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "clinic_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "clinic_id" uuid;--> statement-breakpoint
ALTER TABLE "business_hours" ADD COLUMN "clinic_id" uuid;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "clinic_id" uuid;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "clinic_id" uuid;--> statement-breakpoint
ALTER TABLE "service_categories" ADD COLUMN "clinic_id" uuid;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "clinic_id" uuid;--> statement-breakpoint
ALTER TABLE "time_blocks" ADD COLUMN "clinic_id" uuid;--> statement-breakpoint
-- Existing data belongs to the first clinic, created from the old single
-- settings row. Its id is GRAIS_CLINIC_ID in src/db/schema/clinic.ts.
INSERT INTO "clinics" (
  "id", "slug", "name", "professional_name", "professional_registration",
  "headline", "about", "whatsapp_phone", "contact_email", "address",
  "maps_url", "logo_media_id", "theme", "timezone", "min_advance_minutes",
  "max_advance_days", "slot_step_minutes", "cancellation_deadline_minutes",
  "max_active_appointments_per_phone", "online_booking_enabled"
)
SELECT
  '00000000-0000-4000-8000-000000000100', 'grais',
  coalesce(nullif(btrim("clinic_name"), ''), 'Grais Saúde Integrativa'),
  "professional_name", "professional_registration", "headline", "about",
  "whatsapp_phone", "contact_email", "address", "maps_url", "logo_media_id",
  "theme", "timezone", "min_advance_minutes", "max_advance_days",
  "slot_step_minutes", "cancellation_deadline_minutes",
  "max_active_appointments_per_phone", "online_booking_enabled"
FROM "clinic_settings";--> statement-breakpoint
INSERT INTO "clinics" ("id", "slug", "name")
VALUES ('00000000-0000-4000-8000-000000000100', 'grais', 'Grais Saúde Integrativa')
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "users" SET "clinic_id" = '00000000-0000-4000-8000-000000000100' WHERE "role" = 'admin';--> statement-breakpoint
UPDATE "appointments" SET "clinic_id" = '00000000-0000-4000-8000-000000000100';--> statement-breakpoint
UPDATE "audit_logs" SET "clinic_id" = '00000000-0000-4000-8000-000000000100' WHERE "entity_type" <> 'user';--> statement-breakpoint
UPDATE "business_hours" SET "clinic_id" = '00000000-0000-4000-8000-000000000100';--> statement-breakpoint
UPDATE "media" SET "clinic_id" = '00000000-0000-4000-8000-000000000100';--> statement-breakpoint
UPDATE "patients" SET "clinic_id" = '00000000-0000-4000-8000-000000000100';--> statement-breakpoint
UPDATE "service_categories" SET "clinic_id" = '00000000-0000-4000-8000-000000000100';--> statement-breakpoint
UPDATE "services" SET "clinic_id" = '00000000-0000-4000-8000-000000000100';--> statement-breakpoint
UPDATE "time_blocks" SET "clinic_id" = '00000000-0000-4000-8000-000000000100';--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "clinic_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "business_hours" ALTER COLUMN "clinic_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ALTER COLUMN "clinic_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ALTER COLUMN "clinic_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "service_categories" ALTER COLUMN "clinic_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ALTER COLUMN "clinic_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "time_blocks" ALTER COLUMN "clinic_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinic_id_id_unique" UNIQUE("clinic_id","id");--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_clinic_id_id_unique" UNIQUE("clinic_id","id");--> statement-breakpoint
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_clinic_slug_unique" UNIQUE("clinic_id","slug");--> statement-breakpoint
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_clinic_id_id_unique" UNIQUE("clinic_id","id");--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_clinic_slug_unique" UNIQUE("clinic_id","slug");--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_clinic_id_id_unique" UNIQUE("clinic_id","id");--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_logo_media_id_media_id_fk" FOREIGN KEY ("logo_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "public"."patients"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_fk" FOREIGN KEY ("clinic_id","service_id") REFERENCES "public"."services"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_fk" FOREIGN KEY ("clinic_id","category_id") REFERENCES "public"."service_categories"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_clinic_id_idx" ON "users" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "audit_logs_clinic_id_idx" ON "audit_logs" USING btree ("clinic_id","created_at");--> statement-breakpoint
CREATE INDEX "media_clinic_id_idx" ON "media" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "appointments_starts_at_idx" ON "appointments" USING btree ("clinic_id","starts_at");--> statement-breakpoint
CREATE INDEX "business_hours_weekday_idx" ON "business_hours" USING btree ("clinic_id","weekday");--> statement-breakpoint
CREATE UNIQUE INDEX "patients_phone_name_idx" ON "patients" USING btree ("clinic_id","phone","name_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "patients_cpf_idx" ON "patients" USING btree ("clinic_id","cpf") WHERE "patients"."cpf" is not null;--> statement-breakpoint
CREATE INDEX "time_blocks_period_idx" ON "time_blocks" USING btree ("clinic_id","starts_at","ends_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_clinic_check" CHECK (("users"."role"::text = 'root') = ("users"."clinic_id" is null));--> statement-breakpoint
-- The overlap rule now applies inside each clinic: two clinics may book the
-- same time. btree_gist lets the exclusion constraint compare clinic_id.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_no_overlap";--> statement-breakpoint
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    "clinic_id" WITH =,
    tstzrange("occupied_from", "occupied_until", '[)') WITH &&
  )
  WHERE ("status" IN ('requested', 'confirmed'));