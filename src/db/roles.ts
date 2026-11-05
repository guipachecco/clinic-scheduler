// The PostgreSQL roles the app connects with (created by migration 0011),
// each with its own connection URL. The owner DATABASE_URL is only for
// migrations and test fixtures.
export const DB_ROLE_ENV = {
  app_auth: "DATABASE_URL_AUTH",
  app_panel: "DATABASE_URL_PANEL",
  app_client: "DATABASE_URL_CLIENT",
  app_platform: "DATABASE_URL_PLATFORM",
} as const;

export type RoleName = keyof typeof DB_ROLE_ENV;

export const DB_ROLE_NAMES = Object.keys(DB_ROLE_ENV) as RoleName[];

export type RoleUrls = Record<RoleName, string>;

// Reads the four role URLs from the environment. Returns undefined when none
// is set; throws when only some are, so a half-configured deploy stops early.
export function roleUrlsFromEnv(
  source: Record<string, string | undefined>,
): RoleUrls | undefined {
  const entries = DB_ROLE_NAMES.map(
    (role) => [role, source[DB_ROLE_ENV[role]]] as const,
  );
  const missing = entries.filter(([, url]) => !url);
  if (missing.length === entries.length) return undefined;
  if (missing.length > 0) {
    throw new Error(
      `Defina também ${missing.map(([role]) => DB_ROLE_ENV[role]).join(", ")} (veja o .env.example).`,
    );
  }
  return Object.fromEntries(entries) as RoleUrls;
}
