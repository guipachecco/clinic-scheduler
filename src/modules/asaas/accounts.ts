import "server-only";

import { and, eq } from "drizzle-orm";

import { inClinic, type Tx } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { asaasAccounts, auditLogs, paymentMethods } from "@/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  decryptToken,
  encryptToken,
  tokenKey,
} from "@/modules/mercado-pago/crypto";

import {
  AsaasError,
  createEvpKey,
  getAccountStatus,
  getCommercialInfo,
  getWalletId,
  listPixKeys,
  listWebhooks,
  saveWebhook,
  type Fetch,
} from "./api";
import type { ConnectValues } from "./fields";
import { accountReady, baseUrlEnvironment, keyEnvironment } from "./rules";

// The Asaas account of each clinic: the owner pastes the API key of her own
// account. The key lives encrypted in asaas_accounts.

export const PIX_ONLINE_METHOD = "Pix online";

// lastError while an automatic refund waits for the owner's approval in the
// Asaas app. The next successful refresh clears it, like any lastError.
export const REFUND_PENDING_APPROVAL = "refund_pending_approval";

let cachedKey: Buffer | undefined;
function key(): Buffer {
  cachedKey ??= tokenKey(env.BETTER_AUTH_SECRET, "asaas-api-keys");
  return cachedKey;
}

export function asaasEnabled(): boolean {
  return env.ASAAS_WEBHOOK_TOKEN !== undefined;
}

export type AccountView = {
  status: "pending" | "approved" | "rejected" | "disconnected";
  pixKeyReady: boolean;
  depositEnabled: boolean;
  lastError: string | null;
  accountName: string | null;
};

// The clinic's "Pix online" form of payment, created (or turned back on) when
// the account is approved. The deposit payments are recorded with it.
export async function ensurePixOnlineMethod(
  tx: Tx,
  clinicId: string,
): Promise<string> {
  await tx
    .insert(paymentMethods)
    .values({ clinicId, name: PIX_ONLINE_METHOD, sortOrder: 51 })
    .onConflictDoNothing({
      target: [paymentMethods.clinicId, paymentMethods.name],
    });
  const [method] = await tx
    .update(paymentMethods)
    .set({ isActive: true })
    .where(
      and(
        eq(paymentMethods.clinicId, clinicId),
        eq(paymentMethods.name, PIX_ONLINE_METHOD),
      ),
    )
    .returning({ id: paymentMethods.id });
  return method!.id;
}

const ACTIVE_FIELDS = {
  status: asaasAccounts.status,
  pixKeyReady: asaasAccounts.pixKeyReady,
  depositEnabled: asaasAccounts.depositEnabled,
  lastError: asaasAccounts.lastError,
  accountName: asaasAccounts.accountName,
};

export async function getAccountView(
  clinicId: string,
): Promise<AccountView | null> {
  const [row] = await inClinic(clinicId, (tx) =>
    tx
      .select(ACTIVE_FIELDS)
      .from(asaasAccounts)
      .where(eq(asaasAccounts.clinicId, clinicId)),
  );
  return row ?? null;
}

const WRONG_ENV_PRODUCTION =
  "Essa chave é do ambiente de testes do Asaas. Gere uma chave na sua conta de verdade.";
const WRONG_ENV_SANDBOX =
  "Essa chave é de produção, mas a Zemana está no ambiente de testes.";
const REFUSED_KEY =
  "O Asaas não aceitou essa chave. Gere uma nova e cole de novo.";
const NO_ANSWER = "O Asaas não respondeu. Tente de novo em instantes.";
const OTHER_ACCOUNT =
  "Essa chave é de outra conta do Asaas. Use uma chave da conta já conectada.";
const OTHER_CLINIC = "Essa conta do Asaas já está conectada em outra clínica.";

type Outcome = { ok: true } | { ok: false; formError: string };

