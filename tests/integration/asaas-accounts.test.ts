import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db, endPools } from "@/db/owner";
import { asaasAccounts, auditLogs, paymentMethods, users } from "@/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  connectAccount,
  depositApiKey,
  markDisconnected,
  markAccountError,
  refreshAccount,
  setDepositEnabled,
} from "@/modules/asaas/accounts";
import { decryptToken, tokenKey } from "@/modules/mercado-pago/crypto";

import { CLINIC, otherClinic } from "../helpers/clinic";

// The clinic's own Asaas account, with a fake Asaas: nothing leaves the
// machine. Every record is fictitious.

const KEY = "$aact_hmlg_abc";
const NEW_KEY = "$aact_hmlg_nova";
const ZEMANA_URL = new URL("/api/webhooks/asaas", env.BETTER_AUTH_URL).href;

const WRONG_ENV =
  "Essa chave é de produção, mas a Zemana está no ambiente de testes.";
const REFUSED = "O Asaas não aceitou essa chave. Gere uma nova e cole de novo.";
const OTHER_ACCOUNT =
  "Essa chave é de outra conta do Asaas. Use uma chave da conta já conectada.";
const OTHER_CLINIC = "Essa conta do Asaas já está conectada em outra clínica.";

type Call = { method: string; path: string; body: unknown; key?: string };
type Hook = { id: string; url: string; interrupted?: boolean };

