-- The client area reads only these columns of her own appointments
-- (listMyAppointments and the active-count check of bookOnline, in
-- src/modules/booking/booking.ts; bookOnline's INSERT ... RETURNING id needs
-- SELECT on id). Migration 0013 granted the whole row, which also held the
-- owner's notes (custom_label, cancellation_reason) and manage_token_hash.
-- INSERT stays as 0013 left it; the policies still pick her own rows.
REVOKE SELECT ON appointments FROM app_client;--> statement-breakpoint
GRANT SELECT (id, clinic_id, patient_id, service_name, starts_at, ends_at, status) ON appointments TO app_client;
