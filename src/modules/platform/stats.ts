import { redactText } from "@/lib/logger";

// Pure helpers for the monitoring screen (no database), kept apart so the
// unit tests can reach them.

export type LatencySummary = {
  min: number;
  median: number;
  max: number;
  samples: number;
};

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[rank]!;
}

export function latencySummary(values: readonly number[]): LatencySummary {
  if (values.length === 0) return { min: 0, median: 0, max: 0, samples: 0 };
  return {
    min: Math.min(...values),
    median: percentile(values, 50),
    max: Math.max(...values),
    samples: values.length,
  };
}

export type LatencyLevel = "good" | "warn" | "bad";

// Round trip to the database. Neon in São Paulo answers a warm query in a few
// milliseconds; above 100 ms something is slow, above 400 ms users feel it.
export function latencyLevel(ms: number): LatencyLevel {
  if (ms < 100) return "good";
  if (ms < 400) return "warn";
  return "bad";
}

const MAX_MESSAGE = 500;
const MAX_PATH = 300;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// The path of the failed request with no query string (which may carry a
// token or a search typed by someone) and trimmed to a sane size.
export function safeRequestPath(raw: string): string {
  let path = raw;
  try {
    path = new URL(raw, "http://x").pathname;
  } catch {
    path = raw.split(/[?#]/)[0] ?? "";
  }
  return redactText(path).slice(0, MAX_PATH) || "/";
}

// Ids in a path make every request a group of its own; the screen groups
// /admin/pacientes/<id> together.
export function pathPattern(path: string): string {
  return path.replace(UUID, ":id");
}

export function safeErrorMessage(message: string): string {
  const clean = redactText(message).replace(/\s+/g, " ").trim();
  return clean.length > MAX_MESSAGE
    ? `${clean.slice(0, MAX_MESSAGE - 1)}…`
    : clean || "(sem mensagem)";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}

export function formatMs(ms: number): string {
  if (ms < 10)
    return `${ms.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
}
