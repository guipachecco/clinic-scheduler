# Sinal via Pix no agendamento online (Asaas): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quem marca online numa clínica com recebimentos ativos paga 15% do serviço por Pix na hora; o sinal confirma o horário, vira venda no financeiro e segue a regra de devolução de 24h quando a dona cancela.

**Architecture:** Módulo novo `src/modules/asaas/` no molde de `src/modules/mercado-pago/`: cliente HTTP fino (`api.ts`), regras puras (`rules.ts`), subconta por clínica com chave criptografada (`accounts.ts`), sinais (`deposits.ts`), venda automática (`deposit-sale.ts`) e webhook. A agenda e o agendamento online chamam o módulo em pontos marcados. Tudo some quando `ASAAS_API_KEY` não está definida.

**Tech Stack:** Next.js (ler `node_modules/next/dist/docs/` antes de mexer em rotas, conforme `AGENTS.md`), Drizzle + Postgres com RLS, zod, Vitest (unit e integration), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-16-sinal-pix-asaas-design.md`

## Global Constraints

- Sem `ASAAS_API_KEY` (produção hoje): nenhuma tela, status, texto ou forma de pagamento nova aparece; agendamento online e financeiro iguais a hoje.
- Valores: sinal = **15%** do `services.price_cents`, arredondado **para cima** ao centavo; segura o horário por **30 minutos**; devolução para cancelamento pela cliente com **mais de 24h** antes de `starts_at`, medido no momento em que a dona registra; cancelamento pela clínica sempre devolve.
- Sinal só para serviço com `price_cents` não nulo e `price_display` em `fixed` ou `starting_at`.
- Sinal mínimo: constante `MIN_DEPOSIT_CENTS` (começa em `500`; confirmar no sandbox na Tarefa 1 e ajustar). Abaixo dela, sem sinal.
- Toda função de dados recebe `clinicId` e roda em `inClinic` (papel `app_panel`), exceto o que já roda como cliente em `booking.ts` (`asClient`).
- Chave de API de subconta só criptografada (`api_key_enc`), nunca em log, erro, audit ou resposta ao navegador. Erros do Asaas nunca carregam o corpo da resposta (pode ter CPF).
- CPF nunca em URL, audit ou log; não vai para `patients.cpf`.
- `audit_logs.changes` só ids, valores em centavos, instantes e códigos.
- Forma de pagamento `"Pix online"` criada na ativação (`ensurePixOnlineMethod`), nunca na migração.
- Migração `0036`, só acrescenta (código antigo roda com ela aplicada). Rodar `db:migrate` de produção antes do merge.
- Todas as chamadas ao Asaas recebem `fetchImpl: Fetch = fetch` como último parâmetro, para os testes usarem um Asaas falso. Nenhum teste chama a rede.
- Header `User-Agent: zemana` em toda chamada (o Asaas exige um User-Agent).
- Textos de interface em português, no tom das telas atuais.
- Comandos: `npm run test:unit`, `npm run test:integration` (Postgres de teste local), `npm run typecheck`, `npm run lint`, `npm run test:e2e`.
- Um commit por tarefa (`feat(asaas): ...`, `feat(agenda): ...`), terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Aviso do Asaas repetido, fora de ordem ou atrasado** (pago depois de expirado, pago duas vezes, pago depois de a dona cancelar ou confirmar na mão): nunca dois pagamentos registrados, nunca reativar o que a dona cancelou; estorno automático conforme a tabela do spec. Testes na Tarefa 6.
- **Dois cliques em "Pagar sinal"** ou duas abas: um agendamento e uma cobrança só; a segunda tentativa recebe o mesmo QR. Teste na Tarefa 5.
- **Vaga presa por Pix não pago**: depois de 30 min o horário volta a aparecer livre para a próxima cliente, sem cron. Teste na Tarefa 5.
- **Estorno recusado pelo Asaas** (sem saldo): nada muda aqui, a dona vê o motivo e pode cancelar sem estornar. Teste na Tarefa 8.
- **Aviso com cobrança de outra clínica ou token errado**: 401 sem token certo; pagamento cujo `externalReference` não bate com o sinal da subconta consultada é ignorado. Testes na Tarefa 6.

---

### Task 1: Configuração e cliente HTTP do Asaas

**Files:**
- Modify: `src/lib/env.ts` (junto às variáveis `MP_*`)
- Modify: `.env.example` (acrescentar `ASAAS_WEBHOOK_TOKEN`)
- Create: `src/modules/asaas/api.ts`
- Test: `src/modules/asaas/api.test.ts`

**Interfaces:**
- Produces:
  - `env.ASAAS_API_KEY?: string`, `env.ASAAS_BASE_URL: string` (padrão `https://api-sandbox.asaas.com/v3`), `env.ASAAS_WEBHOOK_TOKEN?: string`. Validação: `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` definidas juntas.
  - `type Fetch = typeof fetch`
  - `class AsaasError extends Error { status: number; codes: string[] }` (só os `errors[].code` do Asaas; nada do corpo além disso)
  - `createSubaccount(apiKey: string, input: SubaccountInput, fetchImpl?): Promise<{ id: string; walletId: string; apiKey: string }>` (`POST /accounts`, com `webhooks: [{ url, email, sendType: "SEQUENTIALLY", authToken, events }]` para os eventos `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_REFUNDED`, `PAYMENT_DELETED`)
  - `type SubaccountInput = { name; email; cpfCnpj; birthDate?; companyType?; mobilePhone; incomeValue; address; addressNumber; province; postalCode; webhookUrl; webhookToken }`
  - `getAccountStatus(apiKey, fetchImpl?): Promise<{ general: string; documentation: string; commercialInfo: string; bankAccountInfo: string }>` (`GET /myAccount/status`)
  - `createEvpKey(apiKey, fetchImpl?): Promise<{ id: string; status: string }>` (`POST /pix/addressKeys` com `{ type: "EVP" }`)
  - `listPixKeys(apiKey, fetchImpl?): Promise<{ id: string; status: string }[]>`
  - `createCustomer(apiKey, input: { name: string; cpfCnpj: string; externalReference: string }, fetchImpl?): Promise<{ id: string }>`
  - `createPixPayment(apiKey, input: { customer: string; valueCents: number; dueDate: string; externalReference: string; description: string }, fetchImpl?): Promise<AsaasPayment>`
  - `getPayment(apiKey, id, fetchImpl?): Promise<AsaasPayment>`
  - `getPixQrCode(apiKey, id, fetchImpl?): Promise<{ payload: string; encodedImage: string; expirationDate: string }>`
  - `deletePayment(apiKey, id, fetchImpl?): Promise<void>`
  - `refundPayment(apiKey, id, fetchImpl?): Promise<AsaasPayment>`
  - `type AsaasPayment = { id: string; status: string; valueCents: number; externalReference: string | null }` (converte `value` em reais para centavos com `Math.round(value * 100)`)

