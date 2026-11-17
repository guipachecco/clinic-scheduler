-- Online booking with a Pix deposit (src/modules/asaas/deposits.ts): the
-- client's appointment is held as 'requested' until the deposit is paid. The
-- client may insert 'requested' only while the clinic charges deposits
-- (subaccount approved, Pix key ready, deposit switched on); otherwise only
-- 'confirmed', as before. The rest of the check is the one of 0014.

-- Whether the clinic charges a deposit on online bookings. Answers only that;
-- app_client has no access to asaas_accounts itself.
CREATE FUNCTION asaas_deposit_active(p_clinic_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM asaas_accounts
      WHERE clinic_id = p_clinic_id
        AND status = 'approved' AND pix_key_ready AND deposit_enabled
    )
  $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION asaas_deposit_active(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION asaas_deposit_active(uuid) TO app_client;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION asaas_deposit_active(uuid) TO app_panel;--> statement-breakpoint

ALTER POLICY appointments_client_insert ON appointments
  WITH CHECK (
    patient_id = nullif(current_setting('app.patient_id', true), '')::uuid
    AND clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid
    AND source = 'online'
    AND (
      status = 'confirmed'
      OR (status = 'requested' AND confirmed_at IS NULL AND asaas_deposit_active(clinic_id))
    )
    AND EXISTS (
      SELECT 1
      FROM services s
      JOIN service_categories c ON c.clinic_id = s.clinic_id AND c.id = s.category_id
      WHERE s.clinic_id = appointments.clinic_id
        AND s.id = appointments.service_id
        AND s.is_active AND s.online_booking_enabled AND NOT s.is_flexible
        AND c.is_active
    )
  );
