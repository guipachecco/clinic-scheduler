CREATE TYPE "public"."business_type" AS ENUM('clinic', 'barbershop', 'nail_salon', 'other');--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "business_type" "business_type" DEFAULT 'clinic' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "cover_media_id" uuid;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "page_draft" jsonb;--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_cover_media_fk" FOREIGN KEY ("id","cover_media_id") REFERENCES "public"."media"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_page_draft_size_check" CHECK ("clinics"."page_draft" is null or pg_column_size("clinics"."page_draft") <= 16384);--> statement-breakpoint

-- The panel now changes the logo too (the page builder replaces it), besides
-- the cover, business type and the draft. The draft is private to the panel:
-- clients get no grant on page_draft, only on what the published page shows.
GRANT UPDATE (logo_media_id, cover_media_id, business_type, page_draft, headline, about, theme, owner_photo_media_id, updated_at) ON clinics TO app_panel;--> statement-breakpoint
GRANT SELECT (business_type, cover_media_id, logo_media_id, theme) ON clinics TO app_client;--> statement-breakpoint

-- The logo and the cover of an active clinic: only the image clinics points
-- at, never another of its media rows.
CREATE FUNCTION client_clinic_logo(p_clinic uuid)
RETURNS TABLE (mime_type text, data bytea)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.mime_type, m.data
  FROM clinics c
  JOIN media m ON m.clinic_id = c.id AND m.id = c.logo_media_id
  WHERE c.id = p_clinic AND c.is_active
$$;--> statement-breakpoint
CREATE FUNCTION client_clinic_cover(p_clinic uuid)
RETURNS TABLE (mime_type text, data bytea)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.mime_type, m.data
  FROM clinics c
  JOIN media m ON m.clinic_id = c.id AND m.id = c.cover_media_id
  WHERE c.id = p_clinic AND c.is_active
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION client_clinic_logo(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION client_clinic_cover(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION client_clinic_logo(uuid) TO app_client;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION client_clinic_cover(uuid) TO app_client;