- [ ] **Step 1: Write the failing tests** (`api.test.ts`, com `fetch` falso que grava as chamadas)

```ts
it("sends access_token and User-Agent, never logs the key", ...)
  // expect(call.headers.access_token).toBe("k"); expect(call.headers["User-Agent"]).toBe("zemana")
it("converts value in reais to cents and back", ...)
  // createPixPayment(..., { valueCents: 1200 }) envia value: 12; resposta value: 12.5 -> valueCents 1250
it("AsaasError carries status and codes only", ...)
  // resposta 400 { errors: [{ code: "invalid_billingType", description: "CPF 123..." }] }
  // expect(err.codes).toEqual(["invalid_billingType"]); expect(err.message).not.toContain("123")
it("createSubaccount registers the webhook with the token", ...)
  // body.webhooks[0].authToken === "tok"; events contém "PAYMENT_RECEIVED"
it("deletePayment treats 404 as already gone", ...)
```

- [ ] **Step 2: Run** `npx vitest run src/modules/asaas/api.test.ts`. Expected: FAIL (módulo não existe)
- [ ] **Step 3: Implement** `env` e `api.ts`. Copie a estrutura de `call<T>()` de `src/modules/mercado-pago/api.ts` (timeout 15s, `cache: "no-store"`), trocando o header de autenticação para `access_token`.
- [ ] **Step 4: Run** o mesmo comando. Expected: PASS
- [ ] **Step 5: Confirmar no sandbox** (script descartável fora do repo, com a chave do `.env`): o menor valor de cobrança Pix aceito. Ajustar `MIN_DEPOSIT_CENTS` da Tarefa 2 se for diferente de 500.
- [ ] **Step 6: Commit** `feat(asaas): configuração e cliente da API`

### Task 2: Regras puras do sinal

**Files:**
- Create: `src/modules/asaas/rules.ts`
- Test: `src/modules/asaas/rules.test.ts`

