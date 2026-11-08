-- The active clinics where the signed-in client has a patients row (provisional
-- rows count, anonymized ones do not), for her "Suas clínicas" page. She
-- belongs to no clinic, so this crosses clinics on purpose and exposes only
-- public data: slug, display name, area label and whether the clinic has an
-- owner photo.
CREATE FUNCTION client_my_clinics(p_user uuid)
RETURNS TABLE (slug text, name text, area_label text, has_photo boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.slug, coalesce(c.display_name, c.name) AS name, c.area_label,
         c.owner_photo_media_id IS NOT NULL AS has_photo
  FROM clinics c
  WHERE c.is_active
    AND EXISTS (
      SELECT 1 FROM patients p
      WHERE p.clinic_id = c.id AND p.user_id = p_user AND p.anonymized_at IS NULL
    )
  ORDER BY coalesce(c.display_name, c.name), c.slug
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION client_my_clinics(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION client_my_clinics(uuid) TO app_client;
