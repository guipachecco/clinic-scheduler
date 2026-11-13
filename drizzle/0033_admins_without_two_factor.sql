-- Clinic owners (admin) no longer use two-factor authentication; only root
-- does (src/modules/auth/session.ts). Removes the 2FA an owner already set up,
-- so her next sign-in asks for the password alone.
DELETE FROM "two_factors"
WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "role" = 'admin');
--> statement-breakpoint
UPDATE "users" SET "two_factor_enabled" = false
WHERE "role" = 'admin' AND "two_factor_enabled";
