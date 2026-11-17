CREATE TYPE "public"."asaas_account_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."asaas_close_reason" AS ENUM('timeout', 'clinic_cancelled', 'manual_confirm', 'charge_failed');--> statement-breakpoint
CREATE TYPE "public"."asaas_deposit_status" AS ENUM('pending', 'paid', 'expired', 'refunded', 'kept', 'closed');--> statement-breakpoint
CREATE TABLE "asaas_accounts" (
	"clinic_id" uuid PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	"api_key_enc" text NOT NULL,
	"status" "asaas_account_status" DEFAULT 'pending' NOT NULL,
	"pix_key_ready" boolean DEFAULT false NOT NULL,
	"deposit_enabled" boolean DEFAULT true NOT NULL,
	"last_error" text,
	"activated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asaas_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"customer_id" text NOT NULL,
	"cpf_cnpj_last4" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asaas_customers_clinic_patient_unique" UNIQUE("clinic_id","patient_id"),
	CONSTRAINT "asaas_customers_last4_check" CHECK ("asaas_customers"."cpf_cnpj_last4" ~ '^[0-9]{4}$')
);
--> statement-breakpoint
CREATE TABLE "asaas_deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"charge_id" text,
	"status" "asaas_deposit_status" DEFAULT 'pending' NOT NULL,
	"close_reason" "asaas_close_reason",
	"expires_at" timestamp with time zone NOT NULL,
	"payment_id" uuid,
	"sale_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asaas_deposits_appointment_unique" UNIQUE("appointment_id"),
	CONSTRAINT "asaas_deposits_amount_check" CHECK ("asaas_deposits"."amount_cents" > 0),
	CONSTRAINT "asaas_deposits_paid_check" CHECK (("asaas_deposits"."status" in ('paid', 'kept', 'refunded')) = ("asaas_deposits"."payment_id" is not null)),
	CONSTRAINT "asaas_deposits_close_reason_check" CHECK ("asaas_deposits"."close_reason" is null or "asaas_deposits"."status" in ('expired', 'closed'))
);
--> statement-breakpoint
ALTER TABLE "asaas_accounts" ADD CONSTRAINT "asaas_accounts_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asaas_accounts" ADD CONSTRAINT "asaas_accounts_activated_by_user_id_users_id_fk" FOREIGN KEY ("activated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asaas_customers" ADD CONSTRAINT "asaas_customers_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asaas_customers" ADD CONSTRAINT "asaas_customers_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "public"."patients"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asaas_deposits" ADD CONSTRAINT "asaas_deposits_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asaas_deposits" ADD CONSTRAINT "asaas_deposits_appointment_fk" FOREIGN KEY ("clinic_id","appointment_id") REFERENCES "public"."appointments"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asaas_deposits" ADD CONSTRAINT "asaas_deposits_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "public"."patients"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asaas_deposits" ADD CONSTRAINT "asaas_deposits_sale_fk" FOREIGN KEY ("clinic_id","sale_id") REFERENCES "public"."sales"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asaas_deposits" ADD CONSTRAINT "asaas_deposits_payment_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asaas_deposits_charge_idx" ON "asaas_deposits" USING btree ("charge_id") WHERE "asaas_deposits"."charge_id" is not null;--> statement-breakpoint
CREATE INDEX "asaas_deposits_status_idx" ON "asaas_deposits" USING btree ("status","expires_at");

-- Only the panel of the clinic reaches these tables; clients never do. A
-- deposit's amount, appointment and charge never change once created.
GRANT SELECT, INSERT, UPDATE ON asaas_accounts TO app_panel;--> statement-breakpoint
ALTER TABLE asaas_accounts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY asaas_accounts_panel ON asaas_accounts FOR ALL TO app_panel
  USING (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
  WITH CHECK (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON asaas_customers TO app_panel;--> statement-breakpoint
ALTER TABLE asaas_customers ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY asaas_customers_panel ON asaas_customers FOR ALL TO app_panel
  USING (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
  WITH CHECK (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT ON asaas_deposits TO app_panel;--> statement-breakpoint
GRANT UPDATE (charge_id, status, close_reason, payment_id, sale_id, updated_at) ON asaas_deposits TO app_panel;--> statement-breakpoint
ALTER TABLE asaas_deposits ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY asaas_deposits_panel ON asaas_deposits FOR ALL TO app_panel
  USING (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
  WITH CHECK (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);--> statement-breakpoint

-- The Asaas webhook arrives without a session. After checking its token, it
-- asks which clinic owns the deposit (the charge's externalReference) and then
-- works inside that clinic as app_panel. This function answers only that: the
-- clinic of one deposit id, or null.
CREATE FUNCTION asaas_deposit_clinic(p_deposit_id uuid) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT clinic_id FROM asaas_deposits WHERE id = p_deposit_id $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION asaas_deposit_clinic(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION asaas_deposit_clinic(uuid) TO app_panel;
