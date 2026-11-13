-- A clinic may have several professionals, each with her own agenda
-- (docs/superpowers/specs/2026-11-12-varias-profissionais-design.md, stage 1).
--
-- Compatible with the code still running when this applies:
-- - every clinic gets a professional here, and every new clinic gets one from
--   the clinics trigger below, so createClinic needs no change;
-- - an appointment inserted without professional_id (the old code never names
--   it) goes to the clinic's default professional, by the appointments
--   trigger below;
-- - appointments_no_overlap becomes per professional. The old code still
--   checks the whole clinic before inserting, which is stricter;
-- - client_busy_intervals(uuid, timestamptz, timestamptz) stays as it was;
--   the new code calls the version with the professional.
CREATE TABLE "professionals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clinic_id" uuid NOT NULL,
	"name" text NOT NULL,
	"registration" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "professionals_clinic_id_id_unique" UNIQUE("clinic_id","id"),
	CONSTRAINT "professionals_name_check" CHECK (char_length("professionals"."name") between 1 and 60),
	CONSTRAINT "professionals_registration_check" CHECK ("professionals"."registration" is null or char_length("professionals"."registration") between 1 and 40),
	CONSTRAINT "professionals_sort_order_check" CHECK ("professionals"."sort_order" between 0 and 999)
);
--> statement-breakpoint
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "professionals_clinic_order_idx" ON "professionals" USING btree ("clinic_id","sort_order","created_at");--> statement-breakpoint

-- The name a clinic's first professional gets: the professional's name on
-- the clinic page, else the short name of the panel, else the clinic's name.
CREATE FUNCTION clinic_first_professional_name(c clinics) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT left(coalesce(
    nullif(btrim(c.professional_name), ''),
    nullif(btrim(c.display_name), ''),
    btrim(c.name)
  ), 60)
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION clinic_first_professional_name(clinics) FROM PUBLIC;--> statement-breakpoint

INSERT INTO "professionals" ("clinic_id", "name", "registration")
SELECT c.id,
       clinic_first_professional_name(c),
       left(nullif(btrim(c.professional_registration), ''), 40)
FROM "clinics" c;--> statement-breakpoint

-- Every appointment so far was in the clinic's only agenda.
ALTER TABLE "appointments" ADD COLUMN "professional_id" uuid;--> statement-breakpoint
UPDATE "appointments" a SET "professional_id" = p.id
FROM "professionals" p
WHERE p.clinic_id = a.clinic_id;--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "professional_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_professional_fk" FOREIGN KEY ("clinic_id","professional_id") REFERENCES "public"."professionals"("clinic_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointments_professional_idx" ON "appointments" USING btree ("professional_id","starts_at");--> statement-breakpoint

-- Two professionals may see patients at the same time; one professional
-- still cannot have two active appointments whose occupied ranges overlap.
-- professional_id implies the clinic (composite foreign key above).
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_no_overlap";--> statement-breakpoint
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    "professional_id" WITH =,
    tstzrange("occupied_from", "occupied_until", '[)') WITH &&
  )
  WHERE ("status" IN ('requested', 'confirmed'));--> statement-breakpoint

-- The clinic's default professional: the first active one by sort order,
-- then by creation. Null when the clinic has none active.
CREATE FUNCTION default_professional(p_clinic uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id FROM professionals p
  WHERE p.clinic_id = p_clinic AND p.is_active
  ORDER BY p.sort_order, p.created_at, p.id
  LIMIT 1
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION default_professional(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION default_professional(uuid) TO app_panel, app_client;--> statement-breakpoint

-- An appointment inserted without a professional goes to the default one.
-- The new code always names her; this keeps the old code (and any insert
-- that predates professionals) working.
CREATE FUNCTION appointments_default_professional() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.professional_id IS NULL THEN
    NEW.professional_id := default_professional(NEW.clinic_id);
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION appointments_default_professional() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER appointments_default_professional
  BEFORE INSERT ON appointments
  FOR EACH ROW EXECUTE FUNCTION appointments_default_professional();--> statement-breakpoint

-- Every clinic has at least one professional from the moment it exists.
CREATE FUNCTION clinics_first_professional() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO professionals (clinic_id, name, registration)
  VALUES (
    NEW.id,
    clinic_first_professional_name(NEW),
    left(nullif(btrim(NEW.professional_registration), ''), 40)
  );
  RETURN NULL;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION clinics_first_professional() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER clinics_first_professional
  AFTER INSERT ON clinics
  FOR EACH ROW EXECUTE FUNCTION clinics_first_professional();--> statement-breakpoint

-- app_panel: the team of its own clinic. Never deletes (a professional with
-- appointments is deactivated; the panel offers no delete at all), never
-- changes clinic_id or created_at.
GRANT SELECT, INSERT ON professionals TO app_panel;--> statement-breakpoint
GRANT UPDATE (name, registration, is_active, sort_order, updated_at) ON professionals TO app_panel;--> statement-breakpoint
ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY professionals_panel ON professionals FOR ALL TO app_panel
  USING (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid)
  WITH CHECK (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid);--> statement-breakpoint

-- app_platform: root's clinic creation fires the clinics trigger, which runs
-- as the owner; root reads the team of any clinic.
GRANT SELECT ON professionals TO app_platform;--> statement-breakpoint
CREATE POLICY professionals_platform ON professionals FOR SELECT TO app_platform USING (true);--> statement-breakpoint

-- app_client: the active professionals of her clinic, public columns only
-- (stage 3 shows them on the booking flow).
GRANT SELECT (id, clinic_id, name, is_active, sort_order, created_at) ON professionals TO app_client;--> statement-breakpoint
CREATE POLICY professionals_client ON professionals FOR SELECT TO app_client
  USING (
    clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid
    AND is_active
  );--> statement-breakpoint

-- Busy time of one professional of a clinic, like client_busy_intervals of
-- 0014 (no names or ids, the service's current buffers too, at most 400
-- days, only while the clinic is active and takes online bookings): her
-- active appointments, and the clinic's time blocks, which still hold for
-- everyone (blocks per professional come in stage 2).
CREATE FUNCTION client_busy_intervals(p_clinic uuid, p_professional uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (starts_at timestamptz, ends_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to OR p_to - p_from > interval '400 days' THEN
    RAISE EXCEPTION 'Período inválido' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT busy.starts_at, busy.ends_at
  FROM (
    SELECT least(a.occupied_from, a.starts_at - make_interval(mins => s.buffer_before_minutes)) AS starts_at,
           greatest(a.occupied_until, a.ends_at + make_interval(mins => s.buffer_after_minutes)) AS ends_at
    FROM appointments a
    JOIN services s ON s.clinic_id = a.clinic_id AND s.id = a.service_id
    WHERE a.clinic_id = p_clinic
      AND a.professional_id = p_professional
      AND a.status IN ('requested', 'confirmed')
      AND a.occupied_from < p_to + interval '1 day'
      AND a.occupied_until > p_from - interval '1 day'
    UNION ALL
    SELECT b.starts_at, b.ends_at
    FROM time_blocks b
    WHERE b.clinic_id = p_clinic
      AND b.starts_at < p_to AND b.ends_at > p_from
  ) busy
  WHERE busy.starts_at < p_to AND busy.ends_at > p_from
    AND EXISTS (
      SELECT 1 FROM clinics c
      WHERE c.id = p_clinic AND c.is_active AND c.online_booking_enabled
    )
  ORDER BY busy.starts_at, busy.ends_at;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION client_busy_intervals(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION client_busy_intervals(uuid, uuid, timestamptz, timestamptz) TO app_client;
