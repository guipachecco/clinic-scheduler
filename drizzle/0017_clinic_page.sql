-- The clinic's public page: products, reviews and the loyalty card, plus the
-- clinic columns the page shows (Instagram, amenities, loyalty settings).
--
-- app_panel edits all of it inside the clinic set for the transaction
-- (inClinic), like every clinic table since 0011. It may only hide a review,
-- never change its rating or text, and only adds loyalty redemptions.
--
-- app_client (asClient: app.clinic_id, app.patient_id, app.user_id) reads the
-- extra public clinic columns and the clinic's active products, and inserts
-- reviews as herself, only after a completed appointment. She never reads
-- reviews, payment methods, media or loyalty redemptions directly: the public
-- reviews and their summary, the payment method names, the owner's photo and
-- her own loyalty progress come from the SECURITY DEFINER functions below.
-- Like those of 0013, they run as the migration owner (not bound by RLS), so
-- each filters by the clinic explicitly, returns nothing for a suspended
-- clinic and returns only the columns listed. EXECUTE is for app_client only.
CREATE TABLE "loyalty_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_name_check" CHECK (char_length("products"."name") between 1 and 80),
	CONSTRAINT "products_price_check" CHECK ("products"."price_cents" is null or "products"."price_cents" between 0 and 10000000),
	CONSTRAINT "products_description_check" CHECK ("products"."description" is null or char_length("products"."description") <= 300)
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"comment" text,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_rating_check" CHECK ("reviews"."rating" between 1 and 5),
	CONSTRAINT "reviews_comment_check" CHECK ("reviews"."comment" is null or char_length("reviews"."comment") <= 500)
);
--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "instagram_handle" text;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "amenities" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "loyalty_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "loyalty_visits" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN "loyalty_reward" text;--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "public"."patients"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hidden_by_users_id_fk" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "public"."patients"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loyalty_redemptions_patient_idx" ON "loyalty_redemptions" USING btree ("clinic_id","patient_id");--> statement-breakpoint
CREATE INDEX "products_clinic_id_idx" ON "products" USING btree ("clinic_id");--> statement-breakpoint
CREATE INDEX "reviews_clinic_created_at_idx" ON "reviews" USING btree ("clinic_id","created_at");--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_instagram_check" CHECK ("clinics"."instagram_handle" is null or "clinics"."instagram_handle" ~ '^[A-Za-z0-9._]{1,30}$');--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_amenities_check" CHECK ("clinics"."amenities" <@ ARRAY['wifi', 'estacionamento', 'acessibilidade', 'ar_condicionado', 'cafe_agua', 'banheiro', 'espaco_kids', 'aceita_pets']::text[]);--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_loyalty_visits_check" CHECK ("clinics"."loyalty_visits" between 2 and 50);--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_loyalty_reward_check" CHECK ("clinics"."loyalty_reward" is null or char_length("clinics"."loyalty_reward") <= 120);--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_loyalty_check" CHECK (not "clinics"."loyalty_enabled" or "clinics"."loyalty_reward" is not null);--> statement-breakpoint
-- The page links to maps_url, so only https links stay; any other is dropped
-- before the check (the clinic types it again).
UPDATE "clinics" SET "maps_url" = NULL WHERE "maps_url" IS NOT NULL AND "maps_url" !~ '^https://';--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_maps_url_check" CHECK ("clinics"."maps_url" is null or "clinics"."maps_url" ~ '^https://');--> statement-breakpoint

-- app_panel: the page's content columns of its own clinic (0011's clinics_panel
-- policy already filters by the clinic). Still never id, slug, is_active,
-- logo_media_id or created_at.
GRANT UPDATE (headline, about, whatsapp_phone, contact_email, address, maps_url, instagram_handle, amenities, online_booking_enabled, loyalty_enabled, loyalty_visits, loyalty_reward) ON clinics TO app_panel;--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON products TO app_panel;--> statement-breakpoint
-- Reviews are the client's words: the panel reads and hides them only.
GRANT SELECT, UPDATE (is_hidden, hidden_at, hidden_by) ON reviews TO app_panel;--> statement-breakpoint
-- A redemption is a record of a reward given: never changed or removed.
GRANT SELECT, INSERT ON loyalty_redemptions TO app_panel;--> statement-breakpoint
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['products', 'reviews', 'loyalty_redemptions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO app_panel'
      ' USING (clinic_id = nullif(current_setting(''app.clinic_id'', true), '''')::uuid)'
      ' WITH CHECK (clinic_id = nullif(current_setting(''app.clinic_id'', true), '''')::uuid)',
      table_name || '_panel', table_name
    );
  END LOOP;
END
$$;--> statement-breakpoint

-- app_client: the public columns the page adds to those of 0013.
GRANT SELECT (headline, about, professional_name, professional_registration, area_label, instagram_handle, amenities, loyalty_enabled, loyalty_visits, loyalty_reward, owner_photo_media_id) ON clinics TO app_client;--> statement-breakpoint