**Interfaces:**
- Produces:
  - `DEPOSIT_PERCENT = 15`, `HOLD_MINUTES = 30`, `REFUND_WINDOW_HOURS = 24`, `MIN_DEPOSIT_CENTS = 500`
  - `depositFor(service: { priceCents: number | null; priceDisplay: "fixed" | "starting_at" | "on_request" | "hidden" }): number | null` (centavos ou null = sem sinal)
  - `cancellationOutcome(input: { by: "patient" | "clinic"; startsAt: Date; now: Date }): "refund" | "keep"`
  - `type DepositStatus = "pending" | "paid" | "expired" | "refunded" | "kept" | "closed"`
  - `type CloseReason = "timeout" | "clinic_cancelled" | "manual_confirm" | "charge_failed"`
  - `lateArrival(input: { status: DepositStatus; closeReason: CloseReason | null; slotFree: boolean }): "confirm" | "refund" | "ignore"`
  - `isValidCpfCnpj(digits: string): boolean` (dígitos verificadores de CPF e CNPJ)
  - `accountReady(status: { general: string }): boolean` (`general === "APPROVED"`)

- [ ] **Step 1: Write the failing tests**

```ts
expect(depositFor({ priceCents: 8000, priceDisplay: "fixed" })).toBe(1200);
expect(depositFor({ priceCents: 8001, priceDisplay: "fixed" })).toBe(1201); // 1200,15 -> para cima
expect(depositFor({ priceCents: 8000, priceDisplay: "starting_at" })).toBe(1200);
expect(depositFor({ priceCents: null, priceDisplay: "on_request" })).toBeNull();
expect(depositFor({ priceCents: 8000, priceDisplay: "hidden" })).toBeNull();
expect(depositFor({ priceCents: 3000, priceDisplay: "fixed" })).toBeNull(); // 450 < 500

const start = new Date("2026-11-20T17:00:00Z");
expect(cancellationOutcome({ by: "patient", startsAt: start, now: new Date("2026-11-19T16:59:59Z") })).toBe("refund");
expect(cancellationOutcome({ by: "patient", startsAt: start, now: new Date("2026-11-19T17:00:00Z") })).toBe("keep"); // exatamente 24h = fica
expect(cancellationOutcome({ by: "clinic", startsAt: start, now: new Date("2026-11-20T16:00:00Z") })).toBe("refund");

expect(lateArrival({ status: "pending", closeReason: null, slotFree: true })).toBe("confirm");
expect(lateArrival({ status: "expired", closeReason: "timeout", slotFree: true })).toBe("confirm");
expect(lateArrival({ status: "expired", closeReason: "timeout", slotFree: false })).toBe("refund");
expect(lateArrival({ status: "closed", closeReason: "clinic_cancelled", slotFree: true })).toBe("refund");
expect(lateArrival({ status: "closed", closeReason: "manual_confirm", slotFree: true })).toBe("refund");
expect(lateArrival({ status: "paid", closeReason: null, slotFree: true })).toBe("refund"); // 2º pagamento
expect(lateArrival({ status: "refunded", closeReason: null, slotFree: true })).toBe("ignore");

expect(isValidCpfCnpj("52998224725")).toBe(true);
expect(isValidCpfCnpj("11111111111")).toBe(false);
```

- [ ] **Step 2: Run** `npx vitest run src/modules/asaas/rules.test.ts`. Expected: FAIL
- [ ] **Step 3: Implement** `rules.ts`. Regra de "pago 2x": `lateArrival` só é chamada quando o pagamento recebido **não** é o que já está gravado em `asaas_deposits.payment_charge_id`; o handler (Tarefa 6) trata o caso idempotente antes.
- [ ] **Step 4: Run.** Expected: PASS
- [ ] **Step 5: Commit** `feat(asaas): regras do sinal`

### Task 3: Tabelas, migração 0036 e isolamento

**Files:**
- Create: `src/db/schema/asaas.ts`; Modify: `src/db/schema/index.ts`
- Create: `drizzle/0036_asaas.sql` (gerado com `npm run db:generate` e completado à mão com grants, RLS e função)
- Test: `tests/integration/asaas-db.test.ts`

**Interfaces:**
- Produces (Drizzle):
  - `asaasAccounts` (PK `clinic_id`): `accountId`, `walletId`, `apiKeyEnc`, `status` (enum `asaas_account_status`: `pending`, `approved`, `rejected`), `pixKeyReady boolean default false`, `depositEnabled boolean default true`, `lastError text null` (código curto do Asaas, ex. `"limit_exceeded"`), `activatedByUserId`, `createdAt`, `updatedAt`.
  - `asaasCustomers`: `id`, `clinicId`, `patientId`, `customerId` (Asaas), `cpfCnpjLast4 text` (só para mostrar "CPF final 4725"; o CPF inteiro não é guardado), unique `(clinic_id, patient_id)`.
  - `asaasDeposits`: `id` (= `externalReference`), `clinicId`, `appointmentId` (unique), `patientId`, `amountCents > 0`, `chargeId text unique`, `status` (enum `asaas_deposit_status` = `DepositStatus`), `closeReason` (enum `asaas_close_reason` = `CloseReason`, null), `expiresAt`, `paymentId uuid null` (FK `payments`), `saleId uuid null` (FK composta `sales`), `createdAt`, `updatedAt`. Check: `(status in ('paid','kept','refunded')) = (payment_id is not null)`.
