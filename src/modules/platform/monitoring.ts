// No "server-only" here: src/instrumentation.ts imports this file, and the
// instrumentation bundle is not built with the react-server condition. It
// still never reaches the browser (only Server Components and the
// instrumentation import it).
import { count, desc, gte, lt, sql } from "drizzle-orm";

import { platformDb } from "@/db/client";
import { platformErrors, platformHealthChecks, users } from "@/db/schema";

import { latencySummary, type LatencySummary } from "./stats";

// Root's monitoring screen: database health, latency, errors and how much
// each clinic uses the system. Everything here is counts, sizes and times;
// no personal data leaves these queries. Runs as app_platform (migration 0040).

const RETENTION_DAYS = 30;
// /api/saude writes at most one sample every few minutes, however often it
// is called (an uptime monitor every minute, or someone hammering it).
const HEALTH_SAMPLE_GAP_MINUTES = 4;

export type HealthSource = "painel" | "saude";

async function pingOnce(): Promise<number> {
  const start = performance.now();
  await platformDb.execute(sql`select 1`);
  return performance.now() - start;
}

// A few round trips in a row: the first may open a connection (or wake a
// sleeping Neon compute), so the median tells the usual latency.
export async function measureDbLatency(samples = 5): Promise<LatencySummary> {
  const values: number[] = [];
  for (let i = 0; i < samples; i++) values.push(await pingOnce());
  return latencySummary(values);
}

export async function recordHealthCheck(
  dbMs: number,
  source: HealthSource,
): Promise<void> {
  const ms = Math.max(0, Math.round(dbMs));
  if (source === "saude") {
    // One statement, so two calls at once still write one row at most.
    await platformDb.execute(sql`
      insert into platform_health_checks (db_ms, source)
      select ${ms}, ${source}
      where not exists (
        select 1 from platform_health_checks
        where source = ${source}
          and created_at > now() - make_interval(mins => ${HEALTH_SAMPLE_GAP_MINUTES})
      )
    `);
  } else {
    await platformDb.insert(platformHealthChecks).values({ dbMs: ms, source });
  }
}

export async function pruneOldMonitoringRows(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
  await platformDb
    .delete(platformErrors)
    .where(lt(platformErrors.createdAt, cutoff));
  await platformDb
    .delete(platformHealthChecks)
    .where(lt(platformHealthChecks.createdAt, cutoff));
}

export type HealthPoint = { at: Date; dbMs: number; source: string };

export async function listHealthHistory(
  now = new Date(),
  hours = 72,
): Promise<HealthPoint[]> {
  const since = new Date(now.getTime() - hours * 3_600_000);
  const rows = await platformDb
    .select({
      at: platformHealthChecks.createdAt,
      dbMs: platformHealthChecks.dbMs,
      source: platformHealthChecks.source,
    })
    .from(platformHealthChecks)
    .where(gte(platformHealthChecks.createdAt, since))
    .orderBy(desc(platformHealthChecks.createdAt))
    .limit(300);
  return rows.reverse();
}

