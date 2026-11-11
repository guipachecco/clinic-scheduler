-- The size of an active clinic's cover, so the public page reserves its space
-- and Open Graph names it before the image arrives. No image bytes here.
CREATE FUNCTION client_clinic_cover_size(p_clinic uuid)
RETURNS TABLE (width integer, height integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.width, m.height
  FROM clinics c
  JOIN media m ON m.clinic_id = c.id AND m.id = c.cover_media_id
  WHERE c.id = p_clinic AND c.is_active
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION client_clinic_cover_size(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION client_clinic_cover_size(uuid) TO app_client;