function fakeAsaas(
  general = "PENDING",
  keys: { id: string; status: string }[] = [],
  hooks: Hook[] = [],
) {
  const calls: Call[] = [];
  const state = {
    general,
    keys: [...keys],
    hooks: [...hooks],
    wallet: "wal-1",
    name: "Clínica Fictícia Ltda",
    revoked: new Set<string>(["revogada"]),
  };
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
    if (key === undefined || state.revoked.has(key)) {
      return json({ errors: [{ code: "invalid_access_token" }] }, 401);
    }
    if (url.pathname.endsWith("/wallets")) {
      return json({ data: [{ id: state.wallet }] });
    }
    if (url.pathname.endsWith("/myAccount/commercialInfo")) {
      return json({ name: state.name, email: "dona@example.com" });
    }
    if (url.pathname.endsWith("/myAccount/status")) {
      return json({
        general: state.general,
        documentation: "PENDING",
        commercialInfo: "APPROVED",
        bankAccountInfo: "APPROVED",
      });
    }
    if (url.pathname.endsWith("/webhooks") && method === "GET") {
      return json({ data: state.hooks });
    }
    if (url.pathname.endsWith("/webhooks") && method === "POST") {
      return json({ id: "wh-new" });
    }
    if (url.pathname.includes("/webhooks/") && method === "PUT") {
      return json({ id: url.pathname.split("/").pop() });
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

const connect = (fetchImpl: typeof fetch, apiKey = KEY, clinic = CLINIC) =>
  connectAccount(clinic, { apiKey }, actor, fetchImpl);

beforeEach(async () => {
  await db.delete(asaasAccounts);
  await db.delete(paymentMethods).where(eq(paymentMethods.name, "Pix online"));
  await db.delete(auditLogs).where(eq(auditLogs.action, "asaas.connected"));
  await db.delete(auditLogs).where(eq(auditLogs.action, "asaas.key_replaced"));
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

function plainKey(enc: string) {
  return decryptToken(enc, tokenKey(env.BETTER_AUTH_SECRET, "asaas-api-keys"));
}

describe("connectAccount", () => {
  it("connect stores the encrypted key, the wallet and the account name", async () => {
    const asaas = fakeAsaas();
    expect(await connect(asaas.fetchImpl)).toEqual({ ok: true });
    const saved = (await row())!;
    expect(saved.walletId).toBe("wal-1");
    expect(saved.accountName).toBe("Clínica Fictícia Ltda");
    expect(saved.accountId).toBeNull();
    expect(saved.status).toBe("pending");
    expect(plainKey(saved.apiKeyEnc)).toBe(KEY);
    expect(JSON.stringify(saved)).not.toContain(KEY);
    const [log] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "asaas.connected"));
    expect(log!.changes).toEqual({ walletId: "wal-1" });
    expect(JSON.stringify(log)).not.toContain(KEY);
  });

  it("trims the pasted key", async () => {
    const asaas = fakeAsaas();
    await connect(asaas.fetchImpl, " $aact_hmlg_abc \n");
    expect(plainKey((await row())!.apiKeyEnc)).toBe(KEY);
  });

  it("refuses a production key in the sandbox without calling Asaas", async () => {
    const asaas = fakeAsaas();
    expect(await connect(asaas.fetchImpl, "$aact_prod_x")).toEqual({
      ok: false,
      formError: WRONG_ENV,
    });
    expect(asaas.calls).toHaveLength(0);
    expect(await row()).toBeUndefined();
  });

  it("a refused key shows the refused text", async () => {
    const asaas = fakeAsaas();
    expect(await connect(asaas.fetchImpl, "revogada")).toEqual({
      ok: false,
      formError: REFUSED,
    });
    expect(await row()).toBeUndefined();
  });

  it("creates the Zemana webhook with the token", async () => {
    const asaas = fakeAsaas();
    await connect(asaas.fetchImpl);
    const posts = asaas.calls.filter(
      (c) => c.method === "POST" && c.path.endsWith("/webhooks"),
    );
    expect(posts).toHaveLength(1);
    expect(posts[0]!.body).toMatchObject({
      name: "Zemana",
      url: ZEMANA_URL,
      authToken: env.ASAAS_WEBHOOK_TOKEN,
      email: "dona@example.com",
      enabled: true,
      interrupted: false,
    });
  });

  it("replacing the key updates the existing webhook, even a paused one", async () => {
    const asaas = fakeAsaas(
      "PENDING",
      [],
      [
        { id: "wh-1", url: ZEMANA_URL, interrupted: true },
        { id: "wh-2", url: "https://outro.example" },
      ],
    );
    await connect(asaas.fetchImpl);
    asaas.calls.length = 0;
    expect(await connect(asaas.fetchImpl, NEW_KEY)).toEqual({ ok: true });
    const writes = asaas.calls.filter(
      (c) => c.method !== "GET" && c.path.includes("/webhooks"),
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ method: "PUT" });
    expect(writes[0]!.path.endsWith("/webhooks/wh-1")).toBe(true);
    expect(writes[0]!.body).toMatchObject({ interrupted: false });
    expect(plainKey((await row())!.apiKeyEnc)).toBe(NEW_KEY);
    expect(
      await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.action, "asaas.key_replaced")),
    ).toHaveLength(1);
  });

  it("finds the Zemana webhook whose url has a trailing slash or other host case", async () => {
    const asaas = fakeAsaas(
      "PENDING",
      [],
      [
        {
          id: "wh-1",
          url: `${ZEMANA_URL.toUpperCase().replace("/API/WEBHOOKS/ASAAS", "/api/webhooks/asaas")}/`,
        },
      ],
    );
    expect(await connect(asaas.fetchImpl)).toEqual({ ok: true });
    const writes = asaas.calls.filter(
      (c) => c.method !== "GET" && c.path.includes("/webhooks"),
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ method: "PUT" });
    expect(writes[0]!.path.endsWith("/webhooks/wh-1")).toBe(true);
  });

  it("a failure reading the status after saving still returns ok", async () => {
    const asaas = fakeAsaas("APPROVED");
    const failing = (async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith("/myAccount/status")
        ? new Response(
            JSON.stringify({ errors: [{ code: "invalid_access_token" }] }),
            { status: 401 },
          )
        : asaas.fetchImpl(input, init)) as typeof fetch;
    const original = logger.warn;
    const spy = vi
      .spyOn(logger, "warn")
      .mockImplementation((message, context) => {
        if (message === "asaas: chave desconectada") throw new Error("boom");
        return original(message, context);
      });
    try {
      expect(await connect(failing)).toEqual({ ok: true });
    } finally {
      spy.mockRestore();
    }
    expect(plainKey((await row())!.apiKeyEnc)).toBe(KEY);
  });

  it("a 401 for an old key does not disconnect a replaced key", async () => {
    const asaas = fakeAsaas("APPROVED");
    await connect(asaas.fetchImpl);
    // While the refresh waits on Asaas with the old key, the owner replaces it.
    const racing = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/myAccount/status")) {
        await connect(asaas.fetchImpl, NEW_KEY);
        return new Response(
          JSON.stringify({ errors: [{ code: "invalid_access_token" }] }),
          { status: 401 },
        );
      }
      return asaas.fetchImpl(input, init);
    }) as typeof fetch;
    await refreshAccount(CLINIC, racing);
    expect((await row())!.status).not.toBe("disconnected");
    expect(plainKey((await row())!.apiKeyEnc)).toBe(NEW_KEY);
    // Directly: only the key that is stored can disconnect.
    await markDisconnected(CLINIC, KEY);
    expect((await row())!.status).not.toBe("disconnected");
    await markDisconnected(CLINIC, NEW_KEY);
    expect((await row())!.status).toBe("disconnected");
  });

  it("replacing with another account's key is refused", async () => {
    const asaas = fakeAsaas();
    await connect(asaas.fetchImpl);
    asaas.state.wallet = "wal-2";
    expect(await connect(asaas.fetchImpl, NEW_KEY)).toEqual({
      ok: false,
      formError: OTHER_ACCOUNT,
    });
    const saved = (await row())!;
    expect(saved.walletId).toBe("wal-1");
    expect(plainKey(saved.apiKeyEnc)).toBe(KEY);
  });

  it("the same Asaas account cannot connect two clinics", async () => {
    const asaas = fakeAsaas();
    await connect(asaas.fetchImpl);
    const clinicB = await otherClinic();
    expect(await connect(asaas.fetchImpl, NEW_KEY, clinicB)).toEqual({
      ok: false,
      formError: OTHER_CLINIC,
    });
    expect(await db.select().from(asaasAccounts)).toHaveLength(1);
  });

  it("a revoked key marks the account disconnected", async () => {
    const asaas = fakeAsaas("APPROVED");
    await connect(asaas.fetchImpl);
    expect(await depositApiKey(CLINIC)).toBe(KEY);
    asaas.state.revoked.add(KEY);
    expect(await refreshAccount(CLINIC, asaas.fetchImpl)).toMatchObject({
      status: "disconnected",
    });
    expect((await row())!.lastError).toBe("invalid_key");
    expect(await depositApiKey(CLINIC)).toBeNull();
    // A disconnected account is not read again.
    const before = asaas.calls.length;
    await refreshAccount(CLINIC, asaas.fetchImpl);
    expect(asaas.calls).toHaveLength(before);
  });

  it("replacing the key of an approved account keeps it approved when the follow-up refresh fails", async () => {
    const asaas = fakeAsaas("APPROVED");
    await connect(asaas.fetchImpl);
    expect(await row()).toMatchObject({
      status: "approved",
      pixKeyReady: true,
    });
    const failingStatus = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) =>
      String(input).endsWith("/myAccount/status")
        ? new Response("{}", { status: 503 })
        : asaas.fetchImpl(input, init)) as typeof fetch;
    expect(await connect(failingStatus, NEW_KEY)).toEqual({ ok: true });
    expect(await row()).toMatchObject({
      status: "approved",
      pixKeyReady: true,
    });
    expect(await depositApiKey(CLINIC)).toBe(NEW_KEY);
  });

  it("replacing the key reconnects a disconnected account", async () => {
    const asaas = fakeAsaas("APPROVED");
    await connect(asaas.fetchImpl);
    asaas.state.revoked.add(KEY);
    await refreshAccount(CLINIC, asaas.fetchImpl);
    expect(await connect(asaas.fetchImpl, NEW_KEY)).toEqual({ ok: true });
    expect(await row()).toMatchObject({
      status: "approved",
      pixKeyReady: true,
      lastError: null,
    });
    expect(await depositApiKey(CLINIC)).toBe(NEW_KEY);
  });
});

