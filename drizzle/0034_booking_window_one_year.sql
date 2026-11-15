ALTER TABLE "clinics" ALTER COLUMN "max_advance_days" SET DEFAULT 365;--> statement-breakpoint
-- Clinics created with the old 60-day window open the whole year too, so a
-- client can book months ahead.
UPDATE "clinics" SET "max_advance_days" = 365 WHERE "max_advance_days" < 365;