-- The clinic's active products.
GRANT SELECT (id, clinic_id, name, price_cents, description, is_active, sort_order) ON products TO app_client;--> statement-breakpoint
CREATE POLICY products_client ON products FOR SELECT TO app_client
  USING (
    clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid
    AND is_active
  );--> statement-breakpoint

-- Her own reviews, after at least one completed appointment in the clinic
-- (the appointments she can see are already only her own). Only the four
-- columns: the moderation columns and created_at keep their defaults. No
-- SELECT: the page reads reviews through client_public_reviews.
GRANT INSERT (clinic_id, patient_id, rating, comment) ON reviews TO app_client;--> statement-breakpoint
CREATE POLICY reviews_client_insert ON reviews FOR INSERT TO app_client
  WITH CHECK (
    clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid
    AND patient_id = nullif(current_setting('app.patient_id', true), '')::uuid
    AND NOT is_hidden
    AND EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.clinic_id = reviews.clinic_id
        AND a.patient_id = reviews.patient_id
        AND a.status = 'completed'
    )
  );--> statement-breakpoint

-- Visible reviews of an active clinic, newest first, at most 50. The author is
-- the first name and the initial of the last one ("Ana Paula Souza" ->
-- "Ana S."; a single name stays whole). No patient id leaves the function.
CREATE FUNCTION client_public_reviews(p_clinic uuid, p_limit integer)
RETURNS TABLE (id uuid, rating smallint, comment text, created_at timestamptz, author text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.id, r.rating, r.comment, r.created_at,
         CASE WHEN array_length(w.words, 1) > 1
              THEN w.words[1] || ' ' || left(w.words[array_length(w.words, 1)], 1) || '.'
              ELSE w.words[1]
         END
  FROM reviews r
  JOIN clinics c ON c.id = r.clinic_id AND c.is_active
  JOIN patients p ON p.clinic_id = r.clinic_id AND p.id = r.patient_id
  CROSS JOIN LATERAL (SELECT regexp_split_to_array(btrim(p.name), '\s+') AS words) w
  WHERE r.clinic_id = p_clinic AND NOT r.is_hidden
  ORDER BY r.created_at DESC, r.id
  LIMIT least(greatest(coalesce(p_limit, 0), 0), 50)
$$;--> statement-breakpoint

-- Average (one decimal; null without reviews) and count of the visible reviews
-- of an active clinic. No row for a suspended or unknown clinic.
CREATE FUNCTION client_review_summary(p_clinic uuid)
RETURNS TABLE (average numeric, total integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT round(avg(r.rating), 1), count(r.id)::integer
  FROM clinics c
  LEFT JOIN reviews r ON r.clinic_id = c.id AND NOT r.is_hidden
  WHERE c.id = p_clinic AND c.is_active
  GROUP BY c.id
$$;--> statement-breakpoint

-- Names of the active payment methods of an active clinic.
CREATE FUNCTION client_payment_methods(p_clinic uuid)
RETURNS TABLE (name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.name
  FROM payment_methods m
  JOIN clinics c ON c.id = m.clinic_id AND c.is_active
  WHERE m.clinic_id = p_clinic AND m.is_active
  ORDER BY m.sort_order, m.name
$$;--> statement-breakpoint

-- Her completed appointments and the rewards she received, in the clinic of
-- the transaction's settings. Zeros unless app.patient_id is her own row
-- (app.user_id) in that clinic; no row for a suspended clinic.
CREATE FUNCTION client_loyalty_progress()
RETURNS TABLE (completed integer, redeemed integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    (SELECT count(*)::integer FROM appointments a
      WHERE a.clinic_id = c.id AND a.patient_id = p.id AND a.status = 'completed'),
    (SELECT count(*)::integer FROM loyalty_redemptions l
      WHERE l.clinic_id = c.id AND l.patient_id = p.id)
  FROM clinics c
  LEFT JOIN patients p
    ON p.clinic_id = c.id
   AND p.id = nullif(current_setting('app.patient_id', true), '')::uuid
   AND p.user_id = nullif(current_setting('app.user_id', true), '')::uuid
  WHERE c.id = nullif(current_setting('app.clinic_id', true), '')::uuid
    AND c.is_active
$$;--> statement-breakpoint

-- The owner's photo of an active clinic: only the image clinics points at,
-- never another of its media rows.
CREATE FUNCTION client_owner_photo(p_clinic uuid)
RETURNS TABLE (mime_type text, data bytea)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.mime_type, m.data
  FROM clinics c
  JOIN media m ON m.clinic_id = c.id AND m.id = c.owner_photo_media_id
  WHERE c.id = p_clinic AND c.is_active
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION client_public_reviews(uuid, integer) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION client_review_summary(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION client_payment_methods(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION client_loyalty_progress() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION client_owner_photo(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION client_public_reviews(uuid, integer) TO app_client;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION client_review_summary(uuid) TO app_client;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION client_payment_methods(uuid) TO app_client;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION client_loyalty_progress() TO app_client;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION client_owner_photo(uuid) TO app_client;