// The owner pastes the API key of her own Asaas account: first connection
// and key replacement alike (a clinic that already has a row is replacing).
// The key is checked at Asaas, the Zemana webhook is registered in her account
// and the key is saved encrypted. It never reaches a log.
export async function connectAccount(
  clinicId: string,
  values: ConnectValues,
  actorUserId: string,
  fetchImpl: Fetch = fetch,
): Promise<Outcome> {
  const webhookToken = env.ASAAS_WEBHOOK_TOKEN;
  if (webhookToken === undefined) {
    return {
      ok: false,
      formError: "O sinal por Pix ainda não está disponível.",
    };
  }
  const apiKey = values.apiKey.trim();

  const keyEnv = keyEnvironment(apiKey);
  const zemanaEnv = baseUrlEnvironment(env.ASAAS_BASE_URL);
  if (keyEnv !== "unknown" && keyEnv !== zemanaEnv) {
    return {
      ok: false,
      formError:
        keyEnv === "sandbox" ? WRONG_ENV_PRODUCTION : WRONG_ENV_SANDBOX,
    };
  }

  let walletId: string;
  let info: { name: string; email: string };
  try {
    walletId = await getWalletId(apiKey, fetchImpl);
    info = await getCommercialInfo(apiKey, fetchImpl);
  } catch (error) {
    logAsaasFailure("asaas: chave não aceita", clinicId, error);
    return {
      ok: false,
      formError:
        error instanceof AsaasError && error.status === 401
          ? REFUSED_KEY
          : NO_ANSWER,
    };
  }

  const [existing] = await inClinic(clinicId, (tx) =>
    tx
      .select({
        walletId: asaasAccounts.walletId,
        status: asaasAccounts.status,
        pixKeyReady: asaasAccounts.pixKeyReady,
      })
      .from(asaasAccounts)
      .where(eq(asaasAccounts.clinicId, clinicId)),
  );
  if (existing && existing.walletId !== walletId) {
    return { ok: false, formError: OTHER_ACCOUNT };
  }

  // The Zemana webhook: reuse (and re-enable) the one already there, never
  // touch the owner's others.
  try {
    const webhookUrl = new URL("/api/webhooks/asaas", env.BETTER_AUTH_URL).href;
    const ours = (await listWebhooks(apiKey, fetchImpl)).find((hook) =>
      sameUrl(hook.url, webhookUrl),
    );
    await saveWebhook(
      apiKey,
      {
        id: ours?.id,
        url: webhookUrl,
        email: info.email,
        authToken: webhookToken,
      },
      fetchImpl,
    );
  } catch (error) {
    logAsaasFailure("asaas: webhook não registrado", clinicId, error);
    return { ok: false, formError: NO_ANSWER };
  }

  try {
    await inClinic(clinicId, async (tx) => {
      const fields = {
        apiKeyEnc: encryptToken(apiKey, key()),
        walletId,
        accountName: info.name,
        // Same account, new key: keep what is known (a failed follow-up
        // refresh must not downgrade an approved account). A disconnected
        // account starts over as pending.
        status:
          existing && existing.status !== "disconnected"
            ? existing.status
            : ("pending" as const),
        pixKeyReady: existing ? existing.pixKeyReady : false,
        lastError: null,
        activatedByUserId: actorUserId,
      };
      if (existing) {
        await tx
          .update(asaasAccounts)
          .set(fields)
          .where(eq(asaasAccounts.clinicId, clinicId));
      } else {
        await tx.insert(asaasAccounts).values({ clinicId, ...fields });
      }
      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: existing ? "asaas.key_replaced" : "asaas.connected",
        entityType: "clinic",
        entityId: clinicId,
        changes: { walletId },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error, "asaas_accounts_wallet_unique")) {
      return { ok: false, formError: OTHER_CLINIC };
    }
    logger.error("asaas: conta não gravada", { clinicId });
    return {
      ok: false,
      formError: "Não foi possível salvar. Fale com o suporte da Zemana.",
    };
  }

  // Reads the approval and the Pix key right away: a reconnected approved
  // account is back to approved in this same call.
  // The connection is already saved: a failure here must not turn it into an
  // error (the next refresh reads the status again).
  try {
    await refreshAccount(clinicId, fetchImpl);
  } catch (error) {
    logAsaasFailure("asaas: status não lido após conectar", clinicId, error);
  }
  return { ok: true };
}

