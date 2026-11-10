import "server-only";

import { and, eq } from "drizzle-orm";

import { inClinic, type Tx } from "@/db/client";
import { auditLogs, mercadoPagoAccounts, paymentMethods } from "@/db/schema";
import { env } from "@/lib/env";

import { refreshTokens, type Fetch, type OAuthTokens } from "./api";
import { decryptToken, encryptToken, tokenKey } from "./crypto";

// The Mercado Pago account each clinic connects (OAuth). Tokens live
// encrypted in mercado_pago_accounts and are renewed when they get close to
// expiring (they last 180 days; each renewal brings a new refresh token).

export const MERCADO_PAGO_METHOD = "Mercado Pago";
const RENEW_BEFORE_MS = 30 * 24 * 3600 * 1000;

let cachedKey: Buffer | undefined;
function key(): Buffer {
  cachedKey ??= tokenKey(env.BETTER_AUTH_SECRET);
  return cachedKey;
}

export type MercadoPagoConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

// Null when the Zemana has no Mercado Pago application configured.
export function mercadoPagoConfig(): MercadoPagoConfig | null {
  if (!env.MP_CLIENT_ID || !env.MP_CLIENT_SECRET) return null;
  return {
    clientId: env.MP_CLIENT_ID,
    clientSecret: env.MP_CLIENT_SECRET,
    redirectUri: new URL(
      "/api/mercado-pago/retorno",
      env.BETTER_AUTH_URL,
    ).toString(),
  };
}

export type Connection = {
  mpUserId: string;
  liveMode: boolean;
  connectedAt: Date;
  expiresAt: Date;
};

export async function getConnection(
  clinicId: string,
): Promise<Connection | null> {
  const [row] = await inClinic(clinicId, (tx) =>
    tx
      .select({
        mpUserId: mercadoPagoAccounts.mpUserId,
        liveMode: mercadoPagoAccounts.liveMode,
        connectedAt: mercadoPagoAccounts.connectedAt,
        expiresAt: mercadoPagoAccounts.expiresAt,
      })
      .from(mercadoPagoAccounts)
      .where(eq(mercadoPagoAccounts.clinicId, clinicId)),
  );
  return row ?? null;
}

// The clinic's "Mercado Pago" form of payment, created (or turned back on)
// when needed. Payments that come from a link are recorded with it.
export async function ensureMercadoPagoMethod(
  tx: Tx,
  clinicId: string,
): Promise<string> {
  await tx
    .insert(paymentMethods)
    .values({ clinicId, name: MERCADO_PAGO_METHOD, sortOrder: 50 })
    .onConflictDoNothing({
      target: [paymentMethods.clinicId, paymentMethods.name],
    });
  const [method] = await tx
    .update(paymentMethods)
    .set({ isActive: true })
    .where(
      and(
        eq(paymentMethods.clinicId, clinicId),
        eq(paymentMethods.name, MERCADO_PAGO_METHOD),
      ),
    )
    .returning({ id: paymentMethods.id });
  return method!.id;
}

export async function saveConnection(
  clinicId: string,
  tokens: OAuthTokens,
  actorUserId: string,
): Promise<void> {
  const sealed = {
    mpUserId: tokens.userId,
    accessTokenEnc: encryptToken(tokens.accessToken, key()),
    refreshTokenEnc: encryptToken(tokens.refreshToken, key()),
    publicKey: tokens.publicKey,
    liveMode: tokens.liveMode,
    expiresAt: tokens.expiresAt,
    connectedByUserId: actorUserId,
  };
  await inClinic(clinicId, async (tx) => {
    await tx
      .insert(mercadoPagoAccounts)
      .values({ clinicId, ...sealed })
      .onConflictDoUpdate({
        target: mercadoPagoAccounts.clinicId,
        set: { ...sealed, connectedAt: new Date() },
      });
    await ensureMercadoPagoMethod(tx, clinicId);
    await tx.insert(auditLogs).values({
      clinicId,
      actorType: "admin",
      actorUserId,
      action: "mercado_pago.connected",
      entityType: "clinic",
      entityId: clinicId,
      changes: { liveMode: tokens.liveMode },
    });
  });
}

// Links already sent keep working at Mercado Pago, but their payments no
// longer reach the Zemana until the clinic connects again.
export async function disconnect(
  clinicId: string,
  actorUserId: string,
): Promise<void> {
  await inClinic(clinicId, async (tx) => {
    const removed = await tx
      .delete(mercadoPagoAccounts)
      .where(eq(mercadoPagoAccounts.clinicId, clinicId))
      .returning({ clinicId: mercadoPagoAccounts.clinicId });
    if (removed.length === 0) return;
    await tx.insert(auditLogs).values({
      clinicId,
      actorType: "admin",
      actorUserId,
      action: "mercado_pago.disconnected",
      entityType: "clinic",
      entityId: clinicId,
    });
  });
}

export class NotConnectedError extends Error {
  constructor() {
    super("Conecte o Mercado Pago da clínica antes.");
    this.name = "NotConnectedError";
  }
}

// The clinic's access token, renewed first when it expires within 30 days.
// The row is locked while renewing, so two requests never spend the same
// refresh token.
export async function accessTokenFor(
  clinicId: string,
  fetchImpl: Fetch = fetch,
  now: Date = new Date(),
): Promise<string> {
  return inClinic(clinicId, async (tx) => {
    const [row] = await tx
      .select()
      .from(mercadoPagoAccounts)
      .where(eq(mercadoPagoAccounts.clinicId, clinicId))
      .for("update");
    if (!row) throw new NotConnectedError();
    const current = decryptToken(row.accessTokenEnc, key());
    if (row.expiresAt.getTime() - now.getTime() > RENEW_BEFORE_MS) {
      return current;
    }
    const config = mercadoPagoConfig();
    try {
      if (!config) throw new NotConnectedError();
      const tokens = await refreshTokens(
        {
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          refreshToken: decryptToken(row.refreshTokenEnc, key()),
        },
        fetchImpl,
        now,
      );
      await tx
        .update(mercadoPagoAccounts)
        .set({
          accessTokenEnc: encryptToken(tokens.accessToken, key()),
          refreshTokenEnc: encryptToken(tokens.refreshToken, key()),
          publicKey: tokens.publicKey ?? row.publicKey,
          expiresAt: tokens.expiresAt,
        })
        .where(eq(mercadoPagoAccounts.clinicId, clinicId));
      return tokens.accessToken;
    } catch (error) {
      // Still valid: use it and try renewing next time.
      if (row.expiresAt > now) return current;
      throw error instanceof NotConnectedError
        ? error
        : new NotConnectedError();
    }
  });
}