- SQL à mão: grants e RLS como `mercado_pago_*` em `drizzle/0023_mercado_pago.sql:48-68` (só `app_panel`; `app_client` sem grant); `UPDATE` em colunas de status apenas; função `asaas_deposit_clinic(p_deposit_id uuid) RETURNS uuid SECURITY DEFINER` com `REVOKE ... FROM PUBLIC; GRANT EXECUTE ... TO app_panel`.

- [ ] **Step 1: Write the failing tests** (`asaas-db.test.ts`, no estilo de `tests/integration/clinic-isolation.test.ts`)

```ts
it("app_panel of clinic A cannot read clinic B's asaas_accounts / deposits", ...)
it("app_client has no access to asaas tables", ...)        // expect permission denied
it("asaas_deposit_clinic returns the clinic only for an existing deposit", ...)
it("one deposit per appointment", ...)                       // 2º insert com o mesmo appointment_id falha
it("paid deposit requires payment_id", ...)                  // check constraint
```

- [ ] **Step 2: Run** `npx vitest run --project integration tests/integration/asaas-db.test.ts`. Expected: FAIL
- [ ] **Step 3: Implement** o schema, gere e complete a migração.
- [ ] **Step 4: Run.** Expected: PASS. Rode também `tests/integration/multi-clinic-migration.test.ts` e `database-rules.test.ts`.
- [ ] **Step 5: Commit** `feat(asaas): tabelas da subconta e do sinal`

### Task 4: Subconta da clínica e tela de ativação

**Files:**
- Modify: `src/modules/mercado-pago/crypto.ts` (`tokenKey(secret, info = "mercado-pago-tokens")`; o Asaas usa `info = "asaas-api-keys"`. Mesmo formato, chaves diferentes.)
- Create: `src/modules/asaas/accounts.ts`, `src/modules/asaas/fields.ts` (zod do formulário)
- Create: `src/app/admin/(painel)/financeiro/sinal-pix/page.tsx`, `actions.ts`, `activation-form.tsx`
- Modify: entrada no menu/página do Financeiro, só quando `asaasEnabled()`
- Test: `tests/integration/asaas-accounts.test.ts`

**Interfaces:**
- Consumes: Tarefa 1 (`createSubaccount`, `getAccountStatus`, `createEvpKey`, `listPixKeys`), Tarefa 2 (`accountReady`), Tarefa 3 (tabelas).
- Produces:
  - `asaasEnabled(): boolean` (`env.ASAAS_API_KEY !== undefined`)
  - `PIX_ONLINE_METHOD = "Pix online"`; `ensurePixOnlineMethod(tx: Tx, clinicId: string): Promise<string>` (mesmo padrão de `ensureMercadoPagoMethod` em `src/modules/mercado-pago/accounts.ts:70`)
  - `activateAccount(clinicId, values: ActivationValues, actorUserId, fetchImpl?): Promise<{ ok: true } | { ok: false; formError: string }>`. Grava a `apiKey` criptografada **na mesma operação** em que a resposta chega; se a gravação falhar, registra o `accountId` no log de erro para recuperação manual.
  - `refreshAccount(clinicId, fetchImpl?): Promise<AccountView | null>`. Lê o status; ao virar `APPROVED`, cria a chave EVP se `listPixKeys` não tiver nenhuma `ACTIVE`, marca `pixKeyReady` e chama `ensurePixOnlineMethod`.
  - `type AccountView = { status: "pending" | "approved" | "rejected"; pixKeyReady: boolean; depositEnabled: boolean; lastError: string | null }`
  - `setDepositEnabled(clinicId, enabled: boolean, actorUserId): Promise<void>`
  - `depositApiKey(clinicId): Promise<string | null>`. Retorna a chave decifrada só se `approved && pixKeyReady && depositEnabled`.
  - `markAccountError(clinicId, code: string): Promise<void>` / limpa com `null` no próximo sucesso.

- [ ] **Step 1: Write the failing tests** (Asaas falso)

```ts
it("activation stores the encrypted key, never the plain one", ...) // row.apiKeyEnc !== "sub-key" e decifra para "sub-key"
it("activation twice is refused", ...)                              // formError "Os recebimentos já foram ativados."
it("refresh creates the EVP key once approved and adds Pix online", ...)
it("no Pix online method before approval", ...)
it("depositApiKey is null when disabled, pending or without Pix key", ...)
it("only the owner can activate", ...) // na action: papel diferente de admin -> erro
```

