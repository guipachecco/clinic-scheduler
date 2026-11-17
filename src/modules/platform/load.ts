import "server-only";

import { listClinics } from "@/modules/clinics/clinics";

import {
  getAccountTotals,
  getClinicUsage,
  getDailyCreated,
  getDatabaseStats,
  getErrorSummary,
  listHealthHistory,
  measureDbLatency,
  pruneOldMonitoringRows,
  recordHealthCheck,
} from "./monitoring";

// Everything the monitoring screen shows, in one call (kept out of the page
// so the render stays pure). Records the latency sample of this visit and,
// now and then, prunes rows older than 30 days.
export async function loadMonitoring(now: Date) {
  // Measured first, alone, so the other queries do not slow the sample.
  const latency = await measureDbLatency(5);
  await recordHealthCheck(latency.median, "painel").catch(() => {});
  if (Math.random() < 0.1) await pruneOldMonitoringRows(now).catch(() => {});

  const start = performance.now();
  const [db, errors, history, daily, accounts, clinics, usage] =
    await Promise.all([
      getDatabaseStats(),
      getErrorSummary(now),
      listHealthHistory(now, 72),
      getDailyCreated(30),
      getAccountTotals(now),
      listClinics(),
      getClinicUsage(),
    ]);
  return {
    latency,
    queriesMs: performance.now() - start,
    db,
    errors,
    history,
    daily,
    accounts,
    clinics,
    usage,
  };
}
