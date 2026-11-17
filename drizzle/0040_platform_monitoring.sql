CREATE TABLE "platform_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"digest" text,
	"error_name" text NOT NULL,
	"message" text NOT NULL,
	"path" text NOT NULL,
	"method" text NOT NULL,
	"route_type" text NOT NULL,
	"route_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_health_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"db_ms" integer NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "platform_errors_created_at_idx" ON "platform_errors" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "platform_health_checks_created_at_idx" ON "platform_health_checks" USING btree ("created_at");--> statement-breakpoint

-- Root's monitoring screen (src/modules/platform/monitoring.ts). Both tables
-- belong to app_platform only: no clinic, panel or client ever reads them.
ALTER TABLE "platform_errors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_health_checks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON platform_errors, platform_health_checks TO app_platform;--> statement-breakpoint
CREATE POLICY platform_errors_platform ON platform_errors FOR ALL TO app_platform USING (true) WITH CHECK (true);--> statement-breakpoint
CREATE POLICY platform_health_checks_platform ON platform_health_checks FOR ALL TO app_platform USING (true) WITH CHECK (true);--> statement-breakpoint

-- How much each clinic uses the system: counts and yes/no only, never a name,
-- phone or any other row content. app_platform has no grant on these tables,
-- so the counting runs as the owner, like the client functions of 0013.
CREATE FUNCTION platform_clinic_usage()
RETURNS TABLE (
  clinic_id uuid,
  patients integer,
  patients_30d integer,
  appointments integer,
  appointments_30d integer,
  online_30d integer,
  upcoming integer,
  services integer,
  professionals integer,
  admins integer,
  sales_30d integer,
  anamneses integer,
  photos integer,
  last_activity_at timestamptz,
  mercado_pago boolean,
  asaas boolean,
  anamnesis_template boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id,
    (SELECT count(*)::int FROM patients p WHERE p.clinic_id = c.id AND p.anonymized_at IS NULL),
    (SELECT count(*)::int FROM patients p WHERE p.clinic_id = c.id AND p.created_at >= now() - interval '30 days'),
    (SELECT count(*)::int FROM appointments a WHERE a.clinic_id = c.id),
    (SELECT count(*)::int FROM appointments a WHERE a.clinic_id = c.id AND a.created_at >= now() - interval '30 days'),
    (SELECT count(*)::int FROM appointments a WHERE a.clinic_id = c.id AND a.source = 'online' AND a.created_at >= now() - interval '30 days'),
    (SELECT count(*)::int FROM appointments a WHERE a.clinic_id = c.id AND a.status IN ('requested', 'confirmed') AND a.starts_at >= now()),
    (SELECT count(*)::int FROM services s WHERE s.clinic_id = c.id AND s.is_active AND NOT s.is_flexible),
    (SELECT count(*)::int FROM professionals pr WHERE pr.clinic_id = c.id AND pr.is_active),
    (SELECT count(*)::int FROM users u WHERE u.clinic_id = c.id AND u.role = 'admin'),
    (SELECT count(*)::int FROM sales sa WHERE sa.clinic_id = c.id AND sa.created_at >= now() - interval '30 days'),
    (SELECT count(*)::int FROM anamneses an WHERE an.clinic_id = c.id),
    (SELECT count(*)::int FROM clinic_photos ph WHERE ph.clinic_id = c.id),
    (SELECT max(al.created_at) FROM audit_logs al WHERE al.clinic_id = c.id),
    EXISTS (SELECT 1 FROM mercado_pago_accounts m WHERE m.clinic_id = c.id),
    EXISTS (SELECT 1 FROM asaas_accounts aa WHERE aa.clinic_id = c.id AND aa.status = 'approved'),
    c.anamnesis_template_choice IS NOT NULL
  FROM clinics c
$$;--> statement-breakpoint

-- What was created each day (São Paulo time) over the last p_days days, all
-- clinics together: appointments (and how many online), patients and client
-- accounts. Counts only.
CREATE FUNCTION platform_daily_created(p_days integer)
RETURNS TABLE (
  day date,
  appointments integer,
  online integer,
  patients integer,
  client_accounts integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH days AS (
    SELECT generate_series(
      (now() AT TIME ZONE 'America/Sao_Paulo')::date - (least(greatest(p_days, 1), 90) - 1),
      (now() AT TIME ZONE 'America/Sao_Paulo')::date,
      interval '1 day'
    )::date AS day
  ),
  since AS (
    SELECT (min(day)::timestamp AT TIME ZONE 'America/Sao_Paulo') AS t FROM days
  )
  SELECT d.day,
    coalesce(a.total, 0), coalesce(a.online, 0),
    coalesce(p.total, 0), coalesce(u.total, 0)
  FROM days d
  LEFT JOIN (
    SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
           count(*)::int AS total,
           (count(*) FILTER (WHERE source = 'online'))::int AS online
    FROM appointments, since WHERE created_at >= since.t GROUP BY 1
  ) a ON a.day = d.day
  LEFT JOIN (
    SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day, count(*)::int AS total
    FROM patients, since WHERE created_at >= since.t GROUP BY 1
  ) p ON p.day = d.day
  LEFT JOIN (
    SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day, count(*)::int AS total
    FROM users, since WHERE role = 'client' AND created_at >= since.t GROUP BY 1
  ) u ON u.day = d.day
  ORDER BY d.day
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION platform_clinic_usage() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION platform_daily_created(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION platform_clinic_usage() TO app_platform;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION platform_daily_created(integer) TO app_platform;
