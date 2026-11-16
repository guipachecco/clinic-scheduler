-- Appointment services: the extra procedures of an appointment, in order.
--
-- Additive only: the old code is still running when this applies and never
-- names the new table. The appointment keeps its main service in its own
-- columns; existing appointments simply have no extras. The (clinic_id, id)
-- uniques the composite foreign keys need already exist on appointments (0009)
-- and services.
CREATE TABLE "appointment_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"service_name" text NOT NULL,
	"service_duration_minutes" integer NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_services_service_unique" UNIQUE("appointment_id","service_id"),
	CONSTRAINT "appointment_services_position_unique" UNIQUE("appointment_id","position"),
	CONSTRAINT "appointment_services_position_check" CHECK ("appointment_services"."position" between 1 and 9)
);
--> statement-breakpoint
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_appointment_fk" FOREIGN KEY ("clinic_id","appointment_id") REFERENCES "public"."appointments"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_service_fk" FOREIGN KEY ("clinic_id","service_id") REFERENCES "public"."services"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_services_service_id_idx" ON "appointment_services" USING btree ("service_id");--> statement-breakpoint

-- app_panel: reads, adds and removes the extras of its own clinic (changing an
-- appointment's procedures replaces the rows; nothing updates them).
-- app_client: reads only the extras of her own appointments. The subquery on
-- appointments runs under that table's own policy, which already limits it to
-- her patient and clinic. Platform and auth have no grant.
GRANT SELECT, INSERT, DELETE ON appointment_services TO app_panel;--> statement-breakpoint
GRANT SELECT ON appointment_services TO app_client;--> statement-breakpoint
ALTER TABLE appointment_services ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY appointment_services_panel ON appointment_services FOR ALL TO app_panel
  USING (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
  WITH CHECK (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY appointment_services_client_select ON appointment_services FOR SELECT TO app_client
  USING (
    clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid
    AND appointment_id IN (SELECT id FROM appointments)
  );