describe("refreshAccount", () => {
  it("no Pix online method before approval", async () => {
    const asaas = fakeAsaas("PENDING");
    await connect(asaas.fetchImpl);
    const view = await refreshAccount(CLINIC, asaas.fetchImpl);
    expect(view).toMatchObject({ status: "pending", pixKeyReady: false });
    expect(await pixOnline()).toHaveLength(0);
    expect(asaas.calls.some((c) => c.path.endsWith("/pix/addressKeys"))).toBe(
      false,
    );
  });

  it("refresh creates the EVP key once approved and adds Pix online", async () => {
    const asaas = fakeAsaas("PENDING");
    await connect(asaas.fetchImpl);
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
    expect(created[0]!.key).toBe(KEY);
  });

  it("keeps an existing active key instead of creating one", async () => {
    const asaas = fakeAsaas("APPROVED", [{ id: "k", status: "ACTIVE" }]);
    await connect(asaas.fetchImpl);
    await refreshAccount(CLINIC, asaas.fetchImpl);
    expect(
      asaas.calls.some(
        (c) => c.method === "POST" && c.path.endsWith("/pix/addressKeys"),
      ),
    ).toBe(false);
    expect((await row())!.pixKeyReady).toBe(true);
  });

  it("waits for a key awaiting activation instead of creating another", async () => {
    const asaas = fakeAsaas("APPROVED", [
      { id: "k", status: "AWAITING_ACTIVATION" },
    ]);
    await connect(asaas.fetchImpl);
    expect(await refreshAccount(CLINIC, asaas.fetchImpl)).toMatchObject({
      status: "approved",
      pixKeyReady: false,
      lastError: null,
    });
    expect(await pixOnline()).toHaveLength(0);
    // Asaas activates it later: the next refresh turns the deposit on.
    asaas.state.keys[0]!.status = "ACTIVE";
    expect(await refreshAccount(CLINIC, asaas.fetchImpl)).toMatchObject({
      pixKeyReady: true,
    });
    expect(await pixOnline()).toHaveLength(1);
    expect(
      asaas.calls.some(
        (c) => c.method === "POST" && c.path.endsWith("/pix/addressKeys"),
      ),
    ).toBe(false);
  });

  it("maps a rejected account and null without a connected account", async () => {
    expect(await refreshAccount(CLINIC, fakeAsaas().fetchImpl)).toBeNull();
    const asaas = fakeAsaas("REJECTED");
    await connect(asaas.fetchImpl);
    expect(await refreshAccount(CLINIC, asaas.fetchImpl)).toMatchObject({
      status: "rejected",
    });
  });
});

