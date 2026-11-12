-- Stock: products.stock_quantity and the history of stock movements.
--
-- Additive only: the old code is still running when this applies and never
-- names the new column or table. stock_quantity defaults to 0 and every
-- existing product starts with no stock. The (clinic_id, id) uniques the
-- composite foreign keys need already exist on products (0028), appointments
-- and sale_items (0009); stock_movements gets its own for reverses_id.
CREATE TYPE "public"."stock_movement_kind" AS ENUM('entry', 'usage', 'handover', 'reversal');--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"kind" "stock_movement_kind" NOT NULL,
	"quantity" integer NOT NULL,
	"appointment_id" uuid,
	"sale_item_id" uuid,
	"reverses_id" uuid,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_clinic_id_id_unique" UNIQUE("clinic_id","id"),
	CONSTRAINT "stock_movements_reverses_unique" UNIQUE("reverses_id"),
	CONSTRAINT "stock_movements_quantity_check" CHECK (("stock_movements"."kind" = 'entry' and "stock_movements"."quantity" > 0)
        or ("stock_movements"."kind" in ('usage', 'handover') and "stock_movements"."quantity" < 0)
        or ("stock_movements"."kind" = 'reversal' and "stock_movements"."quantity" <> 0)),
	CONSTRAINT "stock_movements_links_check" CHECK (("stock_movements"."kind" = 'usage' and "stock_movements"."appointment_id" is not null)
        or ("stock_movements"."kind" = 'handover' and "stock_movements"."sale_item_id" is not null and "stock_movements"."appointment_id" is null)
        or ("stock_movements"."kind" = 'entry' and "stock_movements"."appointment_id" is null and "stock_movements"."sale_item_id" is null)
        or "stock_movements"."kind" = 'reversal'),
	CONSTRAINT "stock_movements_reverses_check" CHECK (("stock_movements"."kind" = 'reversal') = ("stock_movements"."reverses_id" is not null)),
	CONSTRAINT "stock_movements_note_check" CHECK ("stock_movements"."note" is null or char_length("stock_movements"."note") <= 200)
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "stock_quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_fk" FOREIGN KEY ("clinic_id","product_id") REFERENCES "public"."products"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_appointment_fk" FOREIGN KEY ("clinic_id","appointment_id") REFERENCES "public"."appointments"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_item_fk" FOREIGN KEY ("clinic_id","sale_item_id") REFERENCES "public"."sale_items"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reverses_fk" FOREIGN KEY ("clinic_id","reverses_id") REFERENCES "public"."stock_movements"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_product_idx" ON "stock_movements" USING btree ("clinic_id","product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stock_movements_appointment_idx" ON "stock_movements" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "stock_movements_sale_item_idx" ON "stock_movements" USING btree ("sale_item_id");--> statement-breakpoint
CREATE INDEX "quote_items_product_idx" ON "quote_items" USING btree ("clinic_id","product_id");--> statement-breakpoint
CREATE INDEX "sale_items_product_idx" ON "sale_items" USING btree ("clinic_id","product_id");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_stock_check" CHECK ("products"."stock_quantity" >= 0);--> statement-breakpoint

-- app_panel: reads and adds the movements of its own clinic, never updates or
-- deletes them (a mistake is undone by a reversal). Clients, platform and auth
-- have no grant; app_client's column grant on products (0017, 0028) does not
-- gain stock_quantity.
GRANT SELECT, INSERT ON stock_movements TO app_panel;--> statement-breakpoint
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY stock_movements_panel ON stock_movements FOR ALL TO app_panel
  USING (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
  WITH CHECK (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);
