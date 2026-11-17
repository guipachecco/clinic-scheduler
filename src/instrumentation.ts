import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Fails at startup, with a clear message, when the configuration is incomplete.
  await import("@/lib/env");

  if (process.env.NODE_ENV === "production") {
    const { installConsoleRedaction } = await import("@/lib/logger");
    installConsoleRedaction();
  }

  // Every logger.error also lands on root's monitoring screen.
  if (process.env.NODE_ENV !== "test") {
    const [{ setErrorSink }, { buildLogReport }, { recordError }] =
      await Promise.all([
        import("@/lib/logger"),
        import("@/modules/platform/report-error"),
        import("@/modules/platform/monitoring"),
      ]);
    setErrorSink((message, context) => {
      recordError(buildLogReport(message, context)).catch(() => {
        // Monitoring must never break the app; the log line still goes out.
      });
    });
  }
}

// Unhandled server errors (pages, Route Handlers, Server Actions), for root's
// monitoring screen. Only a redacted message, the path without its query
// string and the route are kept (src/modules/platform/report-error.ts).
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const [{ buildErrorReport }, { recordError }] = await Promise.all([
      import("@/modules/platform/report-error"),
      import("@/modules/platform/monitoring"),
    ]);
    const report = buildErrorReport(error, request, context);
    if (report) await recordError(report);
  } catch {
    // The database may be the thing that failed; Next.js logs the error anyway.
  }
};
