-- Mercado Pago (docs/mercado-pago.md): the account each clinic connects and
-- the payment links made for its installments.
CREATE TYPE "public"."mercado_pago_charge_status" AS ENUM('pending', 'paid', 'conflict', 'refunded', 'closed');--> statement-breakpoint
CREATE TABLE "mercado_pago_accounts" (
	"clinic_id" uuid PRIMARY KEY NOT NULL,
	"mp_user_id" text NOT NULL,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"public_key" text,
	"live_mode" boolean NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"connected_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mercado_pago_accounts_user_check" CHECK (char_length("mercado_pago_accounts"."mp_user_id") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "mercado_pago_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"installment_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"order_id" text NOT NULL,
	"checkout_url" text NOT NULL,
	"status" "mercado_pago_charge_status" DEFAULT 'pending' NOT NULL,
	"status_detail" text,
	"payment_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mercado_pago_charges_amount_check" CHECK ("mercado_pago_charges"."amount_cents" > 0),
	CONSTRAINT "mercado_pago_charges_paid_check" CHECK (("mercado_pago_charges"."status" in ('paid', 'refunded')) = ("mercado_pago_charges"."payment_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "mercado_pago_accounts" ADD CONSTRAINT "mercado_pago_accounts_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercado_pago_accounts" ADD CONSTRAINT "mercado_pago_accounts_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercado_pago_charges" ADD CONSTRAINT "mercado_pago_charges_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercado_pago_charges" ADD CONSTRAINT "mercado_pago_charges_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercado_pago_charges" ADD CONSTRAINT "mercado_pago_charges_installment_fk" FOREIGN KEY ("clinic_id","installment_id") REFERENCES "public"."installments"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mercado_pago_charges" ADD CONSTRAINT "mercado_pago_charges_payment_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mercado_pago_charges_order_idx" ON "mercado_pago_charges" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mercado_pago_charges_payment_idx" ON "mercado_pago_charges" USING btree ("payment_id") WHERE "mercado_pago_charges"."payment_id" is not null;--> statement-breakpoint
CREATE INDEX "mercado_pago_charges_installment_idx" ON "mercado_pago_charges" USING btree ("installment_id");

-- The panel of the clinic manages its own connection and links. Clients never
-- see either table.
GRANT SELECT, INSERT, UPDATE, DELETE ON mercado_pago_accounts TO app_panel;--> statement-breakpoint
ALTER TABLE mercado_pago_accounts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY mercado_pago_accounts_panel ON mercado_pago_accounts FOR ALL TO app_panel
  USING (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
  WITH CHECK (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT ON mercado_pago_charges TO app_panel;--> statement-breakpoint
GRANT UPDATE (status, status_detail, payment_id, updated_at) ON mercado_pago_charges TO app_panel;--> statement-breakpoint
ALTER TABLE mercado_pago_charges ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY mercado_pago_charges_panel ON mercado_pago_charges FOR ALL TO app_panel
  USING (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
  WITH CHECK (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);--> statement-breakpoint

-- The webhook arrives without a session. After checking its signature, it
-- asks which clinic owns the order and then works inside that clinic as
-- app_panel, like the panel does. This function answers only that: the
-- clinic of one order id, or null.
CREATE FUNCTION mercado_pago_order_clinic(p_order_id text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT clinic_id FROM mercado_pago_charges WHERE order_id = p_order_id $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION mercado_pago_order_clinic(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION mercado_pago_order_clinic(text) TO app_panel;