- [ ] **Step 2: Run** `npx vitest run --project integration tests/integration/asaas-accounts.test.ts`. Expected: FAIL
- [ ] **Step 3: Implement** o módulo e a tela, com os quatro estados do spec (sem subconta / em análise / ativo com interruptor / recusada). Se `!asaasEnabled()`, a rota responde `notFound()`. Pré-preenche com os dados da clínica.
- [ ] **Step 4: Run.** Expected: PASS. Depois `npm run typecheck && npm run lint`.
- [ ] **Step 5: Commit** `feat(asaas): ativar recebimentos pela subconta`

### Task 5: Marcar com sinal (cobrança, QR, expiração)

**Files:**
- Create: `src/modules/asaas/deposits.ts`
- Modify: `src/modules/booking/booking.ts` (`bookOnline`, `listFreeSlots`, `listDaysWithSlots`, `BookingResult`)
- Modify: `src/app/[slug]/marcar/actions.ts`, `confirm-sheet.tsx`, `booking-flow.tsx`; Create: `src/app/[slug]/marcar/pix-step.tsx`
- Modify: `src/app/[slug]/meus-horarios/page.tsx` (status "Aguardando pagamento do sinal" + QR enquanto valer)
- Test: `tests/integration/asaas-booking.test.ts`

**Interfaces:**
- Consumes: Tarefas 1, 2 e 4 (`depositApiKey`, `markAccountError`).
- Produces:
  - `depositQuote(clinicId, serviceId): Promise<{ amountCents: number; needsCpf: boolean; cpfLast4: string | null } | null>` (null = esta marcação não cobra sinal). `needsCpf` vem de `asaasCustomers` da paciente.
  - `sweepExpiredDeposits(clinicId, now?, fetchImpl?): Promise<number>`. Sob `lockAgenda`, para `pending` com `expires_at <= now`: agendamento `requested` → `cancelled` (`cancelled_by = "system"`, motivo do sistema), sinal → `expired` + `closeReason = "timeout"`; depois, fora da transação, `deletePayment` no Asaas, ignorando falhas.
  - `startDeposit(clinicId, input: { appointmentId; patientId; patientName; serviceName; amountCents; cpf?: string }, now?, fetchImpl?): Promise<{ ok: true; deposit: DepositView } | { ok: false; reason: "transient" | "permanent" | "cpf_invalid" }>`
  - `getDepositView(clinicId, appointmentId, patientId): Promise<DepositView | null>` (só da própria paciente; usado no polling)
  - `type DepositView = { status: DepositStatus; amountCents: number; expiresAt: Date; pixPayload: string | null; qrImageBase64: string | null }`
  - `BookingResult` ganha `{ ok: true; appointmentId: string; deposit: DepositView | null }` e o motivo `"cpf_required"`.
- Fluxo de `bookOnline(ctx, { serviceId, startsAt, cpf? })`:
  1. `await sweepExpiredDeposits(ctx.clinicId)` antes da transação do cliente. Também chamado no início de `listFreeSlots`/`listDaysWithSlots`.
  2. `const quote = await depositQuote(...)`; se `quote?.needsCpf && !cpf`, retorna `cpf_required` antes de gravar.
  3. Transação do cliente igual à de hoje, mas com `status: quote ? "requested" : "confirmed"` (e `confirmedAt` só sem sinal).
  4. Com `quote`: `startDeposit(...)`. Em `transient` ou `cpf_invalid`: cancela o agendamento (sistema, sem sinal) e retorna `{ ok: false, reason: "unavailable" }`; a UI mostra "Não conseguimos gerar o Pix agora, tente de novo." Em `permanent`: `markAccountError`, confirma o agendamento sem sinal e retorna `deposit: null`.
- Reaproveitamento (dois cliques): `startDeposit` não cria uma segunda cobrança se já existe sinal `pending` para o mesmo `appointmentId` (unique da Tarefa 3). A action de marcar, ao receber `taken` para o mesmo serviço e horário de um agendamento `requested` da própria paciente, devolve o `DepositView` existente.
- Cobrança: `dueDate` = data de hoje no fuso da clínica; `description` = `"Sinal · <serviço>"`; `externalReference` = id do sinal; cliente Asaas criado uma vez por paciente e clínica (`asaasCustomers`).

- [ ] **Step 1: Write the failing tests**

