import { pathPattern, safeErrorMessage, safeRequestPath } from "./stats";

// Turns what Next.js hands onRequestError into a row of platform_errors, or
// null when it is not a real failure (redirect(), notFound() and friends are
// thrown on purpose). Pure, so the unit tests reach it.

const CONTROL_FLOW_DIGEST =
  /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING|HANGING_PROMISE_REJECTION)/;

export type ErrorReport = {
  digest: string | null;
  errorName: string;
  message: string;
  path: string;
  method: string;
  routeType: string;
  routePath: string | null;
};

function readDigest(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" || typeof digest === "number"
    ? String(digest)
    : null;
}

export function buildErrorReport(
  error: unknown,
  request: { path: string; method: string },
  context: { routeType: string; routePath?: string | null },
): ErrorReport | null {
  const digest = readDigest(error);
  if (digest && CONTROL_FLOW_DIGEST.test(digest)) return null;
  const errorName =
    error instanceof Error ? error.name || "Error" : typeof error;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return {
    digest: digest ? digest.slice(0, 100) : null,
    errorName: errorName.slice(0, 100),
    message: safeErrorMessage(message),
    path: pathPattern(safeRequestPath(request.path)),
    method: (request.method || "?").slice(0, 10).toUpperCase(),
    routeType: (context.routeType || "?").slice(0, 20),
    routePath: context.routePath ? context.routePath.slice(0, 300) : null,
  };
}

// Errors logged by the app itself (logger.error) after it handled them, e.g.
// a payment provider that answered with a failure.
export function buildLogReport(
  message: string,
  context: Record<string, unknown> | undefined,
): ErrorReport {
  const error = context?.error;
  const detail =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "";
  const errorName =
    error && typeof error === "object" && "name" in error
      ? String((error as { name: unknown }).name)
      : "Log";
  return {
    digest: null,
    errorName: errorName.slice(0, 100),
    message: safeErrorMessage(detail ? `${message}: ${detail}` : message),
    path: "(registro do app)",
    method: "-",
    routeType: "log",
    routePath: null,
  };
}
