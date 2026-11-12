import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { moduleActive, requireAdmin } from "@/modules/auth/session";
import { authorizationUrl } from "@/modules/mercado-pago/api";
import { mercadoPagoConfig } from "@/modules/mercado-pago/accounts";

import { OAUTH_COOKIE, oauthCookieOptions } from "../oauth-cookie";

// "Conectar Mercado Pago": sends the owner to Mercado Pago to authorize the
// Zemana. The state ties the answer to this browser and this clinic. Closed
// while the clinic has the finance module off; the webhook and the OAuth
// return stay open, so payments already under way are not lost.
export async function GET() {
  const session = await requireAdmin();
  if (!moduleActive(session, "finance")) {
    return new Response("Not found", { status: 404 });
  }
  const { clinicId } = session;
  const config = mercadoPagoConfig();
  if (!config) return new Response("Not found", { status: 404 });

  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(
    authorizationUrl({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      state,
    }),
  );
  response.cookies.set(
    OAUTH_COOKIE,
    `${state}.${clinicId}`,
    oauthCookieOptions(config.redirectUri),
  );
  return response;
}