```ts
it("clinic without active deposit books confirmed, as today", ...)          // deposit: null, status confirmed
it("service without price books confirmed without deposit", ...)
it("asks for CPF when the patient has no Asaas customer", ...)               // reason "cpf_required", nenhum agendamento gravado
it("books requested, creates one Pix charge of 15% and returns the QR", ...) // fake recebe value 12 para preço 8000
it("second click returns the same deposit, one charge only", ...)            // fake.createPixPayment chamado 1x
it("after 30 minutes the slot is free again and the charge is deleted", ...) // now + 31min: listFreeSlots contém o horário; status cancelled/system; fake.deletePayment chamado
it("transient Asaas failure undoes the booking", ...)                        // fake responde 503 -> reason "unavailable", slot livre
it("permanent refusal confirms without deposit and flags the account", ...)  // fake 400 code de limite -> deposit null, lastError gravado
it("getDepositView never shows another patient's deposit", ...)
```

- [ ] **Step 2: Run** `npx vitest run --project integration tests/integration/asaas-booking.test.ts`. Expected: FAIL
- [ ] **Step 3: Implement** `deposits.ts` e as mudanças em `booking.ts`. Classifique como `permanent` os códigos que o Asaas devolve para conta não aprovada ou limite. Comece por `invalid_billingType` e `invalid_action` (vistos no sandbox) e registre os outros que aparecerem.
- [ ] **Step 4: Implement a UI.** A tela de confirmação mostra o sinal, o restante e a regra das 24h ("Devolvido se você desmarcar com mais de 24h de antecedência."), mais o campo CPF quando `needsCpf`. O botão vira "Pagar sinal com Pix". `pix-step.tsx` mostra o QR, "Copiar código Pix", a contagem regressiva e consulta `getDepositView` a cada 4s; com `paid`, mostra "Horário confirmado". Siga o mockup aprovado no spec.
- [ ] **Step 5: Run** os testes e depois `npm run typecheck && npm run lint && npx vitest run --project integration tests/integration/booking.test.ts`. Expected: PASS (o booking antigo não muda sem Asaas).
- [ ] **Step 6: Commit** `feat(agendamento): sinal por Pix na marcação online`

### Task 6: Webhook, confirmação e venda automática

**Files:**
- Create: `src/modules/asaas/deposit-sale.ts`
- Modify: `src/modules/asaas/deposits.ts` (handler)
- Create: `src/app/api/webhooks/asaas/route.ts`
- Test: `tests/integration/asaas-webhook.test.ts`

**Interfaces:**
- Consumes: Tarefas 1–5; `PIX_ONLINE_METHOD`/`ensurePixOnlineMethod`; `todayLocal` (`src/modules/schedule/time`).
- Produces:
  - `createDepositSale(tx: Tx, input: { clinicId; appointmentId; patientId; serviceId; serviceName; priceCents; depositCents; startsAt: Date; paidOn: string }): Promise<{ saleId: string; paymentId: string }>`. Cria um **orçamento já aprovado** (as telas de vendas fazem join obrigatório com `quotes`), a venda `paymentPlan: "installments"` com um item e duas parcelas: nº 1 = sinal (vence `paidOn`) e nº 2 = restante (`priceCents - depositCents`, vence no dia local de `startsAt`, com `appointmentId` e `saleItemId` preenchidos, o que faz o "Receber agora" de `findSessionInstallment` aparecer sozinho). Registra o pagamento da parcela 1 com a forma "Pix online" e a nota "Sinal pago por Pix (Asaas)". Venda e orçamento marcados com a nota "Sinal online".
  - `handleDepositNotification(depositId: string, chargeId: string, fetchImpl?, now?): Promise<"paid" | "refunded" | "ignored" | "unknown">`
  - Rota `POST /api/webhooks/asaas`: sem `env.ASAAS_WEBHOOK_TOKEN` → 503; header `asaas-access-token` diferente (comparação em tempo constante) → 401; lê só `payment.id` e `payment.externalReference` (uuid) do corpo; 200 em "feito ou nada a fazer"; 500 pede nova tentativa. Mesma estrutura de `src/app/api/webhooks/mercado-pago/route.ts`.
- Handler: `asaas_deposit_clinic(depositId)` → clínica; `depositApiKey` ignorando `depositEnabled` (desligar não pode impedir estorno nem confirmação); `getPayment` no Asaas; exige `payment.externalReference === depositId`. Depois, numa transação `inClinic` com o sinal `for update` e `lockAgenda`:
  - pago (`RECEIVED`/`CONFIRMED`) e `chargeId === deposit.chargeId` e `status === "paid"` → `ignored` (repetido).
  - pago → `lateArrival(...)`: `confirm` → agendamento `confirmed` (audit com ator `system`) + `createDepositSale` + sinal `paid`; `refund` → depois da transação, `refundPayment` no Asaas e audit `asaas.deposit_auto_refunded` com o motivo.
  - `REFUNDED` com sinal `paid` → estorna o pagamento aqui, sinal `refunded` (estorno feito pelo app do Asaas).

