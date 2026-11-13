-- A visit may have more than one service (say, gel nails and a foot detox in
-- one go). The appointment stays one row of the agenda: its service_id is the
-- first service, service_name joins every name and service_duration_minutes
-- is the total. appointment_services lists the services of such a visit; an
-- appointment with a single service has no rows here.
--
-- Additive only: the code still running when this applies never names the
-- table, and keeps booking one service per appointment.
CREATE TABLE "appointment_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"service_name" text NOT NULL,
	"duration_minutes" integer NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_services_service_unique" UNIQUE("appointment_id","service_id"),
	CONSTRAINT "appointment_services_position_unique" UNIQUE("appointment_id","position"),
	CONSTRAINT "appointment_services_duration_check" CHECK ("appointment_services"."duration_minutes" > 0),
	CONSTRAINT "appointment_services_position_check" CHECK ("appointment_services"."position" between 0 and 9)
);
--> statement-breakpoint
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_appointment_fk" FOREIGN KEY ("clinic_id","appointment_id") REFERENCES "public"."appointments"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_services" ADD CONSTRAINT "appointment_services_service_fk" FOREIGN KEY ("clinic_id","service_id") REFERENCES "public"."services"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_services_service_idx" ON "appointment_services" USING btree ("clinic_id","service_id");--> statement-breakpoint

-- app_panel: the rows of its own clinic. It reads them, and deletes them when
-- the owner changes the appointment's service. No UPDATE.
GRANT SELECT, INSERT, DELETE ON appointment_services TO app_panel;--> statement-breakpoint
ALTER TABLE appointment_services ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY appointment_services_panel ON appointment_services FOR ALL TO app_panel
  USING (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
  WITH CHECK (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);--> statement-breakpoint

-- app_client: the services of her own appointments. She adds them only in
-- the transaction that books the appointment (created_at is that
-- transaction's now()), and only services open to online booking, like the
-- appointment's own service (appointments_client_insert, 0014). The insert
-- policy reads source and created_at of her own appointment, so she gains
-- SELECT on those two columns.
GRANT SELECT, INSERT ON appointment_services TO app_client;--> statement-breakpoint
GRANT SELECT (source, created_at) ON appointments TO app_client;--> statement-breakpoint
CREATE POLICY appointment_services_client_select ON appointment_services FOR SELECT TO app_client
  USING (
    clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.clinic_id = appointment_services.clinic_id
        AND a.id = appointment_services.appointment_id
        AND a.patient_id = nullif(current_setting('app.patient_id', true), '')::uuid
    )
  );--> statement-breakpoint
CREATE POLICY appointment_services_client_insert ON appointment_services FOR INSERT TO app_client
  WITH CHECK (
    clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.clinic_id = appointment_services.clinic_id
        AND a.id = appointment_services.appointment_id
        AND a.patient_id = nullif(current_setting('app.patient_id', true), '')::uuid
        AND a.source = 'online'
        AND a.created_at = now()
    )
    AND EXISTS (
      SELECT 1
      FROM services s
      JOIN service_categories c ON c.clinic_id = s.clinic_id AND c.id = s.category_id
      WHERE s.clinic_id = appointment_services.clinic_id
        AND s.id = appointment_services.service_id
        AND s.is_active AND s.online_booking_enabled AND NOT s.is_flexible
        AND c.is_active
    )
  );
