-- Client accounts (role client, no clinic) and the patient columns that tie a
-- client to each clinic. The check compares role::text because a value added
-- by ALTER TYPE cannot be used in the transaction that adds it.
ALTER TYPE "public"."user_role" ADD VALUE 'client';--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role_clinic_check";--> statement-breakpoint
DROP INDEX "patients_phone_name_idx";--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "pending_link_patient_id" uuid;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_pending_link_fk" FOREIGN KEY ("clinic_id","pending_link_patient_id") REFERENCES "public"."patients"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "patients_user_id_idx" ON "patients" USING btree ("clinic_id","user_id") WHERE "patients"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "patients_phone_name_idx" ON "patients" USING btree ("clinic_id","phone","name_normalized") WHERE "patients"."pending_link_patient_id" is null;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_clinic_check" CHECK (("users"."role"::text = 'admin') = ("users"."clinic_id" is not null));--> statement-breakpoint

-- The signup limit (src/modules/clients/accounts.ts) keeps its counters in
-- rate_limits, next to Better Auth's. No DELETE: Better Auth prunes old rows.
GRANT SELECT, INSERT, UPDATE ON rate_limits TO app_platform;
