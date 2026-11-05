-- The flexible service ("Avaliação / encaixe") lets the clinic book a visit
-- that fits no catalog service. It lives in the "Outros" category, is never
-- offered online, shows no price and needs no approval. Fixed ids and
-- ON CONFLICT make the seed safe to run again.
INSERT INTO "service_categories" ("id", "name", "slug", "sort_order", "is_active")
VALUES ('00000000-0000-4000-8000-000000000001', 'Outros', 'outros', 999, true)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "services" (
  "id", "category_id", "name", "slug", "duration_minutes",
  "buffer_before_minutes", "buffer_after_minutes", "price_cents",
  "price_display", "requires_approval", "online_booking_enabled",
  "is_active", "is_flexible", "sort_order"
)
SELECT
  '00000000-0000-4000-8000-000000000002', "id", 'Avaliação / encaixe',
  'avaliacao-encaixe', 30, 0, 0, NULL, 'hidden', false, false, true, true, 0
FROM "service_categories"
WHERE "slug" = 'outros'
ON CONFLICT ("slug") DO NOTHING;
