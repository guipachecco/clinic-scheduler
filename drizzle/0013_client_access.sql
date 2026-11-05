-- What app_client, the role of the client booking area, may reach. asClient
-- (src/db/client.ts) sets, for each transaction:
--   app.clinic_id  - the clinic whose page she is on;
--   app.patient_id - her own patients row in that clinic;
--   app.user_id    - her account.
-- Without them every comparison is null: no rows.
--
-- She reads the clinic's public columns, its bookable services, her own row
-- and her own appointments, books confirmed online appointments for herself
-- and writes their audit rows. Nothing else: no finance, auth or media table,
-- and no audit SELECT (tests/integration/client-access.test.ts checks it).
--
-- What she needs beyond her own rows goes through the SECURITY DEFINER
-- functions below. They run as the migration owner, which owns the tables and
-- is not bound by RLS, so every query in them filters by p_clinic (and p_user)
-- explicitly and returns only the columns listed. EXECUTE is for app_client
-- only.

-- Public clinic columns: those of PublicClinic (src/modules/clients/context.ts).
GRANT SELECT (id, slug, name, display_name, whatsapp_phone, contact_email, address, maps_url, online_booking_enabled, min_advance_minutes, max_advance_days, slot_step_minutes, max_active_appointments_per_phone, timezone) ON clinics TO app_client;--> statement-breakpoint
CREATE POLICY clinics_client ON clinics FOR SELECT TO app_client
  USING (id = nullif(current_setting('app.clinic_id', true), '')::uuid);--> statement-breakpoint

-- Services she may book: active, open to online booking and not flexible.
-- requires_approval is ignored online, so it is not readable.
GRANT SELECT (id, clinic_id, category_id, name, slug, description, duration_minutes, buffer_before_minutes, buffer_after_minutes, price_cents, price_display, online_booking_enabled, preparation_instructions, is_flexible, is_active, sort_order) ON services TO app_client;--> statement-breakpoint
CREATE POLICY services_client ON services FOR SELECT TO app_client
  USING (
    clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid
    AND is_active AND online_booking_enabled AND NOT is_flexible
  );--> statement-breakpoint

GRANT SELECT ON patients TO app_client;--> statement-breakpoint
CREATE POLICY patients_client ON patients FOR SELECT TO app_client
  USING (
    id = nullif(current_setting('app.patient_id', true), '')::uuid
    AND clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid
  );--> statement-breakpoint

-- Her appointments. She only creates confirmed online ones; only the owner
-- cancels or reschedules, so there is no UPDATE or DELETE.
GRANT SELECT, INSERT ON appointments TO app_client;--> statement-breakpoint
CREATE POLICY appointments_client_select ON appointments FOR SELECT TO app_client
  USING (
    patient_id = nullif(current_setting('app.patient_id', true), '')::uuid
    AND clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid
  );--> statement-breakpoint
CREATE POLICY appointments_client_insert ON appointments FOR INSERT TO app_client
  WITH CHECK (
    patient_id = nullif(current_setting('app.patient_id', true), '')::uuid
    AND clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid
    AND source = 'online' AND status = 'confirmed'
  );--> statement-breakpoint

-- Audit rows of her own actions, in this clinic. No SELECT.
GRANT INSERT ON audit_logs TO app_client;--> statement-breakpoint
CREATE POLICY audit_logs_client ON audit_logs FOR INSERT TO app_client
  WITH CHECK (
    actor_type = 'patient'
    AND clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid
    AND actor_user_id = nullif(current_setting('app.user_id', true), '')::uuid
  );--> statement-breakpoint

