CREATE TYPE "public"."patient_gender" AS ENUM('male', 'female', 'other', 'undisclosed');--> statement-breakpoint
CREATE TYPE "public"."patient_referral_source" AS ENUM('google', 'instagram', 'facebook', 'referral', 'school', 'outdoor', 'flyer', 'sign', 'insurance', 'radio', 'tv', 'magazine', 'other');--> statement-breakpoint
ALTER TABLE "patients" DROP CONSTRAINT "patients_anonymized_check";--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "cpf" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "rg" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "landline_phone" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "gender" "patient_gender";--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "referral_source" "patient_referral_source";--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "referred_by" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "notes" text;--> statement-breakpoint
CREATE UNIQUE INDEX "patients_cpf_idx" ON "patients" USING btree ("cpf") WHERE "patients"."cpf" is not null;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_landline_check" CHECK ("patients"."landline_phone" is null or "patients"."landline_phone" ~ '^\+[1-9][0-9]{7,14}$');--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_cpf_check" CHECK ("patients"."cpf" is null or "patients"."cpf" ~ '^[0-9]{11}$');--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_referred_by_check" CHECK ("patients"."referred_by" is null or "patients"."referral_source" = 'referral');--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_lengths_check" CHECK (char_length("patients"."nickname") <= 40 and char_length("patients"."rg") <= 20 and char_length("patients"."referred_by") <= 120 and char_length("patients"."notes") <= 1000);--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_anonymized_check" CHECK ("patients"."anonymized_at" is null or ("patients"."phone" is null and "patients"."email" is null and "patients"."name_normalized" is null and "patients"."nickname" is null and "patients"."cpf" is null and "patients"."rg" is null and "patients"."landline_phone" is null and "patients"."birth_date" is null and "patients"."gender" is null and "patients"."referral_source" is null and "patients"."referred_by" is null and "patients"."notes" is null));