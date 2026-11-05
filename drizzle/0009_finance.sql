CREATE TYPE "public"."payment_plan" AS ENUM('upfront', 'installments', 'per_session');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'sent', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_categories_clinic_id_id_unique" UNIQUE("clinic_id","id"),
	CONSTRAINT "expense_categories_clinic_name_unique" UNIQUE("clinic_id","name"),
	CONSTRAINT "expense_categories_name_check" CHECK (char_length("expense_categories"."name") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"spent_on" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"category_id" uuid NOT NULL,
	"payment_method_id" uuid NOT NULL,
	"description" text,
	"sale_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" uuid,
	"cancellation_reason" text,
	CONSTRAINT "expenses_amount_check" CHECK ("expenses"."amount_cents" > 0),
	CONSTRAINT "expenses_cancellation_check" CHECK (("expenses"."cancelled_at" is null) = ("expenses"."cancellation_reason" is null)),
	CONSTRAINT "expenses_description_check" CHECK ("expenses"."description" is null or char_length("expenses"."description") <= 200)
);
--> statement-breakpoint
CREATE TABLE "installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"sale_item_id" uuid,
	"appointment_id" uuid,
	"number" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"due_date" date,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installments_clinic_id_id_unique" UNIQUE("clinic_id","id"),
	CONSTRAINT "installments_amount_check" CHECK ("installments"."amount_cents" > 0),
	CONSTRAINT "installments_number_check" CHECK ("installments"."number" > 0),
	CONSTRAINT "installments_appointment_check" CHECK ("installments"."appointment_id" is null or "installments"."sale_item_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_methods_clinic_id_id_unique" UNIQUE("clinic_id","id"),
	CONSTRAINT "payment_methods_clinic_name_unique" UNIQUE("clinic_id","name"),
	CONSTRAINT "payment_methods_name_check" CHECK (char_length("payment_methods"."name") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"installment_id" uuid NOT NULL,
	"paid_on" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"payment_method_id" uuid NOT NULL,
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_by_user_id" uuid,
	"reversal_reason" text,
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount_cents" > 0),
	CONSTRAINT "payments_reversal_check" CHECK (("payments"."reversed_at" is null) = ("payments"."reversal_reason" is null)),
	CONSTRAINT "payments_notes_check" CHECK ("payments"."notes" is null or char_length("payments"."notes") <= 200)
);
--> statement-breakpoint
CREATE TABLE "quote_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"service_name" text NOT NULL,
	"sessions" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "quote_items_sessions_check" CHECK ("quote_items"."sessions" between 1 and 200),
	CONSTRAINT "quote_items_price_check" CHECK ("quote_items"."unit_price_cents" >= 0),
	CONSTRAINT "quote_items_discount_check" CHECK ("quote_items"."discount_cents" >= 0 and "quote_items"."discount_cents" <= "quote_items"."sessions" * "quote_items"."unit_price_cents")
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"patient_id" uuid NOT NULL,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"valid_until" date NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_by_user_id" uuid,
	"sent_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_clinic_id_id_unique" UNIQUE("clinic_id","id"),
	CONSTRAINT "quotes_clinic_number_unique" UNIQUE("clinic_id","number"),
	CONSTRAINT "quotes_number_check" CHECK ("quotes"."number" > 0),
	CONSTRAINT "quotes_discount_check" CHECK ("quotes"."discount_cents" >= 0),
	CONSTRAINT "quotes_notes_check" CHECK ("quotes"."notes" is null or char_length("quotes"."notes") <= 500)
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"service_name" text NOT NULL,
	"sessions" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sale_items_clinic_id_id_unique" UNIQUE("clinic_id","id"),
	CONSTRAINT "sale_items_sessions_check" CHECK ("sale_items"."sessions" between 0 and 200),
	CONSTRAINT "sale_items_total_check" CHECK ("sale_items"."total_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sale_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"reason" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_revisions_reason_check" CHECK (char_length("sale_revisions"."reason") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "sale_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"sale_item_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_sessions_appointment_unique" UNIQUE("appointment_id")
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"payment_plan" "payment_plan" NOT NULL,
	"total_cents" integer NOT NULL,
	"created_by_user_id" uuid,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_clinic_id_id_unique" UNIQUE("clinic_id","id"),
	CONSTRAINT "sales_quote_unique" UNIQUE("quote_id"),
	CONSTRAINT "sales_total_check" CHECK ("sales"."total_cents" >= 0),
	CONSTRAINT "sales_cancellation_check" CHECK (("sales"."cancelled_at" is null) = ("sales"."cancellation_reason" is null))
);
--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_fk" FOREIGN KEY ("clinic_id","category_id") REFERENCES "public"."expense_categories"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_method_fk" FOREIGN KEY ("clinic_id","payment_method_id") REFERENCES "public"."payment_methods"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_sale_fk" FOREIGN KEY ("clinic_id","sale_id") REFERENCES "public"."sales"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_sale_fk" FOREIGN KEY ("clinic_id","sale_id") REFERENCES "public"."sales"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_sale_item_fk" FOREIGN KEY ("clinic_id","sale_item_id") REFERENCES "public"."sale_items"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_appointment_fk" FOREIGN KEY ("clinic_id","appointment_id") REFERENCES "public"."appointments"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reversed_by_user_id_users_id_fk" FOREIGN KEY ("reversed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_installment_fk" FOREIGN KEY ("clinic_id","installment_id") REFERENCES "public"."installments"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_method_fk" FOREIGN KEY ("clinic_id","payment_method_id") REFERENCES "public"."payment_methods"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_fk" FOREIGN KEY ("clinic_id","quote_id") REFERENCES "public"."quotes"("clinic_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_service_fk" FOREIGN KEY ("clinic_id","service_id") REFERENCES "public"."services"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "public"."patients"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_fk" FOREIGN KEY ("clinic_id","sale_id") REFERENCES "public"."sales"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_service_fk" FOREIGN KEY ("clinic_id","service_id") REFERENCES "public"."services"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_revisions" ADD CONSTRAINT "sale_revisions_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_revisions" ADD CONSTRAINT "sale_revisions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_revisions" ADD CONSTRAINT "sale_revisions_sale_fk" FOREIGN KEY ("clinic_id","sale_id") REFERENCES "public"."sales"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_sessions" ADD CONSTRAINT "sale_sessions_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_sessions" ADD CONSTRAINT "sale_sessions_item_fk" FOREIGN KEY ("clinic_id","sale_item_id") REFERENCES "public"."sale_items"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_sessions" ADD CONSTRAINT "sale_sessions_appointment_fk" FOREIGN KEY ("clinic_id","appointment_id") REFERENCES "public"."appointments"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_quote_fk" FOREIGN KEY ("clinic_id","quote_id") REFERENCES "public"."quotes"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_patient_fk" FOREIGN KEY ("clinic_id","patient_id") REFERENCES "public"."patients"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_spent_on_idx" ON "expenses" USING btree ("clinic_id","spent_on");--> statement-breakpoint
CREATE UNIQUE INDEX "installments_appointment_idx" ON "installments" USING btree ("appointment_id") WHERE "installments"."appointment_id" is not null;--> statement-breakpoint
CREATE INDEX "installments_sale_idx" ON "installments" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "installments_due_idx" ON "installments" USING btree ("clinic_id","due_date");--> statement-breakpoint
CREATE INDEX "payments_installment_idx" ON "payments" USING btree ("installment_id");--> statement-breakpoint
CREATE INDEX "payments_paid_on_idx" ON "payments" USING btree ("clinic_id","paid_on");--> statement-breakpoint
CREATE INDEX "quote_items_quote_idx" ON "quote_items" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "quotes_patient_idx" ON "quotes" USING btree ("clinic_id","patient_id");--> statement-breakpoint
CREATE INDEX "sale_items_sale_idx" ON "sale_items" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_revisions_sale_idx" ON "sale_revisions" USING btree ("sale_id","created_at");--> statement-breakpoint
CREATE INDEX "sale_sessions_item_idx" ON "sale_sessions" USING btree ("sale_item_id");--> statement-breakpoint
CREATE INDEX "sales_patient_idx" ON "sales" USING btree ("clinic_id","patient_id");--> statement-breakpoint
-- Every existing clinic gets the default payment methods and expense
-- categories. New clinics get them from createClinic (src/modules/clinics).
INSERT INTO "payment_methods" ("clinic_id", "name", "sort_order")
SELECT c."id", m."name", m."sort_order"
FROM "clinics" c
CROSS JOIN (VALUES ('Pix', 0), ('Dinheiro', 1), ('Débito', 2), ('Crédito', 3)) AS m("name", "sort_order")
ON CONFLICT ON CONSTRAINT "payment_methods_clinic_name_unique" DO NOTHING;--> statement-breakpoint
INSERT INTO "expense_categories" ("clinic_id", "name", "sort_order")
SELECT c."id", e."name", e."sort_order"
FROM "clinics" c
CROSS JOIN (VALUES ('Aluguel', 0), ('Produtos e materiais', 1), ('Contas', 2), ('Taxas de cartão', 3), ('Devolução a cliente', 4), ('Outros', 5)) AS e("name", "sort_order")
ON CONFLICT ON CONSTRAINT "expense_categories_clinic_name_unique" DO NOTHING;