- [ ] **Step 1: Write the failing tests** (rota chamada com `Request` montado; Asaas falso)

```ts
it("401 without the right token; 503 when not configured", ...)
it("paid: appointment confirmed, sale with 2 installments, deposit payment with Pix online", ...)
  // parcelas [1200 pago, 6800 a receber com appointmentId]; findSessionInstallment -> outstanding 6800
it("same notification twice records one payment", ...)
it("paid after timeout, slot still free: confirms", ...)
it("paid after timeout, slot taken: refunds automatically, no payment recorded", ...)
it("paid after the owner cancelled: refunds, appointment stays cancelled", ...)
it("paid after manual confirm: refunds", ...)
it("payment whose externalReference is another deposit is ignored", ...)
it("deposit disabled after payment still confirms", ...)
it("REFUNDED from the Asaas app reverses the payment here", ...)
```

- [ ] **Step 2: Run** `npx vitest run --project integration tests/integration/asaas-webhook.test.ts`. Expected: FAIL
- [ ] **Step 3: Implement** `deposit-sale.ts`, o handler e a rota.
- [ ] **Step 4: Run** os testes acima e mais `tests/integration/finance.test.ts`. Expected: PASS
- [ ] **Step 5: Commit** `feat(asaas): webhook confirma o sinal e cria a venda`

### Task 7: Agenda do painel com sinal

**Files:**
- Modify: `src/modules/appointments/appointments.ts` (`getAppointment`, `listAppointmentsInRange`, `listRequestedFrom`, `countRequestedFrom`, `changeAppointmentStatus`, `rescheduleAppointment`)
- Modify: `src/app/admin/(painel)/agenda/[id]/page.tsx`, `status-actions.tsx`, componentes da grade da agenda
- Create: `syncDepositSale(tx, clinicId, appointmentId)` em `src/modules/asaas/deposit-sale.ts`
- Test: `tests/integration/asaas-agenda.test.ts`

**Interfaces:**
- Consumes: Tarefas 3, 5 e 6.
- Produces:
  - `getAppointment(...)` ganha `deposit: { status: DepositStatus; amountCents: number; expiresAt: Date } | null`.
  - `syncDepositSale(tx: Tx, clinicId: string, appointmentId: string): Promise<void>`. Chamada logo após `syncSessionInstallment` em `changeAppointmentStatus` e `rescheduleAppointment`. Remarcar muda o vencimento da parcela do restante para o novo dia local. `no_show` cancela a parcela do restante e o sinal fica `kept` (pagamento mantido).
  - A agenda trata `requested` com sinal `pending` como "Aguardando sinal · N min" (tom de aviso), diferente de "Solicitado". `listRequestedFrom`/`countRequestedFrom` excluem agendamentos com sinal `pending`.
  - Confirmar na mão um agendamento com sinal `pending` (fluxo 7): sinal → `closed` + `closeReason = "manual_confirm"`, `deletePayment` no Asaas depois da transação, sem venda automática.
  - Antes de montar a agenda e a página do agendamento, chamar `sweepExpiredDeposits(clinicId)`.
  - Com `asaasAccounts.lastError` preenchido, a agenda mostra um aviso fixo ("O Asaas recusou o sinal: <motivo>. Os agendamentos online estão entrando sem sinal.") com link para a tela de recebimentos. O aviso some quando `lastError` volta a `null`.

- [ ] **Step 1: Write the failing tests**

```ts
it("detail shows deposit paid 1200 and outstanding 6800", ...)
it("pending deposit does not appear in requested list/count", ...)
it("reschedule moves the remaining installment due date", ...)
it("no_show keeps the deposit and cancels the remaining installment", ...)
it("manual confirm closes the pending deposit and deletes the charge", ...)
```

- [ ] **Step 2: Run** `npx vitest run --project integration tests/integration/asaas-agenda.test.ts`. Expected: FAIL
- [ ] **Step 3: Implement** a parte de dados e depois a de tela: o bloco "Sinal pago R$ 12,00 · Falta R$ 68,00" acima do "Receber agora" existente e o selo "Aguardando sinal".
- [ ] **Step 4: Run** os testes, mais `appointments.test.ts`, `appointments-rules.test.ts` e `finance.test.ts`. Expected: PASS
- [ ] **Step 5: Commit** `feat(agenda): sinal no detalhe e nos status da agenda`

### Task 8: Cancelar com regra de devolução