export type DatabaseStats = {
  version: string;
  sizeBytes: number;
  startedAt: Date | null;
  maxConnections: number;
  connections: { state: string; count: number }[];
  cacheHitRatio: number | null;
  commits: number;
  rollbacks: number;
  deadlocks: number;
  tables: {
    name: string;
    rows: number;
    sizeBytes: number;
    seqScans: number;
    indexScans: number;
  }[];
};

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getDatabaseStats(): Promise<DatabaseStats> {
  const [server, activity, database, tables] = await Promise.all([
    platformDb.execute<{
      version: string;
      size: string;
      started: Date | string | null;
      max_connections: string;
    }>(sql`
      select current_setting('server_version') as version,
             pg_database_size(current_database())::text as size,
             pg_postmaster_start_time() as started,
             current_setting('max_connections') as max_connections
    `),
    platformDb.execute<{ state: string | null; total: string }>(sql`
      select state, count(*)::text as total
      from pg_stat_activity
      where datname = current_database()
      group by state
      order by count(*) desc
    `),
    platformDb.execute<{
      blks_hit: string;
      blks_read: string;
      xact_commit: string;
      xact_rollback: string;
      deadlocks: string;
    }>(sql`
      select blks_hit::text, blks_read::text, xact_commit::text,
             xact_rollback::text, deadlocks::text
      from pg_stat_database where datname = current_database()
    `),
    platformDb.execute<{
      name: string;
      live: string;
      size: string;
      seq: string;
      idx: string;
    }>(sql`
      select relname as name, n_live_tup::text as live,
             pg_total_relation_size(relid)::text as size,
             coalesce(seq_scan, 0)::text as seq,
             coalesce(idx_scan, 0)::text as idx
      from pg_stat_user_tables
      where schemaname = 'public' and relname not like '\_\_drizzle%'
      order by pg_total_relation_size(relid) desc
      limit 15
    `),
  ]);
  const s = server.rows[0];
  const d = database.rows[0];
  const hit = num(d?.blks_hit);
  const read = num(d?.blks_read);
  return {
    version: s?.version ?? "?",
    sizeBytes: num(s?.size),
    startedAt: s?.started ? new Date(s.started) : null,
    maxConnections: num(s?.max_connections),
    connections: activity.rows.map((row) => ({
      state: row.state ?? "sem estado",
      count: num(row.total),
    })),
    cacheHitRatio: hit + read > 0 ? hit / (hit + read) : null,
    commits: num(d?.xact_commit),
    rollbacks: num(d?.xact_rollback),
    deadlocks: num(d?.deadlocks),
    tables: tables.rows.map((row) => ({
      name: row.name,
      rows: num(row.live),
      sizeBytes: num(row.size),
      seqScans: num(row.seq),
      indexScans: num(row.idx),
    })),
  };
}

export type ErrorRow = {
  id: string;
  at: Date;
  digest: string | null;
  errorName: string;
  message: string;
  path: string;
  method: string;
  routeType: string;
  routePath: string | null;
};

export type ErrorGroup = {
  errorName: string;
  message: string;
  path: string;
  routeType: string;
  total: number;
  lastAt: Date;
};

export type ErrorSummary = {
  last24h: number;
  last7d: number;
  perDay: { day: string; total: number }[];
  groups: ErrorGroup[];
  recent: ErrorRow[];
};

export async function getErrorSummary(now = new Date()): Promise<ErrorSummary> {
  const day = new Date(now.getTime() - 86_400_000);
  const week = new Date(now.getTime() - 7 * 86_400_000);
  const [counts, perDay, groups, recent] = await Promise.all([
    platformDb
      .select({
        last24h: sql<number>`count(*) filter (where ${platformErrors.createdAt} >= ${day})::int`,
        last7d: count(),
      })
      .from(platformErrors)
      .where(gte(platformErrors.createdAt, week)),
    platformDb.execute<{ day: string; total: number }>(sql`
      with days as (
        select generate_series(
          (${now}::timestamptz at time zone 'America/Sao_Paulo')::date - 13,
          (${now}::timestamptz at time zone 'America/Sao_Paulo')::date,
          interval '1 day'
        )::date as day
      )
      select to_char(d.day, 'YYYY-MM-DD') as day, coalesce(e.total, 0)::int as total
      from days d
      left join (
        select (created_at at time zone 'America/Sao_Paulo')::date as day, count(*) as total
        from platform_errors
        where created_at >= ${now}::timestamptz - interval '15 days'
        group by 1
      ) e on e.day = d.day
      order by d.day
    `),
    platformDb
      .select({
        errorName: platformErrors.errorName,
        message: platformErrors.message,
        path: platformErrors.path,
        routeType: platformErrors.routeType,
        total: count(),
        lastAt: sql<Date>`max(${platformErrors.createdAt})`.mapWith(
          (value: string | Date) => new Date(value),
        ),
      })
      .from(platformErrors)
      .where(gte(platformErrors.createdAt, week))
      .groupBy(
        platformErrors.errorName,
        platformErrors.message,
        platformErrors.path,
        platformErrors.routeType,
      )
      .orderBy(desc(count()), desc(sql`max(${platformErrors.createdAt})`))
      .limit(15),
    platformDb
      .select({
        id: platformErrors.id,
        at: platformErrors.createdAt,
        digest: platformErrors.digest,
        errorName: platformErrors.errorName,
        message: platformErrors.message,
        path: platformErrors.path,
        method: platformErrors.method,
        routeType: platformErrors.routeType,
        routePath: platformErrors.routePath,
      })
      .from(platformErrors)
      .orderBy(desc(platformErrors.createdAt))
      .limit(20),
  ]);
  return {
    last24h: counts[0]?.last24h ?? 0,
    last7d: counts[0]?.last7d ?? 0,
    perDay: perDay.rows.map((row) => ({
      day: row.day,
      total: num(row.total),
    })),
    groups,
    recent,
  };
}

