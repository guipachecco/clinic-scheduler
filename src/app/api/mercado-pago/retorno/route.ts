import { NextResponse, type NextRequest } from "next/server";

import { logger } from "@/lib/logger";
import { requireAdmin } from "@/modules/auth/session";
import { exchangeCode } from "@/modules/mercado-pago/api";
import {
  mercadoPagoConfig,
  saveConnection,
} from "@/modules/mercado-pago/accounts";

import { OAUTH_COOKIE, readOauthCookie, sameState } from "../oauth-cookie";

const PAGE = "/admin/financeiro/mercado-pago";

// Mercado Pago sends the owner back here with a code (or an error). The code
// is exchanged on the server for the clinic's tokens.
export async function GET(request: NextRequest) {
  const { clinicId, user } = await requireAdmin();
  const config = mercadoPagoConfig();
  if (!config) return new Response("Not found", { status: 404 });

  const back = (result: string) => {
    const response = NextResponse.redirect(
      new URL(`${PAGE}?conexao=${result}`, config.redirectUri),
    );
    response.cookies.delete({ name: OAUTH_COOKIE, path: "/api/mercado-pago" });
    return response;
  };

  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const saved = readOauthCookie(request.cookies.get(OAUTH_COOKIE)?.value);
  if (
    !code ||
    !state ||
    !saved ||
    saved.clinicId !== clinicId ||
    !sameState(saved.state, state)
  ) {
    return back(params.get("error") ? "recusada" : "invalida");
  }

  try {
    const tokens = await exchangeCode({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      code,
      redirectUri: config.redirectUri,
    });
    await saveConnection(clinicId, tokens, user.id);
    return back("ok");
  } catch (error) {
    logger.warn("mercado pago connect failed", { error });
    return back("erro");
  }
}
