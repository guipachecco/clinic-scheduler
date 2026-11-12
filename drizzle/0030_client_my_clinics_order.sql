-- "Suas clínicas" gets a search, a useful order and the address of each
-- clinic. client_my_clinics (0027) also returns the clinic's address (public:
-- it is on the clinic's page) and the date of her last completed visit there,
-- for the order. The return type changes, so the function is dropped and
-- created again (in the migration's transaction), with the grants of 0021.
--
-- Compatible with the code still running when this applies: it reads the
-- function with select * and maps the columns by name, so the two new ones
-- are ignored.
--
-- Contract (unchanged): p_user must come from the authenticated session,
-- never from request input; the function trusts it.
DROP FUNCTION client_my_clinics(uuid);--> statement-breakpoint

CREATE FUNCTION client_my_clinics(p_user uuid)
RETURNS TABLE (
  slug text,
  name text,
  area_label text,
  has_photo boolean,
  cover_photo_id uuid,
  whatsapp_phone text,
  timezone text,
  online_booking_enabled boolean,
  rating_average numeric,
  rating_total integer,
  loyalty_visits integer,
  loyalty_reward text,
  loyalty_completed integer,
  loyalty_redeemed integer,
  next_starts_at timestamptz,
  next_service text,
  address text,
  last_visit_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.slug, coalesce(c.display_name, c.name), c.area_label,
         c.owner_photo_media_id IS NOT NULL,
         (SELECT ph.id FROM clinic_photos ph
           WHERE ph.clinic_id = c.id
           ORDER BY ph.position, ph.created_at, ph.id LIMIT 1),
         c.whatsapp_phone, c.timezone, c.online_booking_enabled,
         CASE WHEN 'reviews' = ANY(c.modules) THEN rs.average END,
         CASE WHEN 'reviews' = ANY(c.modules) THEN coalesce(rs.total, 0) ELSE 0 END,
         CASE WHEN c.loyalty_enabled AND c.loyalty_reward IS NOT NULL
              THEN c.loyalty_visits END,
         CASE WHEN c.loyalty_enabled THEN c.loyalty_reward END,
         vs.completed,
         (SELECT count(*)::integer FROM loyalty_redemptions l
           WHERE l.clinic_id = c.id AND l.patient_id = p.id),
         na.starts_at, na.service,
         c.address,
         vs.last_at
  FROM clinics c
  JOIN patients p
    ON p.clinic_id = c.id AND p.user_id = p_user AND p.anonymized_at IS NULL
  LEFT JOIN LATERAL (
    SELECT round(avg(r.rating), 1) AS average, count(r.id)::integer AS total
    FROM reviews r
    JOIN patients rp
      ON rp.clinic_id = r.clinic_id AND rp.id = r.patient_id
     AND rp.anonymized_at IS NULL
    WHERE r.clinic_id = c.id AND NOT r.is_hidden
  ) rs ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS completed, max(a.starts_at) AS last_at
    FROM appointments a
    WHERE a.clinic_id = c.id AND a.patient_id = p.id
      AND a.status = 'completed'
  ) vs ON true
  LEFT JOIN LATERAL (
    SELECT a.starts_at, coalesce(a.custom_label, a.service_name) AS service
    FROM appointments a
    WHERE a.clinic_id = c.id AND a.patient_id = p.id
      AND a.status IN ('requested', 'confirmed')
      AND a.starts_at >= now()
    ORDER BY a.starts_at
    LIMIT 1
  ) na ON true
  WHERE c.is_active
  ORDER BY coalesce(c.display_name, c.name), c.slug
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION client_my_clinics(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION client_my_clinics(uuid) TO app_client;
