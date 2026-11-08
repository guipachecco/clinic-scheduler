-- Photos of the clinic's space and work for its public page (the first one is
-- the cover). Each row points at an image in media of the same clinic. The
-- panel manages its own clinic's rows; clients read them only through the two
-- definer functions below, and only for an active clinic.
CREATE TABLE "clinic_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clinic_photos_media_unique" UNIQUE("media_id"),
	CONSTRAINT "clinic_photos_position_check" CHECK ("clinic_photos"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "clinic_photos" ADD CONSTRAINT "clinic_photos_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinic_photos" ADD CONSTRAINT "clinic_photos_media_fk" FOREIGN KEY ("clinic_id","media_id") REFERENCES "public"."media"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clinic_photos_clinic_position_idx" ON "clinic_photos" USING btree ("clinic_id","position");--> statement-breakpoint

-- app_panel: its own clinic's photos (add, reorder, remove).
GRANT SELECT, INSERT, UPDATE (position), DELETE ON clinic_photos TO app_panel;--> statement-breakpoint
ALTER TABLE clinic_photos ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY clinic_photos_panel ON clinic_photos FOR ALL TO app_panel
  USING (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
  WITH CHECK (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);--> statement-breakpoint

-- The photos of an active clinic, in page order, with the image size (the page
-- reserves the space before the image arrives). No image bytes here.
CREATE FUNCTION client_clinic_photos(p_clinic uuid)
RETURNS TABLE (id uuid, width integer, height integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, m.width, m.height
  FROM clinic_photos p
  JOIN clinics c ON c.id = p.clinic_id AND c.is_active
  JOIN media m ON m.clinic_id = p.clinic_id AND m.id = p.media_id
  WHERE p.clinic_id = p_clinic
  ORDER BY p.position, p.created_at, p.id
$$;--> statement-breakpoint

-- One photo's image, only when it belongs to that active clinic's page: never
-- another media row (such as the owner's photo or the logo) by its id.
CREATE FUNCTION client_clinic_photo(p_clinic uuid, p_photo uuid)
RETURNS TABLE (mime_type text, data bytea)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.mime_type, m.data
  FROM clinic_photos p
  JOIN clinics c ON c.id = p.clinic_id AND c.is_active
  JOIN media m ON m.clinic_id = p.clinic_id AND m.id = p.media_id
  WHERE p.clinic_id = p_clinic AND p.id = p_photo
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION client_clinic_photos(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION client_clinic_photo(uuid, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION client_clinic_photos(uuid) TO app_client;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION client_clinic_photo(uuid, uuid) TO app_client;