// Compares URLs ignoring host case and a trailing slash (Asaas may store the
// address a little differently from how it was sent).
function sameUrl(a: string, b: string): boolean {
  const normalize = (value: string): string | null => {
    try {
      const url = new URL(value);
      return `${url.protocol}//${url.host.toLowerCase()}${url.pathname.replace(/\/+$/, "")}${url.search}`;
    } catch {
      return null;
    }
  };
  const left = normalize(a);
  return left !== null && left === normalize(b);
}

function logAsaasFailure(message: string, clinicId: string, error: unknown) {
  logger.warn(message, {
    clinicId,
    status: error instanceof AsaasError ? error.status : undefined,
    asaasCodes: error instanceof AsaasError ? error.codes : undefined,
  });
}

// The key stopped working at Asaas (revoked or replaced there). Idempotent.
// `failedKey` is the (decrypted) key that Asaas refused: the account is only
// disconnected while it still holds that very key, so a late 401 for an old
// key never undoes a replacement the owner just made. The stored value is
// encrypted with a random IV, so the match is made on the decrypted key and
// the update is pinned to the exact row read (apiKeyEnc), which keeps it
// atomic against a replacement landing in between. Returns true only when it
// updated the row.
export async function markDisconnected(
  clinicId: string,
  failedKey?: string,
): Promise<boolean> {
  return inClinic(clinicId, async (tx) => {
    let stillThatKey: string | undefined;
    if (failedKey !== undefined) {
      const [current] = await tx
        .select({ apiKeyEnc: asaasAccounts.apiKeyEnc })
        .from(asaasAccounts)
        .where(eq(asaasAccounts.clinicId, clinicId));
      if (!current || decryptToken(current.apiKeyEnc, key()) !== failedKey) {
        return false;
      }
      stillThatKey = current.apiKeyEnc;
    }
    const changed = await tx
      .update(asaasAccounts)
      .set({ status: "disconnected", lastError: "invalid_key" })
      .where(
        and(
          eq(asaasAccounts.clinicId, clinicId),
          stillThatKey === undefined
            ? undefined
            : eq(asaasAccounts.apiKeyEnc, stillThatKey),
        ),
      )
      .returning({ clinicId: asaasAccounts.clinicId });
    return changed.length > 0;
  });
}

// Pix key statuses that will never become ACTIVE again.
const GONE_KEY_STATUSES = new Set([
  "DELETED",
  "ERROR",
  "AWAITING_DELETION",
  "AWAITING_ACCOUNT_DELETION",
]);

function mapStatus(general: string): AccountView["status"] {
  if (accountReady({ general })) return "approved";
  return general === "REJECTED" ? "rejected" : "pending";
}