export type ClinicUsage = {
  clinicId: string;
  patients: number;
  patients30d: number;
  appointments: number;
  appointments30d: number;
  online30d: number;
  upcoming: number;
  services: number;
  professionals: number;
  admins: number;
  sales30d: number;
  anamneses: number;
  photos: number;
  lastActivityAt: Date | null;
  mercadoPago: boolean;
  asaas: boolean;
  anamnesisTemplate: boolean;
};

export async function getClinicUsage(): Promise<Map<string, ClinicUsage>> {
  const result = await platformDb.execute<{
    clinic_id: string;
    patients: number;
    patients_30d: number;
    appointments: number;
    appointments_30d: number;
    online_30d: number;
    upcoming: number;
    services: number;
    professionals: number;
    admins: number;
    sales_30d: number;
    anamneses: number;
    photos: number;
    last_activity_at: Date | string | null;
    mercado_pago: boolean;
    asaas: boolean;
    anamnesis_template: boolean;
  }>(sql`select * from platform_clinic_usage()`);
  return new Map(
    result.rows.map((row) => [
      row.clinic_id,
      {
        clinicId: row.clinic_id,
        patients: num(row.patients),
        patients30d: num(row.patients_30d),
        appointments: num(row.appointments),
        appointments30d: num(row.appointments_30d),
        online30d: num(row.online_30d),
        upcoming: num(row.upcoming),
        services: num(row.services),
        professionals: num(row.professionals),
        admins: num(row.admins),
        sales30d: num(row.sales_30d),
        anamneses: num(row.anamneses),
        photos: num(row.photos),
        lastActivityAt: row.last_activity_at
          ? new Date(row.last_activity_at)
          : null,
        mercadoPago: Boolean(row.mercado_pago),
        asaas: Boolean(row.asaas),
        anamnesisTemplate: Boolean(row.anamnesis_template),
      },
    ]),
  );
}

export type DailyCreated = {
  day: string;
  appointments: number;
  online: number;
  patients: number;
  clientAccounts: number;
};

export async function getDailyCreated(days = 30): Promise<DailyCreated[]> {
  const result = await platformDb.execute<{
    day: string;
    appointments: number;
    online: number;
    patients: number;
    client_accounts: number;
  }>(sql`
    select to_char(day, 'YYYY-MM-DD') as day, appointments, online, patients,
           client_accounts
    from platform_daily_created(${days})
  `);
  return result.rows.map((row) => ({
    day: row.day,
    appointments: num(row.appointments),
    online: num(row.online),
    patients: num(row.patients),
    clientAccounts: num(row.client_accounts),
  }));
}

export type AccountTotals = {
  root: number;
  admin: number;
  client: number;
  client30d: number;
};

export async function getAccountTotals(
  now = new Date(),
): Promise<AccountTotals> {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const rows = await platformDb
    .select({
      role: users.role,
      total: count(),
      recent: sql<number>`count(*) filter (where ${users.createdAt} >= ${since})::int`,
    })
    .from(users)
    .groupBy(users.role);
  const totals: AccountTotals = { root: 0, admin: 0, client: 0, client30d: 0 };
  for (const row of rows) {
    totals[row.role] = row.total;
    if (row.role === "client") totals.client30d = row.recent;
  }
  return totals;
}

// Errors recorded from src/instrumentation.ts. Kept apart from the reads so
// it can never throw into the request that failed.
export type ErrorRecord = {
  digest: string | null;
  errorName: string;
  message: string;
  path: string;
  method: string;
  routeType: string;
  routePath: string | null;
};

export async function recordError(record: ErrorRecord): Promise<void> {
  await platformDb.insert(platformErrors).values(record);
  // Cheap, indexed, and keeps the table small without a scheduled job.
  if (Math.random() < 0.05) await pruneOldMonitoringRows();
}
