-- Modules per clinic (src/modules/clinics/modules.ts). Every existing clinic
-- keeps all six. Only root changes them, through app_platform; the panel has
-- no UPDATE on modules.
ALTER TABLE "clinics" ADD COLUMN "modules" text[] DEFAULT '{products,finance,online_booking,loyalty,anamnesis,reviews}' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_modules_check" CHECK ("clinics"."modules" <@ ARRAY['products', 'finance', 'online_booking', 'loyalty', 'anamnesis', 'reviews']::text[]);--> statement-breakpoint

-- The owner's choices move to *_choice, keeping their data, grants and
-- clinics_loyalty_check (all follow the column, not its name). The old names
-- come back as generated columns: the choice combined with the module. Every
-- reader, including the SECURITY DEFINER functions of 0013, 0014 and 0021
-- (resolved by name when they run), so obeys the module unchanged. Turning a
-- module off deletes nothing: the choice stays and comes back with it.
ALTER TABLE "clinics" RENAME COLUMN "online_booking_enabled" TO "online_booking_choice";--> statement-breakpoint
ALTER TABLE "clinics" RENAME COLUMN "loyalty_enabled" TO "loyalty_choice";--> statement-breakpoint
ALTER TABLE "clinics" RENAME COLUMN "anamnesis_template" TO "anamnesis_template_choice";--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "online_booking_enabled" boolean GENERATED ALWAYS AS (online_booking_choice AND 'online_booking' = ANY(modules)) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "loyalty_enabled" boolean GENERATED ALWAYS AS (loyalty_choice AND 'loyalty' = ANY(modules)) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "anamnesis_template" text GENERATED ALWAYS AS (CASE WHEN 'anamnesis' = ANY(modules) THEN anamnesis_template_choice END) STORED;--> statement-breakpoint

-- app_panel reads the whole table (0011), so it already sees the new columns.
-- The client area reads the effective switches under their old names, which
-- are new columns without grants.
GRANT SELECT (modules, online_booking_enabled, loyalty_enabled) ON clinics TO app_client;--> statement-breakpoint


-- Least privilege: the client area never reads the owner's choices (they came
-- through the rename with the old grants) nor the anamnesis template.
REVOKE SELECT (online_booking_choice, loyalty_choice) ON clinics FROM app_client;--> statement-breakpoint

-- client_my_clinics (0021) showed the review summary of every clinic. With the
-- reviews module off, the card shows no rating. Same signature, same settings.
CREATE OR REPLACE FUNCTION client_my_clinics(p_user uuid)
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
  next_service text
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
         (SELECT count(*)::integer FROM appointments a
           WHERE a.clinic_id = c.id AND a.patient_id = p.id
             AND a.status = 'completed'),
         (SELECT count(*)::integer FROM loyalty_redemptions l
           WHERE l.clinic_id = c.id AND l.patient_id = p.id),
         na.starts_at, na.service
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
$$;
