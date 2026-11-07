-- Fixes to the clinic page of 0017.
--
-- "É a mesma" (confirmLink, src/modules/patients/links.ts) moves every row of
-- the provisional record to the existing one before deleting it. Its reviews
-- and loyalty redemptions reference patients ON DELETE restrict, so they move
-- too: app_panel may change only patient_id of both (the policies of 0017
-- already keep it inside the clinic, and the composite foreign keys keep the
-- new patient in the same clinic). Rating, text and moderation stay as 0017
-- left them.
GRANT UPDATE (patient_id) ON reviews TO app_panel;--> statement-breakpoint
GRANT UPDATE (patient_id) ON loyalty_redemptions TO app_panel;--> statement-breakpoint

-- An anonymized patient (LGPD) has her reviews withdrawn from the page: they
-- are neither listed nor counted. Same signatures, owner, search_path and
-- privileges as in 0017 (CREATE OR REPLACE keeps the grants).
CREATE OR REPLACE FUNCTION client_public_reviews(p_clinic uuid, p_limit integer)
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
  WHERE r.clinic_id = p_clinic AND NOT r.is_hidden AND p.anonymized_at IS NULL
  ORDER BY r.created_at DESC, r.id
  LIMIT least(greatest(coalesce(p_limit, 0), 0), 50)
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION client_review_summary(p_clinic uuid)
RETURNS TABLE (average numeric, total integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT round(avg(r.rating), 1), count(r.id)::integer
  FROM clinics c
  LEFT JOIN (
    reviews r
    JOIN patients p
      ON p.clinic_id = r.clinic_id AND p.id = r.patient_id
     AND p.anonymized_at IS NULL
  ) ON r.clinic_id = c.id AND NOT r.is_hidden
  WHERE c.id = p_clinic AND c.is_active
  GROUP BY c.id
$$;--> statement-breakpoint

-- Restated so the privileges do not depend on CREATE OR REPLACE keeping them.
REVOKE ALL ON FUNCTION client_public_reviews(uuid, integer) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION client_review_summary(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION client_public_reviews(uuid, integer) TO app_client;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION client_review_summary(uuid) TO app_client;