describe("depositApiKey", () => {
  it("is null when disabled, pending or without Pix key", async () => {
    const asaas = fakeAsaas("PENDING");
    expect(await depositApiKey(CLINIC)).toBeNull();
    await connect(asaas.fetchImpl);
    expect(await depositApiKey(CLINIC)).toBeNull();
    asaas.state.general = "APPROVED";
    await refreshAccount(CLINIC, asaas.fetchImpl);
    expect(await depositApiKey(CLINIC)).toBe(KEY);
    await setDepositEnabled(CLINIC, false, actor);
    expect(await depositApiKey(CLINIC)).toBeNull();
    await setDepositEnabled(CLINIC, true, actor);
    expect(await depositApiKey(CLINIC)).toBe(KEY);
    await db
      .update(asaasAccounts)
      .set({ pixKeyReady: false })
      .where(eq(asaasAccounts.clinicId, CLINIC));
    expect(await depositApiKey(CLINIC)).toBeNull();
  });
});

describe("markAccountError", () => {
  it("records a code and clears it with null", async () => {
    await connect(fakeAsaas().fetchImpl);
    await markAccountError(CLINIC, "limit_exceeded");
    expect((await row())!.lastError).toBe("limit_exceeded");
    await markAccountError(CLINIC, null);
    expect((await row())!.lastError).toBeNull();
  });
});
