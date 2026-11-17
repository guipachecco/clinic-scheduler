-- Sinal por Pix becomes a module (src/modules/clinics/modules.ts) that root
-- turns on per clinic. The column default stays as it is, so every clinic,
-- existing or new, starts with it off.
ALTER TABLE "clinics" DROP CONSTRAINT "clinics_modules_check";--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_modules_check" CHECK ("clinics"."modules" <@ ARRAY['products', 'finance', 'online_booking', 'loyalty', 'anamnesis', 'reviews', 'pix_deposit']::text[]);