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
GRANT SELECT (modules, online_booking_enabled, loyalty_enabled, anamnesis_template) ON clinics TO app_client;