-- The active clinic for the slug and the user's patients row in it
-- (patient_id null when she has none). No row for an unknown or suspended
-- clinic. pending: her row is a provisional record (see below).
CREATE FUNCTION client_context(p_slug text, p_user uuid)
RETURNS TABLE (clinic_id uuid, patient_id uuid, pending boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id, p.id, coalesce(p.pending_link_patient_id IS NOT NULL, false)
  FROM clinics c
  LEFT JOIN patients p ON p.clinic_id = c.id AND p.user_id = p_user
  WHERE c.slug = p_slug AND c.is_active
$$;--> statement-breakpoint

-- Creates the client's patients row in a clinic and returns its id. When a
-- non-anonymized patient of the clinic already has that phone, the new row is
-- a provisional record pointing at it (pending_link_patient_id) until the
-- owner says whether it is the same person; she never sees the matched row.
-- If several match: first those without an account, then the oldest.
-- Raises P0001 when she already has a row in the clinic, 22023 for invalid
-- input. Messages never carry the input.
CREATE FUNCTION register_client_patient(p_clinic uuid, p_user uuid, p_name text, p_phone text, p_email text)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_match uuid;
  v_id uuid;
  v_constraint text;
BEGIN
  IF char_length(v_name) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Nome inválido' USING ERRCODE = '22023';
  END IF;
  IF p_phone IS NULL OR p_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'Telefone inválido' USING ERRCODE = '22023';
  END IF;
  IF v_email IS NOT NULL
     AND (char_length(v_email) > 254 OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$') THEN
    RAISE EXCEPTION 'E-mail inválido' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM clinics c WHERE c.id = p_clinic AND c.is_active) THEN
    RAISE EXCEPTION 'Clínica inválida' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user AND u.role::text = 'client') THEN
    RAISE EXCEPTION 'Conta inválida' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM patients p WHERE p.clinic_id = p_clinic AND p.user_id = p_user) THEN
    RAISE EXCEPTION 'Cadastro já existe nesta clínica' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.id INTO v_match
  FROM patients p
  WHERE p.clinic_id = p_clinic
    AND p.phone = p_phone
    AND p.anonymized_at IS NULL
    AND p.pending_link_patient_id IS NULL
  ORDER BY (p.user_id IS NOT NULL), p.created_at, p.id
  LIMIT 1;

  BEGIN
    INSERT INTO patients (clinic_id, user_id, name, name_normalized, phone, email, pending_link_patient_id)
    VALUES (
      p_clinic, p_user, v_name,
      -- Same result as normalizeName (src/modules/patients/fields.ts):
      -- no accents, lowercase, single inner spaces.
      btrim(regexp_replace(lower(regexp_replace(normalize(v_name, NFD), '[̀-ͯ]', '', 'g')), '\s+', ' ', 'g')),
      p_phone, v_email, v_match
    )
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'patients_user_id_idx' THEN
      RAISE EXCEPTION 'Cadastro já existe nesta clínica' USING ERRCODE = 'P0001';
    END IF;
    RAISE;
  END;
  RETURN v_id;
END
$$;--> statement-breakpoint

-- Busy time of a clinic between p_from and p_to, with no names or ids: the
-- active appointments (statuses of ACTIVE_APPOINTMENT_STATUSES and of the
-- appointments_no_overlap constraint), widened by their service's buffers,
-- and the time blocks (holidays are blocks too). The occupied range already
-- holds the buffers the appointment was booked with; the service's current
-- buffers are applied too, whichever is wider. At most 400 days at a time.
CREATE FUNCTION client_busy_intervals(p_clinic uuid, p_from timestamptz, p_to timestamptz)
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
    AND EXISTS (SELECT 1 FROM clinics c WHERE c.id = p_clinic AND c.is_active)
  ORDER BY busy.starts_at, busy.ends_at;
END
$$;--> statement-breakpoint

-- Weekly opening hours of an active clinic (weekday 0 = Sunday; local times).
CREATE FUNCTION client_business_hours(p_clinic uuid)
RETURNS TABLE (weekday smallint, opens time, closes time)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT h.weekday, h.start_time, h.end_time
  FROM business_hours h
  JOIN clinics c ON c.id = h.clinic_id AND c.is_active
  WHERE h.clinic_id = p_clinic
  ORDER BY h.weekday, h.start_time, h.end_time
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION client_context(text, uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION register_client_patient(uuid, uuid, text, text, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION client_busy_intervals(uuid, timestamptz, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION client_business_hours(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION client_context(text, uuid) TO app_client;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION register_client_patient(uuid, uuid, text, text, text) TO app_client;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION client_busy_intervals(uuid, timestamptz, timestamptz) TO app_client;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION client_business_hours(uuid) TO app_client;
