import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { clientDb, inClinic, platformDb } from "@/db/client";
import { findPgError } from "@/db/errors";
import { db, endPools } from "@/db/owner";
import {
  clinics,
  patients,
  platformErrors,
  platformHealthChecks,
} from "@/db/schema";
import { setClinicModule } from "@/modules/clinics/clinics";
import {
  getClinicUsage,
  getDailyCreated,
  getDatabaseStats,
  getErrorSummary,
  listHealthHistory,
  measureDbLatency,
  pruneOldMonitoringRows,
  recordError,
  recordHealthCheck,
} from "@/modules/platform/monitoring";

import { otherClinic } from "../helpers/clinic";

// Migration 0040: root's monitoring screen. Counts per clinic, errors and
// latency samples, all through app_platform. Every record is fictitious.

let clinicId: string;
let patientId: string;
let rootUserId: string;

async function pgErrorCode(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return findPgError(error)?.code;
  }
  return "no error";
}

beforeAll(async () => {
  clinicId = await otherClinic("clinica-monitoramento-teste");
  const [patient] = await db
    .insert(patients)
    .values({
      clinicId,
      name: "Paciente Monitor",
      nameNormalized: "paciente monitor",
      phone: "+5500000004401",
    })
    .returning({ id: patients.id });
  patientId = patient!.id;
  const root = await db.execute<{ id: string }>(
    sql`select id from users where role = 'root' limit 1`,
  );
  rootUserId =
    root.rows[0]?.id ??
    (
      await db.execute<{ id: string }>(
        sql`insert into users (name, email, role) values ('Root Teste', 'root-monitor@example.test', 'root') returning id`,
      )
    ).rows[0]!.id;
});

afterAll(async () => {
  await db.delete(patients).where(eq(patients.id, patientId));
  await db.delete(platformErrors);
  await db.delete(platformHealthChecks);
  await endPools();
});

describe("platform monitoring", () => {
  it("counts each clinic's usage without reading its rows", async () => {
    const usage = await getClinicUsage();
    const row = usage.get(clinicId);
    expect(row).toBeDefined();
    expect(row!.patients).toBeGreaterThanOrEqual(1);
    expect(row!.patients30d).toBeGreaterThanOrEqual(1);
    // app_platform still has no grant on the clinic's own tables.
    expect(await pgErrorCode(platformDb.select().from(patients).limit(1))).toBe(
      "42501",
    );
  });

  it("only app_platform may call the counting functions", async () => {
    for (const run of [
      inClinic(clinicId, (tx) =>
        tx.execute(sql`select * from platform_clinic_usage()`),
      ),
      clientDb.execute(sql`select * from platform_daily_created(7)`),
    ]) {
      expect(await pgErrorCode(run)).toBe("42501");
    }
  });

  it("lists every day, even the empty ones, within 90 days", async () => {
    const days = await getDailyCreated(30);
    expect(days).toHaveLength(30);
    expect(days.at(-1)!.patients).toBeGreaterThanOrEqual(1);
    expect(await getDailyCreated(1000)).toHaveLength(90);
  });

  it("records errors and groups them", async () => {
    const report = {
      digest: "123",
      errorName: "Error",
      message: "falha de teste",
      path: "/admin/agenda",
      method: "GET",
      routeType: "render",
      routePath: "/admin/(painel)/agenda/page",
    };
    await recordError(report);
    await recordError(report);
    const summary = await getErrorSummary();
    expect(summary.last24h).toBeGreaterThanOrEqual(2);
    expect(summary.perDay).toHaveLength(14);
    const group = summary.groups.find((g) => g.message === "falha de teste");
    expect(group?.total).toBe(2);
    expect(summary.recent[0]!.message).toBe("falha de teste");
  });

  it("samples latency, at most one per few minutes from /api/saude", async () => {
    const latency = await measureDbLatency(3);
    expect(latency.samples).toBe(3);
    await recordHealthCheck(latency.median, "saude");
    await recordHealthCheck(latency.median, "saude");
    await recordHealthCheck(latency.median, "painel");
    const history = await listHealthHistory();
    expect(history.filter((p) => p.source === "saude")).toHaveLength(1);
    expect(history.filter((p) => p.source === "painel")).toHaveLength(1);
  });

  it("prunes rows older than 30 days", async () => {
    const old = new Date(Date.now() - 40 * 86_400_000);
    await db.insert(platformHealthChecks).values({
      dbMs: 5,
      source: "painel",
      createdAt: old,
    });
    await pruneOldMonitoringRows();
    const left = await db
      .select({ id: platformHealthChecks.id })
      .from(platformHealthChecks)
      .where(
        sql`${platformHealthChecks.createdAt} < now() - interval '30 days'`,
      );
    expect(left).toEqual([]);
  });

  it("reads the database statistics", async () => {
    const stats = await getDatabaseStats();
    expect(stats.sizeBytes).toBeGreaterThan(0);
    expect(stats.tables.length).toBeGreaterThan(0);
    expect(stats.maxConnections).toBeGreaterThan(0);
  });

  it("switches one module and logs it", async () => {
    await setClinicModule(clinicId, "reviews", false, rootUserId);
    let [row] = await db
      .select({ modules: clinics.modules })
      .from(clinics)
      .where(eq(clinics.id, clinicId));
    expect(row!.modules).not.toContain("reviews");
    await setClinicModule(clinicId, "reviews", true, rootUserId);
    [row] = await db
      .select({ modules: clinics.modules })
      .from(clinics)
      .where(eq(clinics.id, clinicId));
    expect(row!.modules).toContain("reviews");
    expect(
      await setClinicModule("nao-e-uuid", "reviews", true, rootUserId),
    ).toEqual({
      ok: false,
    });
  });

  it("the panel cannot read the monitoring tables", async () => {
    expect(
      await pgErrorCode(
        inClinic(clinicId, (tx) => tx.select().from(platformErrors).limit(1)),
      ),
    ).toBe("42501");
  });
});
