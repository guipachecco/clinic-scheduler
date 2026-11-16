-- A client may book more than one service in one visit online (say, gel nails
-- and a foot detox). The appointment is the same block the panel creates
-- (0035): its main service in its own columns, the others as rows of
-- appointment_services. Until now app_client could only read those rows.
--
-- Additive only: the code still running when this applies never inserts
-- them as app_client.
--
-- She adds extras only to her own online appointment, only in the
-- transaction that books it (created_at is that transaction's now()), and
-- only services open to online booking, like the appointment's own service
-- (appointments_client_insert, 0014). The policy reads source and created_at
-- of her own appointment, so she gains SELECT on those two columns.
GRANT INSERT ON appointment_services TO app_client;--> statement-breakpoint
GRANT SELECT (source, created_at) ON appointments TO app_client;--> statement-breakpoint
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
