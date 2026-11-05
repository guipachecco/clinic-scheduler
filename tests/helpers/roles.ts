import {
  DB_ROLE_ENV,
  DB_ROLE_NAMES,
  type RoleName,
  type RoleUrls,
} from "../../src/db/roles";

// Development and test passwords are fixed: "<role>_dev". Real deploys set
// their own in DATABASE_URL_*.
export function devRoleUrls(ownerUrl: string): RoleUrls {
  return Object.fromEntries(
    DB_ROLE_NAMES.map((role) => {
      const url = new URL(ownerUrl);
      url.username = role;
      url.password = `${role}_dev`;
      return [role, url.toString()];
    }),
  ) as RoleUrls;
}

// The same URLs as environment variables (DATABASE_URL_AUTH, ...).
export function roleUrlEnv(urls: RoleUrls): Record<string, string> {
  return Object.fromEntries(
    DB_ROLE_NAMES.map((role: RoleName) => [DB_ROLE_ENV[role], urls[role]]),
  );
}

// The role URLs of the integration test database (vitest.config.ts sets
// DATABASE_URL to it).
export const ROLE_URLS: RoleUrls = devRoleUrls(
  process.env.DATABASE_URL ??
    "postgres://clinic:clinic@localhost:5432/clinic_scheduler_test",
);
