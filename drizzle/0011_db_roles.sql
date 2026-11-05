-- The PostgreSQL roles the app connects with, their privileges and the
-- row-level security that keeps the panel inside one clinic.
--
-- Roles belong to the whole server (dev, test and e2e databases share them),
-- so they are created only when missing. They start NOLOGIN: runMigrations
-- (src/db/migrate.ts) gives each one its password from DATABASE_URL_*.
-- Privileges and policies belong to this database.
--
-- The owner (the migration user) is not bound by RLS. App roles never own a
-- table and never have BYPASSRLS; tests/integration/db-roles.test.ts checks it.
-- A clinic may only point its logo and owner photo at its own images: the
-- media references become composite with the clinic. Foreign keys are checked
-- without RLS, so a single-column reference would accept another clinic's row.
ALTER TABLE "media" ADD CONSTRAINT "media_clinic_id_id_unique" UNIQUE("clinic_id","id");--> statement-breakpoint
ALTER TABLE "clinics" DROP CONSTRAINT "clinics_logo_media_id_media_id_fk";--> statement-breakpoint
ALTER TABLE "clinics" DROP CONSTRAINT "clinics_owner_photo_media_id_media_id_fk";--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_logo_media_fk" FOREIGN KEY ("id","logo_media_id") REFERENCES "public"."media"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinics" ADD CONSTRAINT "clinics_owner_photo_media_fk" FOREIGN KEY ("id","owner_photo_media_id") REFERENCES "public"."media"("clinic_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['app_auth', 'app_panel', 'app_client', 'app_platform'] LOOP
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS', role_name);
    END IF;
  END LOOP;
END
$$;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_auth, app_panel, app_client, app_platform;--> statement-breakpoint

-- app_auth: Better Auth's tables only.
GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, accounts, verifications, two_factors, rate_limits TO app_auth;--> statement-breakpoint

-- app_panel: every clinic table, filtered by the clinic set for the
-- transaction: set_config('app.clinic_id', <id>, true), done by inClinic in
-- src/db/client.ts. Without the setting the comparison is null: no rows.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'appointments', 'business_hours', 'expense_categories', 'expenses',
    'installments', 'media', 'patients', 'payment_methods', 'payments',
    'quote_items', 'quotes', 'sale_items', 'sale_revisions', 'sale_sessions',
    'sales', 'service_categories', 'services', 'time_blocks'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_panel', table_name);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO app_panel'
      ' USING (clinic_id = nullif(current_setting(''app.clinic_id'', true), '''')::uuid)'
      ' WITH CHECK (clinic_id = nullif(current_setting(''app.clinic_id'', true), '''')::uuid)',
      table_name || '_panel', table_name
    );
  END LOOP;
END
$$;--> statement-breakpoint

-- The history is append-only for the panel.
GRANT SELECT, INSERT ON audit_logs TO app_panel;--> statement-breakpoint
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY audit_logs_panel ON audit_logs FOR ALL TO app_panel
  USING (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
  WITH CHECK (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);--> statement-breakpoint

-- service_availability has no clinic_id: it follows its service.
GRANT SELECT, INSERT, UPDATE, DELETE ON service_availability TO app_panel;--> statement-breakpoint
ALTER TABLE service_availability ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY service_availability_panel ON service_availability FOR ALL TO app_panel
  USING (EXISTS (
    SELECT 1 FROM services s
    WHERE s.id = service_availability.service_id
      AND s.clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM services s
    WHERE s.id = service_availability.service_id
      AND s.clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid
  ));--> statement-breakpoint

-- The panel reads its own clinic and changes only the branding columns it
-- edits today (src/modules/branding). Never id, slug, is_active (root's
-- suspension switch), logo_media_id or created_at.
GRANT SELECT ON clinics TO app_panel;--> statement-breakpoint
GRANT UPDATE (display_name, area_label, theme, owner_photo_media_id, updated_at) ON clinics TO app_panel;--> statement-breakpoint
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY clinics_panel ON clinics FOR ALL TO app_panel
  USING (id = nullif(current_setting('app.clinic_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.clinic_id', true), '')::uuid);--> statement-breakpoint

-- users has a clinic_id, so it gets RLS like every clinic table. Better Auth
-- and the platform see every account; the panel has no privilege on it, and
-- its policy only states the clinic rule.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY users_auth ON users FOR ALL TO app_auth USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY users_panel ON users FOR ALL TO app_panel
  USING (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
  WITH CHECK (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);--> statement-breakpoint

-- app_platform: root's clinic list and creation (createClinic seeds the
-- tables below) and the owner accounts of scripts/admin.ts. No clinic filter.
GRANT SELECT, INSERT, UPDATE, DELETE ON clinics, service_categories, services, payment_methods, expense_categories TO app_platform;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON users, accounts, sessions, two_factors TO app_platform;--> statement-breakpoint
GRANT INSERT ON audit_logs TO app_platform;--> statement-breakpoint
CREATE POLICY clinics_platform ON clinics FOR ALL TO app_platform USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY service_categories_platform ON service_categories FOR ALL TO app_platform USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY services_platform ON services FOR ALL TO app_platform USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY payment_methods_platform ON payment_methods FOR ALL TO app_platform USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY expense_categories_platform ON expense_categories FOR ALL TO app_platform USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY audit_logs_platform ON audit_logs FOR ALL TO app_platform USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY users_platform ON users FOR ALL TO app_platform USING (true) WITH CHECK (true);