**Files:**
- Modify: `src/modules/appointments/appointments.ts` (`changeAppointmentStatus` aceita `cancelledBy?: "clinic" | "patient"`, padrão `"clinic"`)
- Create: `cancelWithDeposit` em `src/modules/asaas/deposits.ts`
- Modify: `src/app/admin/(painel)/agenda/actions.ts`, `agenda/[id]/status-actions.tsx`
- Test: `tests/integration/asaas-cancel.test.ts`

**Interfaces:**
- Consumes: `cancellationOutcome` (Tarefa 2), `syncDepositSale` (Tarefa 7), `reversePayment` (`src/modules/finance/sales.ts:634`), `cancelSale` (`sales.ts:683`).
- Produces:
  - `previewCancellation(clinicId, appointmentId, by: "patient" | "clinic", now?): Promise<{ hasPaidDeposit: boolean; outcome: "refund" | "keep"; amountCents: number } | null>` (para o texto antes de confirmar)
  - `cancelWithDeposit(clinicId, appointmentId, input: { by: "patient" | "clinic"; reason: CancellationReason; skipRefund?: boolean }, actorUserId, fetchImpl?, now?): Promise<AppointmentResult>`
- Ordem: se o resultado é `refund` e não há `skipRefund`, chama `refundPayment` no Asaas **primeiro**. Se falhar, retorna `formError` com o motivo legível ("O Asaas não conseguiu devolver: saldo insuficiente na conta.") e nada muda. Com sucesso, numa transação: cancela o agendamento (`cancelledBy = by`), estorna o pagamento do sinal (`reversePayment`, motivo "Sinal devolvido") e cancela a venda; sinal `refunded`. Se `keep`: cancela o agendamento, cancela só a parcela do restante e marca o sinal `kept`. Com `skipRefund`, a dona cancela sem devolver; registra no audit que a devolução foi feita por fora.
- Agendamento com sinal `pending`: cancela, sinal `closed` + `closeReason = "clinic_cancelled"`, `deletePayment`.
- UI: com sinal pago, a tela de cancelar pergunta "Quem desmarcou?" (A cliente / A clínica) e mostra o efeito ("o sinal de R$ 12,00 volta para a cliente por Pix" ou "o sinal de R$ 12,00 fica com você"). Se o estorno falhar, oferece "Cancelar sem devolver pelo Asaas".

- [ ] **Step 1: Write the failing tests**

```ts
it("patient cancels more than 24h before: refunds at Asaas, reverses payment, cancels sale", ...)
it("patient cancels within 24h: keeps deposit, cancels remaining installment", ...)
it("clinic cancels 1h before: refunds", ...)
it("refund refused by Asaas: nothing changes, formError explains", ...) // fake 400 -> agendamento continua confirmed
it("skipRefund cancels without calling Asaas refund", ...)
it("cancelling a pending deposit deletes the charge", ...)
it("cancelledBy is stored as patient", ...)
```

- [ ] **Step 2: Run** `npx vitest run --project integration tests/integration/asaas-cancel.test.ts`. Expected: FAIL
- [ ] **Step 3: Implement** os dados e a tela.
- [ ] **Step 4: Run** os testes e `appointments.test.ts`. Expected: PASS
- [ ] **Step 5: Commit** `feat(agenda): cancelar com devolução do sinal`

### Task 9: Documentação e verificação final

**Files:**
- Create: `docs/asaas.md` (no formato de `docs/mercado-pago.md`: fluxo, regras garantidas, configuração, teste local com túnel, onde está o código, como ligar em produção depois do CNPJ, pontos a conferir no sandbox)
- Modify: `docs/mercado-pago.md` ("O que ainda não existe": sinal agora pelo Asaas) e `docs/financeiro.md` (venda "Sinal online")
- Test: `e2e/asaas-deposit.spec.ts` (só roda com `ASAAS_API_KEY` de teste; marca/paga com Asaas falso via rota de teste já usada nos e2e, se existir; senão, fica fora e é registrado no doc)

- [ ] **Step 1:** Escreva `docs/asaas.md`.
- [ ] **Step 2: Run** `npm run typecheck && npm run lint && npm run test:unit && npm run test:integration`. Expected: tudo verde.
- [ ] **Step 3: Teste ponta a ponta no sandbox** (manual, com túnel): ative uma clínica de teste e aprove a subconta no sandbox, marque, pague o Pix pelo painel do sandbox, veja a confirmação, a venda e o cancelamento com estorno. Anote no doc o que divergir.
- [ ] **Step 4: Sem `ASAAS_API_KEY`**, rode `npm run test:e2e` e confirme que marcação e financeiro estão iguais.
- [ ] **Step 5: Commit** `docs(asaas): sinal por Pix`
