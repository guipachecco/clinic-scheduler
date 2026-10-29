import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { buildContentSecurityPolicy } from "@/lib/csp";

// Panel pages that need a session. The login pages stay public.
function isProtectedAdminPath(pathname: string) {
  if (pathname === "/admin/entrar" || pathname.startsWith("/admin/entrar/")) {
    return false;
  }
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === "development",
    upgradeInsecureRequests: request.nextUrl.protocol === "https:",
  });

  // Fast path only: it checks that a session cookie exists, not that it is
  // valid. Every panel page and action verifies the session on the server
  // (src/modules/auth/session.ts).
  if (
    isProtectedAdminPath(request.nextUrl.pathname) &&
    !getSessionCookie(request)
  ) {
    const response = NextResponse.redirect(
      new URL("/admin/entrar", request.url),
    );
    response.headers.set("Content-Security-Policy", contentSecurityPolicy);
    return response;
  }

  // Next.js reads the nonce from the request's CSP header and adds it to its scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
