// PostgreSQL error codes the application reacts to.
// https://www.postgresql.org/docs/current/errcodes-appendix.html
export const PG_UNIQUE_VIOLATION = "23505";
export const PG_EXCLUSION_VIOLATION = "23P01";

type PgError = Error & { code: string; constraint?: string };

// Drizzle wraps driver errors in DrizzleQueryError, keeping the original in `cause`.
export function findPgError(error: unknown): PgError | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
    if (typeof (current as Partial<PgError>).code === "string") {
      return current as PgError;
    }
    current = current.cause;
  }
  return undefined;
}

// True when an insert or update was rejected because the time range overlaps
// an active appointment (constraint appointments_no_overlap).
export function isAppointmentOverlapError(error: unknown): boolean {
  const pgError = findPgError(error);
  return (
    pgError?.code === PG_EXCLUSION_VIOLATION &&
    pgError.constraint === "appointments_no_overlap"
  );
}

export function isUniqueViolation(error: unknown, constraint?: string) {
  const pgError = findPgError(error);
  return (
    pgError?.code === PG_UNIQUE_VIOLATION &&
    (constraint === undefined || pgError.constraint === constraint)
  );
}
