// Signups per visitor IP: 5 in 10 minutes. Enforced by createClientAccount
// (./accounts.ts) and registered with Better Auth in src/lib/auth.ts.
export const SIGNUP_LIMIT = { window: 60 * 10, max: 5 };
