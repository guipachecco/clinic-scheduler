export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Fails at startup, with a clear message, when the configuration is incomplete.
  await import("@/lib/env");

  if (process.env.NODE_ENV === "production") {
    const { installConsoleRedaction } = await import("@/lib/logger");
    installConsoleRedaction();
  }
}