// Reads the status at Asaas. Once approved, makes sure the account has an
// active random Pix key, then turns on the "Pix online" payment method.
export async function refreshAccount(
  clinicId: string,
  fetchImpl: Fetch = fetch,
): Promise<AccountView | null> {
  const [row] = await inClinic(clinicId, (tx) =>
    tx.select().from(asaasAccounts).where(eq(asaasAccounts.clinicId, clinicId)),
  );
  if (!row) return null;
  // A disconnected account stays so until the owner pastes a new key.
  if (row.status === "disconnected") {
    return {
      status: "disconnected",
      pixKeyReady: row.pixKeyReady,
      depositEnabled: row.depositEnabled,
      lastError: row.lastError,
      accountName: row.accountName,
    };
  }

  let apiKey: string | undefined;
  try {
    apiKey = decryptToken(row.apiKeyEnc, key());
    const status = mapStatus(
      (await getAccountStatus(apiKey, fetchImpl)).general,
    );
    let pixKeyReady = row.pixKeyReady;
    if (status === "approved" && !pixKeyReady) {
      // Only an ACTIVE key receives Pix. A new key starts as
      // AWAITING_ACTIVATION and Asaas activates it later, so a key on its way
      // is waited for, never duplicated (Asaas also rate-limits creation).
      const keys = await listPixKeys(apiKey, fetchImpl);
      if (keys.some((k) => k.status === "ACTIVE")) {
        pixKeyReady = true;
      } else if (!keys.some((k) => !GONE_KEY_STATUSES.has(k.status))) {
        const created = await createEvpKey(apiKey, fetchImpl);
        pixKeyReady = created.status === "ACTIVE";
      }
    }
    await inClinic(clinicId, async (tx) => {
      await tx
        .update(asaasAccounts)
        .set({ status, pixKeyReady, lastError: null })
        .where(eq(asaasAccounts.clinicId, clinicId));
      if (status === "approved" && pixKeyReady) {
        await ensurePixOnlineMethod(tx, clinicId);
      }
    });
    return {
      status,
      pixKeyReady,
      depositEnabled: row.depositEnabled,
      lastError: null,
      accountName: row.accountName,
    };
  } catch (error) {
    if (error instanceof AsaasError && error.status === 401) {
      logAsaasFailure("asaas: chave desconectada", clinicId, error);
      if (!(await markDisconnected(clinicId, apiKey))) {
        // The key was replaced meanwhile: the account is as the owner left it.
        const [current] = await inClinic(clinicId, (tx) =>
          tx
            .select()
            .from(asaasAccounts)
            .where(eq(asaasAccounts.clinicId, clinicId)),
        );
        const now = current ?? row;
        return {
          status: now.status,
          pixKeyReady: now.pixKeyReady,
          depositEnabled: now.depositEnabled,
          lastError: now.lastError,
          accountName: now.accountName,
        };
      }
      return {
        status: "disconnected",
        pixKeyReady: row.pixKeyReady,
        depositEnabled: row.depositEnabled,
        lastError: "invalid_key",
        accountName: row.accountName,
      };
    }
    const code =
      error instanceof AsaasError
        ? (error.codes[0] ?? `http_${error.status}`)
        : "refresh_failed";
    await markAccountError(clinicId, code);
    return {
      status: row.status,
      pixKeyReady: row.pixKeyReady,
      depositEnabled: row.depositEnabled,
      lastError: code,
      accountName: row.accountName,
    };
  }
}

export async function setDepositEnabled(
  clinicId: string,
  enabled: boolean,
  actorUserId: string,
): Promise<void> {
  await inClinic(clinicId, async (tx) => {
    const changed = await tx
      .update(asaasAccounts)
      .set({ depositEnabled: enabled })
      .where(eq(asaasAccounts.clinicId, clinicId))
      .returning({ clinicId: asaasAccounts.clinicId });
    if (changed.length === 0) return;
    await tx.insert(auditLogs).values({
      clinicId,
      actorType: "admin",
      actorUserId,
      action: enabled ? "asaas.deposit_enabled" : "asaas.deposit_disabled",
      entityType: "clinic",
      entityId: clinicId,
    });
  });
}

// The owner's key, only while deposits can be charged: approved, with a
// Pix key, and turned on by the clinic.
export async function depositApiKey(clinicId: string): Promise<string | null> {
  const [row] = await inClinic(clinicId, (tx) =>
    tx
      .select({
        apiKeyEnc: asaasAccounts.apiKeyEnc,
        status: asaasAccounts.status,
        pixKeyReady: asaasAccounts.pixKeyReady,
        depositEnabled: asaasAccounts.depositEnabled,
      })
      .from(asaasAccounts)
      .where(eq(asaasAccounts.clinicId, clinicId)),
  );
  if (!row) return null;
  if (row.status !== "approved" || !row.pixKeyReady || !row.depositEnabled) {
    return null;
  }
  return decryptToken(row.apiKeyEnc, key());
}

// The owner's key whatever its state, to read or cancel charges already
// made (a QR still showing, a hold that expired after the deposit was turned
// off). Never for new charges: those use depositApiKey.
export async function accountApiKey(clinicId: string): Promise<string | null> {
  const [row] = await inClinic(clinicId, (tx) =>
    tx
      .select({ apiKeyEnc: asaasAccounts.apiKeyEnc })
      .from(asaasAccounts)
      .where(eq(asaasAccounts.clinicId, clinicId)),
  );
  return row ? decryptToken(row.apiKeyEnc, key()) : null;
}

// A short Asaas code of the last failure; null clears it.
export async function markAccountError(
  clinicId: string,
  code: string | null,
): Promise<void> {
  await inClinic(clinicId, (tx) =>
    tx
      .update(asaasAccounts)
      .set({ lastError: code })
      .where(eq(asaasAccounts.clinicId, clinicId)),
  );
}
