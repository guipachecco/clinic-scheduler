import { timingSafeEqual } from "node:crypto";

// The state of one "Conectar Mercado Pago" attempt: "<state>.<clinicId>",
// in an httpOnly cookie that lives 10 minutes (the life of the code).
export const OAUTH_COOKIE = "mp_oauth";

export function oauthCookieOptions(redirectUri: string) {
  return {
    httpOnly: true,
    secure: redirectUri.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/api/mercado-pago",
    maxAge: 600,
  };
}

export function readOauthCookie(
  value: string | undefined,
): { state: string; clinicId: string } | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  return { state: value.slice(0, dot), clinicId: value.slice(dot + 1) };
}

export function sameState(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
