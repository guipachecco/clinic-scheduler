import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, endPools } from "@/db/owner";
import { asaasAccounts, paymentMethods, users } from "@/db/schema";
import { env } from "@/lib/env";
import {
  activateAccount,
  depositApiKey,
  markAccountError,
  refreshAccount,
  setDepositEnabled,
} from "@/modules/asaas/accounts";
import type { ActivationValues } from "@/modules/asaas/fields";
import { decryptToken, tokenKey } from "@/modules/mercado-pago/crypto";

import { CLINIC } from "../helpers/clinic";

// The clinic's Asaas subaccount, with a fake Asaas: nothing leaves the
// machine. Every record is fictitious.

const VALUES: ActivationValues = {
  name: "Clínica Fictícia Ltda",
  email: "dona@example.com",
  cpfCnpj: "52998224725",
  birthDate: "1990-05-20",
  mobilePhone: "11999990000",
  incomeValue: 5000,
  postalCode: "01310100",
  address: "Avenida Fictícia",
  addressNumber: "100",
  province: "Centro",
};

type Call = { method: string; path: string; body: unknown; key?: string };

function fakeAsaas(
  general = "PENDING",
  keys: { id: string; status: string }[] = [],
) {
  const calls: Call[] = [];
  const state = { general, keys: [...keys] };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const key = new Headers(init?.headers).get("access_token") ?? undefined;
    calls.push({ method, path: url.pathname, body, key });
    if (url.pathname.endsWith("/accounts") && method === "POST") {
      return json({ id: "acc-1", walletId: "wal-1", apiKey: "sub-key" });
    }
    if (url.pathname.endsWith("/myAccount/status")) {
      return json({
        general: state.general,
        documentation: "PENDING",
        commercialInfo: "APPROVED",
        bankAccountInfo: "APPROVED",
      });
    }
    if (url.pathname.endsWith("/pix/addressKeys") && method === "GET") {
      return json({ data: state.keys });
    }
    if (url.pathname.endsWith("/pix/addressKeys") && method === "POST") {
      state.keys.push({ id: "key-1", status: "ACTIVE" });
      return json({ id: "key-1", status: "ACTIVE" });
    }
    return json({ errors: [{ code: "not_found" }] }, 404);
  }) as typeof fetch;
  return { fetchImpl, calls, state };
}

let actor: string;

beforeEach(async () => {
  await db.delete(asaasAccounts);
  await db.delete(paymentMethods).where(eq(paymentMethods.name, "Pix online"));
  await db.delete(users).where(eq(users.email, "admin-asaas@example.com"));
  const [user] = await db
    .insert(users)
    .values({
      name: "Admin",
      email: "admin-asaas@example.com",
      role: "admin",
      clinicId: CLINIC,
    })
    .returning();
  actor = user!.id;
});

afterAll(endPools);

async function row() {
  const [r] = await db
    .select()
    .from(asaasAccounts)
    .where(eq(asaasAccounts.clinicId, CLINIC));
  return r;
}

async function pixOnline() {
  return db
    .select()
    .from(paymentMethods)
    .where(eq(paymentMethods.name, "Pix online"));
}

