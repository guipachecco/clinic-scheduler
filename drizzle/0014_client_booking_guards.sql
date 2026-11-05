-- Database guards for online booking (src/modules/booking/booking.ts), on top
-- of the checks the server repeats under the agenda lock:
-- - app_client sees a clinic only while it is active, like client_context;
-- - the busy intervals of a clinic are readable only while it takes online
--   bookings;
-- - a client's appointment must be for a service open to online booking:
--   active, online, not flexible, in an active category of the same clinic.
-- tests/integration/client-access.test.ts checks them.

ALTER POLICY clinics_client ON clinics
  USING (id = nullif(current_setting('app.clinic_id', true), '')::uuid AND is_active);--> statement-breakpoint

ALTER POLICY appointments_client_insert ON appointments
  WITH CHECK (
    patient_id = nullif(current_setting('app.patient_id', true), '')::uuid
    AND clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid
    AND source = 'online' AND status = 'confirmed'
    AND EXISTS (
      SELECT 1
      FROM services s
      JOIN service_categories c ON c.clinic_id = s.clinic_id AND c.id = s.category_id
      WHERE s.clinic_id = appointments.clinic_id
        AND s.id = appointments.service_id
        AND s.is_active AND s.online_booking_enabled AND NOT s.is_flexible
        AND c.is_active
    )
  );--> statement-breakpoint

-- Same as in 0013, plus online_booking_enabled in the last condition.
-- CREATE OR REPLACE keeps the EXECUTE grants of 0013.
CREATE OR REPLACE FUNCTION client_busy_intervals(p_clinic uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (starts_at timestamptz, ends_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to OR p_to - p_from > interval '400 days' THEN
    RAISE EXCEPTION 'Período inválido' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT busy.starts_at, busy.ends_at
  FROM (
    SELECT least(a.occupied_from, a.starts_at - make_interval(mins => s.buffer_before_minutes)) AS starts_at,
           greatest(a.occupied_until, a.ends_at + make_interval(mins => s.buffer_after_minutes)) AS ends_at
    FROM appointments a
    JOIN services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
    WHERE a.clinic_id = p_clinic
      AND a.status IN ('requested', 'confirmed')
      AND a.occupied_from < p_to + interval '1 day'
      AND a.occupied_until > p_from - interval '1 day'
    UNION ALL
    SELECT b.starts_at, b.ends_at
    FROM time_blocks b
    WHERE b.clinic_id = p_clinic
      AND b.starts_at < p_to AND b.ends_at > p_from
  ) busy
  WHERE busy.starts_at < p_to AND busy.ends_at > p_from
    AND EXISTS (
      SELECT 1 FROM clinics c
      WHERE c.id = p_clinic AND c.is_active AND c.online_booking_enabled
    )
  ORDER BY busy.starts_at, busy.ends_at;
END
$$;
