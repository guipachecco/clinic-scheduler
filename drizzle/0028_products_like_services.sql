-- Products like services: product categories, "Mostrar na página" apart from
-- "Ativo", and products as quote and sale items.
--
-- Additive only: the old code is still running when this applies. Every
-- clinic gets the "Outros" category (createClinic does it for new ones) and
-- every existing product goes into it. "Ativo" used to mean "on the page", so
-- show_on_page takes it over and every product becomes usable (is_active).
-- The old code inserts quote and sale items with service_id and no
-- product_id, which passes the kind checks.
CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_categories_clinic_id_id_unique" UNIQUE("clinic_id","id"),
	CONSTRAINT "product_categories_clinic_name_unique" UNIQUE("clinic_id","name"),
	CONSTRAINT "product_categories_name_check" CHECK (char_length("product_categories"."name") between 1 and 40)
);
--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Same sort order as the services' "Outros" (createClinic).
INSERT INTO "product_categories" ("clinic_id", "name", "sort_order")
SELECT "id", 'Outros', 999 FROM "clinics";--> statement-breakpoint

ALTER TABLE "products" ADD COLUMN "category_id" uuid;--> statement-breakpoint
UPDATE "products" p SET "category_id" = pc."id"
FROM "product_categories" pc
WHERE pc."clinic_id" = p."clinic_id" AND pc."name" = 'Outros';--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "category_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "show_on_page" boolean DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE "products" SET "show_on_page" = "is_active", "is_active" = true;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_fk" FOREIGN KEY ("clinic_id","category_id") REFERENCES "public"."product_categories"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_clinic_id_id_unique" UNIQUE("clinic_id","id");--> statement-breakpoint

ALTER TABLE "quote_items" ALTER COLUMN "service_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_items" ALTER COLUMN "service_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_items" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "sale_items" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_product_fk" FOREIGN KEY ("clinic_id","product_id") REFERENCES "public"."products"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_fk" FOREIGN KEY ("clinic_id","product_id") REFERENCES "public"."products"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_kind_check" CHECK (num_nonnulls("quote_items"."service_id", "quote_items"."product_id") = 1);--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_kind_check" CHECK (num_nonnulls("sale_items"."service_id", "sale_items"."product_id") = 1);--> statement-breakpoint

-- app_panel: the categories of its own clinic, like anamneses (0024).
GRANT SELECT, INSERT, UPDATE, DELETE ON product_categories TO app_panel;--> statement-breakpoint
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY product_categories_panel ON product_categories FOR ALL TO app_panel
  USING (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
  WITH CHECK (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);--> statement-breakpoint

-- app_platform: createClinic seeds "Outros", like the service categories (0011).
GRANT SELECT, INSERT, UPDATE, DELETE ON product_categories TO app_platform;--> statement-breakpoint
CREATE POLICY product_categories_platform ON product_categories FOR ALL TO app_platform USING (true) WITH CHECK (true);--> statement-breakpoint

-- app_client: the page lists the products that are active and on the page.
-- Its column grant (0017) gains show_on_page; never category_id.
GRANT SELECT (show_on_page) ON products TO app_client;--> statement-breakpoint
ALTER POLICY products_client ON products
  USING (
    clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid
    AND is_active
    AND show_on_page
  );
