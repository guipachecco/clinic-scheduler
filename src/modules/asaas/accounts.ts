import "server-only";

import { and, eq } from "drizzle-orm";

import { inClinic, type Tx } from "@/db/client";
import { asaasAccounts, auditLogs, clinics, paymentMethods } from "@/db/schema";
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
  createSubaccount,
  getAccountStatus,
  listPixKeys,
  type Fetch,
} from "./api";
import type { ActivationValues } from "./fields";
import { accountReady } from "./rules";

// The Asaas subaccount each clinic gets. The subaccount API key lives
// encrypted in asaas_accounts; the Zemana root key only creates subaccounts.

export const PIX_ONLINE_METHOD = "Pix online";

let cachedKey: Buffer | undefined;
function key(): Buffer {
  cachedKey ??= tokenKey(env.BETTER_AUTH_SECRET, "asaas-api-keys");
  return cachedKey;
}

export function asaasEnabled(): boolean {
  return env.ASAAS_API_KEY !== undefined;
}

export type AccountView = {
  status: "pending" | "approved" | "rejected";
  pixKeyReady: boolean;
  depositEnabled: boolean;
  lastError: string | null;
};

// The clinic's "Pix online" form of payment, created (or turned back on) when
// the subaccount is approved. The deposit payments are recorded with it.
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

export async function activateAccount(
  clinicId: string,
  values: ActivationValues,
  actorUserId: string,
  fetchImpl: Fetch = fetch,
): Promise<{ ok: true } | { ok: false; formError: string }> {
  const rootKey = env.ASAAS_API_KEY;
  if (rootKey === undefined || env.ASAAS_WEBHOOK_TOKEN === undefined) {
    return {
      ok: false,
      formError: "O sinal por Pix ainda não está disponível.",
    };
  }
  if (await getAccountView(clinicId)) {
    return { ok: false, formError: "Os recebimentos já foram ativados." };
  }

  let created: { id: string; walletId: string; apiKey: string };
  try {
    created = await createSubaccount(
      rootKey,
      {
        ...values,
        webhookUrl: new URL(
          "/api/webhooks/asaas",
          env.BETTER_AUTH_URL,
        ).toString(),
        webhookToken: env.ASAAS_WEBHOOK_TOKEN,
        webhookEmail: values.email,
      },
      fetchImpl,
    );
  } catch (error) {
    if (error instanceof AsaasError && error.status === 400) {
      return {
        ok: false,
        formError:
          "O Asaas não aceitou os dados. Confira o CPF/CNPJ, o e-mail e o endereço.",
      };
    }
    return {
      ok: false,
      formError: "O Asaas não respondeu. Tente de novo em instantes.",
    };
  }

  // The key only comes once: save it in the same step the answer arrives.
  try {
    const saved = await inClinic(clinicId, async (tx) => {
      const rows = await tx
        .insert(asaasAccounts)
        .values({
          clinicId,
          accountId: created.id,
          walletId: created.walletId,
          apiKeyEnc: encryptToken(created.apiKey, key()),
          activatedByUserId: actorUserId,
        })
        .onConflictDoNothing({ target: asaasAccounts.clinicId })
        .returning({ clinicId: asaasAccounts.clinicId });
      if (rows.length === 0) return false;
      await tx.insert(auditLogs).values({
        clinicId,
        actorType: "admin",
        actorUserId,
        action: "asaas.activated",
        entityType: "clinic",
        entityId: clinicId,
        changes: { accountId: created.id },
      });
      return true;
    });
    if (!saved) {
      logger.error("asaas: subconta criada duas vezes", {
        clinicId,
        accountId: created.id,
      });
      return { ok: false, formError: "Os recebimentos já foram ativados." };
    }
    return { ok: true };
  } catch {
    // Manual recovery needs the account id (never the key).
    logger.error("asaas: subconta criada mas não gravada", {
      clinicId,
      accountId: created.id,
    });
    return {
      ok: false,
      formError: "Não foi possível salvar. Fale com o suporte da Zemana.",
    };
  }
}

function mapStatus(general: string): AccountView["status"] {
  if (accountReady({ general })) return "approved";
  return general === "REJECTED" ? "rejected" : "pending";
}

// Reads the status at Asaas. Once approved, makes sure the subaccount has an
// active random Pix key, then turns on the "Pix online" payment method.
export async function refreshAccount(
  clinicId: string,
  fetchImpl: Fetch = fetch,
): Promise<AccountView | null> {
  const [row] = await inClinic(clinicId, (tx) =>
    tx.select().from(asaasAccounts).where(eq(asaasAccounts.clinicId, clinicId)),
  );
  if (!row) return null;

  try {
    const apiKey = decryptToken(row.apiKeyEnc, key());
    const status = mapStatus(
      (await getAccountStatus(apiKey, fetchImpl)).general,
    );
    let pixKeyReady = row.pixKeyReady;
    if (status === "approved" && !pixKeyReady) {
      const keys = await listPixKeys(apiKey, fetchImpl);
      if (!keys.some((k) => k.status === "ACTIVE")) {
        await createEvpKey(apiKey, fetchImpl);
      }
      pixKeyReady = true;
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
    };
  } catch (error) {
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

// The subaccount key, only while deposits can be charged: approved, with a
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

// The subaccount key whatever its state, to read or cancel charges already
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

// What the clinic already has, to pre-fill the activation form. Empty where
// the clinic has nothing.
export async function activationDefaults(clinicId: string): Promise<{
  name: string;
  email: string;
  mobilePhone: string;
  address: string;
}> {
  const [row] = await inClinic(clinicId, (tx) =>
    tx
      .select({
        name: clinics.name,
        email: clinics.contactEmail,
        phone: clinics.whatsappPhone,
        address: clinics.address,
      })
      .from(clinics)
      .where(eq(clinics.id, clinicId)),
  );
  return {
    name: row?.name ?? "",
    email: row?.email ?? "",
    mobilePhone: row?.phone ?? "",
    address: row?.address ?? "",
  };
}