describe("activateAccount", () => {
  it("activation stores the encrypted key, never the plain one", async () => {
    const asaas = fakeAsaas();
    const result = await activateAccount(
      CLINIC,
      VALUES,
      actor,
      asaas.fetchImpl,
    );
    expect(result).toEqual({ ok: true });
    const saved = (await row())!;
    expect(saved.accountId).toBe("acc-1");
    expect(saved.walletId).toBe("wal-1");
    expect(saved.status).toBe("pending");
    expect(saved.apiKeyEnc).not.toBe("sub-key");
    expect(
      decryptToken(
        saved.apiKeyEnc,
        tokenKey(env.BETTER_AUTH_SECRET, "asaas-api-keys"),
      ),
    ).toBe("sub-key");
    const create = asaas.calls.find((c) => c.method === "POST")!;
    expect(create.key).toBe(env.ASAAS_API_KEY);
    expect(JSON.stringify(create.body)).toContain("/api/webhooks/asaas");
  });

  it("activation twice is refused", async () => {
    const asaas = fakeAsaas();
    await activateAccount(CLINIC, VALUES, actor, asaas.fetchImpl);
    const again = await activateAccount(CLINIC, VALUES, actor, asaas.fetchImpl);
    expect(again).toEqual({
      ok: false,
      formError: "Os recebimentos já foram ativados.",
    });
    expect(asaas.calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });
});

describe("refreshAccount", () => {
  it("no Pix online method before approval", async () => {
    const asaas = fakeAsaas("PENDING");
    await activateAccount(CLINIC, VALUES, actor, asaas.fetchImpl);
    const view = await refreshAccount(CLINIC, asaas.fetchImpl);
    expect(view).toMatchObject({ status: "pending", pixKeyReady: false });
    expect(await pixOnline()).toHaveLength(0);
    expect(asaas.calls.some((c) => c.path.endsWith("/pix/addressKeys"))).toBe(
      false,
    );
  });

  it("refresh creates the EVP key once approved and adds Pix online", async () => {
    const asaas = fakeAsaas("PENDING");
    await activateAccount(CLINIC, VALUES, actor, asaas.fetchImpl);
    asaas.state.general = "APPROVED";
    const view = await refreshAccount(CLINIC, asaas.fetchImpl);
    expect(view).toMatchObject({ status: "approved", pixKeyReady: true });
    expect(await pixOnline()).toHaveLength(1);
    // Again: the key is not created twice.
    await refreshAccount(CLINIC, asaas.fetchImpl);
    const created = asaas.calls.filter(
      (c) => c.method === "POST" && c.path.endsWith("/pix/addressKeys"),
    );
    expect(created).toHaveLength(1);
    expect(created[0]!.key).toBe("sub-key");
  });

  it("keeps an existing active key instead of creating one", async () => {
    const asaas = fakeAsaas("APPROVED", [{ id: "k", status: "ACTIVE" }]);
    await activateAccount(CLINIC, VALUES, actor, asaas.fetchImpl);
    await refreshAccount(CLINIC, asaas.fetchImpl);
    expect(
      asaas.calls.some(
        (c) => c.method === "POST" && c.path.endsWith("/pix/addressKeys"),
      ),
    ).toBe(false);
    expect((await row())!.pixKeyReady).toBe(true);
  });

  it("maps a rejected account and null without a subaccount", async () => {
    expect(await refreshAccount(CLINIC, fakeAsaas().fetchImpl)).toBeNull();
    const asaas = fakeAsaas("REJECTED");
    await activateAccount(CLINIC, VALUES, actor, asaas.fetchImpl);
    expect(await refreshAccount(CLINIC, asaas.fetchImpl)).toMatchObject({
      status: "rejected",
    });
  });
});

describe("depositApiKey", () => {
  it("is null when disabled, pending or without Pix key", async () => {
    const asaas = fakeAsaas("PENDING");
    expect(await depositApiKey(CLINIC)).toBeNull();
    await activateAccount(CLINIC, VALUES, actor, asaas.fetchImpl);
    expect(await depositApiKey(CLINIC)).toBeNull();
    asaas.state.general = "APPROVED";
    await refreshAccount(CLINIC, asaas.fetchImpl);
    expect(await depositApiKey(CLINIC)).toBe("sub-key");
    await setDepositEnabled(CLINIC, false, actor);
    expect(await depositApiKey(CLINIC)).toBeNull();
    await setDepositEnabled(CLINIC, true, actor);
    expect(await depositApiKey(CLINIC)).toBe("sub-key");
    await db
      .update(asaasAccounts)
      .set({ pixKeyReady: false })
      .where(eq(asaasAccounts.clinicId, CLINIC));
    expect(await depositApiKey(CLINIC)).toBeNull();
  });
});

describe("markAccountError", () => {
  it("records a code and clears it with null", async () => {
    await activateAccount(CLINIC, VALUES, actor, fakeAsaas().fetchImpl);
    await markAccountError(CLINIC, "limit_exceeded");
    expect((await row())!.lastError).toBe("limit_exceeded");
    await markAccountError(CLINIC, null);
    expect((await row())!.lastError).toBeNull();
  });
});
