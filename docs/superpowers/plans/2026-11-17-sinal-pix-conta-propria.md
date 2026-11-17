# Sinal Pix com a conta Asaas da própria dona: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a ativação por subconta pela conexão da conta Asaas da própria dona (colar a chave de API), mantendo o resto do sinal Pix igual.

**Architecture:** A clínica continua com uma linha em `asaas_accounts` guardando a chave criptografada; muda só de onde a chave vem (a dona cola) e o que a Zemana faz ao receber (ler a conta, registrar o webhook, esperar aprovação e chave Pix). Uma chave recusada (401) marca a conta como `disconnected`, o que desliga o sinal sem quebrar a marcação.

**Tech Stack:** Next.js 16 (ler `node_modules/next/dist/docs/` antes de mexer em Server Actions/páginas), Drizzle + Postgres com RLS, Zod, Vitest (unit e integração contra o Postgres local), `corepack pnpm`.

**Spec:** [docs/superpowers/specs/2026-11-17-sinal-pix-conta-propria-design.md](../specs/2026-11-17-sinal-pix-conta-propria-design.md) (muda a ativação de [2026-11-16-sinal-pix-asaas-design.md](../specs/2026-11-16-sinal-pix-asaas-design.md)).

## Global Constraints

- A chave da dona nunca aparece em log, tela, e-mail, erro, `audit_logs` ou resposta de Server Action. Logs levam só `clinicId`, status HTTP e códigos do Asaas.
- `ASAAS_API_KEY` sai do código, do `.env.example`, do `vitest.config.ts` e da validação de `src/lib/env.ts`. O recurso liga quando `ASAAS_WEBHOOK_TOKEN` está definido. `ASAAS_BASE_URL` continua (padrão sandbox).
- Webhook registrado na conta da dona: nome `"Zemana"`, URL `new URL("/api/webhooks/asaas", env.BETTER_AUTH_URL)`, `authToken = ASAAS_WEBHOOK_TOKEN`, `email` = e-mail da conta no Asaas, `enabled: true`, `interrupted: false`, `apiVersion: 3`, `sendType: "SEQUENTIALLY"`, eventos `WEBHOOK_EVENTS` já existentes. Os outros webhooks dela nunca são alterados.
- Prefixos de chave: `$aact_prod_` só com `ASAAS_BASE_URL` que não contenha `sandbox`; `$aact_hmlg_` só com `ASAAS_BASE_URL` de sandbox. Prefixo desconhecido passa para o Asaas decidir.
- Uma conta Asaas (identificada pelo `walletId`) conecta em uma clínica só.
- Sem conta funcionando, a marcação online segue **sem sinal**, nunca com erro.
- Migração nova só acrescenta ou relaxa (roda em produção antes do merge).
- Textos da tela (exatos):
  - Aviso de desconexão: "Sua conta do Asaas desconectou. O sinal foi desligado e as marcações seguem sem sinal. Gere uma chave nova no Asaas e cole aqui."
  - Chave recusada: "O Asaas não aceitou essa chave. Gere uma nova e cole de novo."
  - Ambiente errado: "Essa chave é do ambiente de testes do Asaas. Gere uma chave na sua conta de verdade." (sandbox em produção) e "Essa chave é de produção, mas a Zemana está no ambiente de testes." (o contrário)
  - Conta em outra clínica: "Essa conta do Asaas já está conectada em outra clínica."
  - Trocar para outra conta: "Essa chave é de outra conta do Asaas. Use uma chave da conta já conectada."
  - Reembolso pendente: "O reembolso foi pedido e está aguardando sua aprovação no app do Asaas."

## Review Focus

1. Dona cola a chave com espaço ou quebra de linha no fim (copiou do Asaas): deve conectar normalmente (trim). Teste na Task 3.
2. Dona reconecta (Trocar chave) e o webhook "Zemana" já existe, inclusive pausado (`interrupted: true`): deve atualizar o mesmo webhook e reativá-lo, sem criar outro. Teste na Task 3.
3. Chave revogada no Asaas com um sinal pendente na tela da cliente: a próxima marcação segue sem sinal e o painel mostra o aviso; o sinal pendente vence normalmente. Teste na Task 4.
4. Duas clínicas tentando conectar a mesma conta ao mesmo tempo: só uma grava; a outra recebe o texto de "outra clínica", nunca erro 500. Teste na Task 3 (violação de unicidade).
5. Reembolso aceito pelo Asaas mas pendente de aprovação (`REFUND_REQUESTED`): o cancelamento conclui e a dona vê o aviso de aprovação. Teste na Task 4.

## Decisão sobre o reembolso (ruling do plano)

O spec pede que o sinal só conte como devolvido quando o Asaas confirmar. O fluxo atual já trata `REFUND_REQUESTED`/`REFUND_IN_PROGRESS` como "pedido aceito" e fecha o cancelamento. Mudar para esperar o webhook reescreveria o cancelamento inteiro. **Decisão:** manter o fechamento quando o Asaas aceita o pedido e **mostrar o aviso de aprovação pendente** quando o status devolvido não for `REFUNDED`. Se o Asaas recusar de vez depois, o webhook `PAYMENT_REFUNDED` nunca chega e o sinal fica como devolvido sem ter saído: risco aceito para o teste com a Greice, a conferir com ela. Custo se errado: uma tarefa a mais para reconciliar pelo webhook.

---

### Task 1: Chamadas novas do Asaas e regra de ambiente

**Files:**
- Modify: `src/modules/asaas/api.ts` (remover `createSubaccount` e `SubaccountInput`; acrescentar as funções abaixo)
- Modify: `src/modules/asaas/rules.ts`
- Test: `src/modules/asaas/api.test.ts`, `src/modules/asaas/rules.test.ts`

**Interfaces:**
- Produces:
  - `getCommercialInfo(apiKey: string, fetchImpl?: Fetch): Promise<{ name: string; email: string }>`: `GET /myAccount/commercialInfo` (sem corpo).
  - `getWalletId(apiKey: string, fetchImpl?: Fetch): Promise<string>`: `GET /wallets`, devolve `data[0].id`; lança `AsaasError` (status 0, código `no_wallet`) se vier vazio.
  - `listWebhooks(apiKey, fetchImpl?): Promise<{ id: string; url: string }[]>`: `GET /webhooks?limit=100`.
  - `saveWebhook(apiKey, input: { id?: string; url: string; email: string; authToken: string }, fetchImpl?): Promise<void>`: sem `id`, `POST /webhooks`; com `id`, `PUT /webhooks/{id}`. Corpo com os campos fixos das Global Constraints.
  - `keyEnvironment(apiKey: string): "production" | "sandbox" | "unknown"` e `baseUrlEnvironment(url: string): "production" | "sandbox"` em `rules.ts`.

- [ ] **Step 1: Testes que falham.** Em `api.test.ts`, com o `fetch` falso já usado ali:
  - `getWalletId` devolve `"wal-1"` para `{ data: [{ id: "wal-1" }] }` e chama `GET .../wallets` sem corpo.
  - `saveWebhook` sem `id` faz `POST .../webhooks` e com `id: "wh-1"` faz `PUT .../webhooks/wh-1`; nos dois o corpo tem `name: "Zemana"`, `enabled: true`, `interrupted: false`, `apiVersion: 3`, `sendType: "SEQUENTIALLY"`, `authToken` e `events` iguais a `WEBHOOK_EVENTS`.
  - `getCommercialInfo` devolve `{ name, email }`.
  - Remover o teste de `createSubaccount`.
  Em `rules.test.ts`: `keyEnvironment("$aact_prod_x") === "production"`, `keyEnvironment("$aact_hmlg_x") === "sandbox"`, `keyEnvironment("abc") === "unknown"`; `baseUrlEnvironment("https://api-sandbox.asaas.com/v3") === "sandbox"`, `baseUrlEnvironment("https://api.asaas.com/v3") === "production"`.
- [ ] **Step 2:** `corepack pnpm vitest run src/modules/asaas` → falha (funções não existem).
- [ ] **Step 3:** Implementar. Antes, conferir na documentação v3 do Asaas o método de atualizar webhook (esperado `PUT /v3/webhooks/{id}`); se for outro, ajustar e anotar no relatório.
- [ ] **Step 4:** `corepack pnpm vitest run src/modules/asaas` → passa. `corepack pnpm typecheck` vai acusar `accounts.ts` ainda usando `createSubaccount`: esperado, resolvido na Task 3. Se o typecheck for gate do commit, deixe `accounts.ts` compilando com um `throw new Error("substituído na Task 3")` temporário em `activateAccount`.
- [ ] **Step 5: Commit** `feat(asaas): chamadas para conectar a conta da dona`.

### Task 2: Banco: conta desconectada, nome da conta, uma conta por clínica

**Files:**
- Modify: `src/db/schema/asaas.ts`
- Create: `drizzle/0039_asaas_own_account.sql` (via `corepack pnpm db:generate`, depois revisar à mão) e o snapshot/journal gerados
- Test: `tests/integration/asaas-db.test.ts`

**Interfaces:**
- Produces: `asaasAccountStatus` com o valor novo `"disconnected"`; `asaasAccounts.accountId` opcional (nullable); `asaasAccounts.accountName: text | null`; `unique("asaas_accounts_wallet_unique").on(walletId)`.

- [ ] **Step 1: Teste que falha** em `asaas-db.test.ts`: `"a wallet connects to one clinic only"`: inserir `asaas_accounts` com `walletId: "wal-x"` na clínica de teste e tentar a mesma `walletId` em uma segunda clínica (o helper de clínicas desse arquivo); a segunda inserção rejeita com código Postgres `23505`. E `"accepts the disconnected status and no account id"`: inserir com `accountId: null` e atualizar `status` para `"disconnected"` sem erro.
- [ ] **Step 2:** Rodar o arquivo → falha.
- [ ] **Step 3:** Alterar o schema e gerar a migração. Conferir no SQL gerado: `ALTER TYPE ... ADD VALUE 'disconnected'`, `DROP NOT NULL` em `account_id`, `ADD COLUMN account_name text`, a constraint única. O `GRANT SELECT, INSERT, UPDATE ON asaas_accounts TO app_panel` da 0036 é de tabela inteira, então a coluna nova já está coberta (conferir).
- [ ] **Step 4:** `corepack pnpm db:migrate` local e rodar o arquivo → passa.
- [ ] **Step 5: Commit** `feat(asaas): banco para a conta própria da dona`.

### Task 3: Conectar, trocar chave e atualizar a conta

**Files:**
- Modify: `src/modules/asaas/accounts.ts`, `src/modules/asaas/fields.ts`, `src/lib/env.ts`, `vitest.config.ts`
- Test: `tests/integration/asaas-accounts.test.ts` (reescrever o fake para os endpoints novos)

**Interfaces:**
- Consumes: Task 1 (`getCommercialInfo`, `getWalletId`, `listWebhooks`, `saveWebhook`, `keyEnvironment`, `baseUrlEnvironment`), Task 2 (colunas e status).
- Produces:
  - `connectSchema` em `fields.ts`: `{ apiKey: string }`, com trim, mínimo 1 ("Cole a chave de API do Asaas."), máximo 500. Tipos `ConnectInput`/`ConnectValues`. `activationSchema`, `COMPANY_TYPES` e `ActivationValues` saem.
  - `connectAccount(clinicId: string, values: ConnectValues, actorUserId: string, fetchImpl?: Fetch): Promise<{ ok: true } | { ok: false; formError: string }>`: primeira conexão **e** troca de chave (se já existe linha, é troca).
  - `markDisconnected(clinicId: string): Promise<void>`: `status = "disconnected"`, `lastError = "invalid_key"`; idempotente.
  - `AccountView` ganha `accountName: string | null` e `status` passa a incluir `"disconnected"`.
  - `asaasEnabled()` = `env.ASAAS_WEBHOOK_TOKEN !== undefined`.
  - `activateAccount` e `activationDefaults` saem.

O que `connectAccount` faz, em ordem (cada passo para no primeiro erro, com os textos das Global Constraints):
1. Ambiente: `keyEnvironment(key)` diferente de `"unknown"` e de `baseUrlEnvironment(env.ASAAS_BASE_URL)` → texto de ambiente errado, sem chamar o Asaas.
2. `getWalletId` e `getCommercialInfo` com a chave. `AsaasError` 401 → "chave recusada"; outro erro → "O Asaas não respondeu. Tente de novo em instantes."
3. Troca de chave: se a linha existe e `walletId` difere → texto de "outra conta".
4. `listWebhooks` → acha o de URL igual à da Zemana → `saveWebhook` com o `id` dele; senão sem `id`.
5. Grava (insert na primeira, update na troca): `apiKeyEnc`, `walletId`, `accountName`, `status: "pending"`, `pixKeyReady: false`, `lastError: null`, `activatedByUserId`. Violação `23505` na constraint de wallet → texto de "outra clínica".
6. `audit_logs`: `asaas.connected` (primeira) ou `asaas.key_replaced` (troca), `changes: { walletId }`.
7. Chama `refreshAccount(clinicId, fetchImpl)` para já ler aprovação e chave Pix.

`refreshAccount`: mantém a lógica atual (status via `/myAccount/status`, chave Pix ativa ou criação da EVP). Muda: `AsaasError` 401 → `markDisconnected` e devolve a view com `status: "disconnected"`; não roda para linhas já `disconnected`. `depositApiKey` devolve `null` quando `disconnected` (já devolve, porque exige `approved`: conferir).

- [ ] **Step 1: Testes que falham** em `asaas-accounts.test.ts` (fake responde `/wallets`, `/myAccount/commercialInfo`, `/myAccount/status`, `/webhooks` GET/POST/PUT e `/pix/addressKeys`; responde 401 para a chave `"revogada"`):
  - `"connect stores the encrypted key, the wallet and the account name"`: `apiKeyEnc` decifra para a chave; o texto puro não aparece em nenhuma coluna; `accountName` é o `name` do fake.
  - `"trims the pasted key"`: `" $aact_hmlg_abc \n"` grava `$aact_hmlg_abc`.
  - `"refuses a production key in the sandbox without calling Asaas"`: com `ASAAS_BASE_URL` de sandbox (o do `vitest.config.ts`), chave `$aact_prod_x` → `formError` de ambiente e zero chamadas no fake.
  - `"a refused key shows the refused text"`: chave `"revogada"` → texto de chave recusada, nenhuma linha gravada.
  - `"creates the Zemana webhook with the token"`: um `POST /webhooks` com `authToken` = `env.ASAAS_WEBHOOK_TOKEN` e a URL da Zemana.
  - `"replacing the key updates the existing webhook, even a paused one"`: fake lista `{ id: "wh-1", url: <url da Zemana>, interrupted: true }` e outro webhook `{ id: "wh-2", url: "https://outro.example" }` → um `PUT /webhooks/wh-1` com `interrupted: false`, nada em `wh-2`, nenhum `POST`.
  - `"replacing with another account's key is refused"`: segunda conexão com wallet diferente → texto de "outra conta", linha intacta.
  - `"the same Asaas account cannot connect two clinics"`: segunda clínica com a mesma wallet → texto de "outra clínica", nunca exceção.
  - `"a revoked key marks the account disconnected"`: conectar, depois o fake passa a responder 401 → `refreshAccount` devolve `status: "disconnected"`, `depositApiKey` é `null`.
  - `"replacing the key reconnects a disconnected account"`: depois do caso acima, conectar com chave nova da mesma wallet → `status` sai de `disconnected`.
  - Manter adaptados: aprovação cria a EVP e "Pix online"; usa chave ativa existente; espera chave aguardando ativação; `setDepositEnabled`; `markAccountError`.
- [ ] **Step 2:** `corepack pnpm vitest run tests/integration/asaas-accounts.test.ts` → falha.
- [ ] **Step 3:** Implementar; remover `ASAAS_API_KEY` de `env.ts` (e o `.refine` que exigia as duas juntas) e do `vitest.config.ts`.
- [ ] **Step 4:** Rodar o arquivo → passa. `corepack pnpm typecheck` acusa a página e a action da ativação: resolvido na Task 5 (se o typecheck for gate, ajuste os imports dela para compilar e deixe a tela para a Task 5).
- [ ] **Step 5: Commit** `feat(asaas): a dona conecta a própria conta Asaas`.

### Task 4: Chave revogada e reembolso pendente nos fluxos do sinal

**Files:**
- Modify: `src/modules/asaas/deposits.ts`, `src/modules/appointments/appointments.ts` (tipo `AppointmentResult`), `src/app/admin/(painel)/agenda/[id]/status-actions.tsx`
- Test: `tests/integration/asaas-booking.test.ts`, `tests/integration/asaas-cancel.test.ts`

**Interfaces:**
- Consumes: `markDisconnected` (Task 3).
- Produces: `AppointmentResult` com `refundPending?: boolean`; `refundCharge` devolve o status final do pagamento (`string`).

Comportamento:
- Em `startDeposit`, um `AsaasError` 401 ao criar cliente, cobrança ou QR chama `markDisconnected(clinicId)` antes de seguir o caminho atual de falha permanente (a marcação segue sem sinal, como já faz para `permanent`).
- No cancelamento com reembolso, 401 também chama `markDisconnected` (o texto de falha de reembolso atual continua).
- No cancelamento, se o status devolvido por `refundCharge` não for `"REFUNDED"`, o resultado traz `refundPending: true`; `status-actions.tsx` mostra o texto de reembolso pendente das Global Constraints.
- O auto-reembolso do webhook (`handleDepositNotification`) só registra `refundStatus` no `audit_logs` existente (`changes`), sem tela.

- [ ] **Step 1: Testes que falham:**
  - `asaas-booking.test.ts`: `"a revoked key books without deposit and disconnects the account"`: fake responde 401 em `POST /payments` → a marcação termina sem sinal (como o caso permanente atual), `asaas_accounts.status = "disconnected"`, e a marcação seguinte nem chama o Asaas (`depositQuote` null).
  - `asaas-cancel.test.ts`: `"a refund waiting for approval cancels and says so"`: fake devolve `status: "REFUND_REQUESTED"` no refund → cancelamento `ok: true`, `refundPending: true`, sinal `refunded`. E `"a refund done at once has no pending notice"`: `"REFUNDED"` → `refundPending` ausente/false.
- [ ] **Step 2:** Rodar os dois arquivos → falham.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar os dois arquivos e `asaas-webhook.test.ts` → passam.
- [ ] **Step 5: Commit** `feat(asaas): chave revogada desliga o sinal e reembolso pendente avisa`.

### Task 5: Tela "Sinal por Pix", agenda e documentação

**Files:**
- Create: `src/app/admin/(painel)/financeiro/sinal-pix/connect-form.tsx`
- Delete: `src/app/admin/(painel)/financeiro/sinal-pix/activation-form.tsx`
- Modify: `src/app/admin/(painel)/financeiro/sinal-pix/page.tsx`, `.../sinal-pix/actions.ts` (`activateAction` vira `connectAction(input: ConnectInput)`), `src/app/admin/(painel)/agenda/page.tsx`, `docs/asaas.md`, `.env.example`
- Test: unit do formulário se o projeto tiver padrão para isso; senão, verificação no navegador (Step 4)

**Interfaces:**
- Consumes: `connectSchema`, `connectAccount`, `AccountView` (Task 3).

Estados da página (seguir o esboço aprovado no spec):
1. Sem linha: texto do sinal ("O dinheiro cai direto na sua conta do Asaas, sem taxa da Zemana."), passo a passo numerado (criar conta no Asaas com link para `https://www.asaas.com`, enviar documentos e esperar aprovação, Integrações → Chaves de API → Gerar chave, colar aqui), campo `type="password"` "Chave de API do Asaas", botão "Conectar conta". Conferir os nomes de menu no painel do Asaas.
2. `pending` ou aprovada sem chave Pix: "Conta conectada: {accountName}" e o que falta (análise no Asaas: "Confira o e-mail do Asaas para enviar seus documentos."; chave Pix: "Falta a chave Pix ficar ativa no Asaas. Abra esta tela de novo em instantes."). Botão "Trocar chave".
3. Aprovada com chave Pix: textos atuais do toggle, "Conta Asaas: {accountName}", `DepositToggle` e "Trocar chave".
4. `rejected`: texto atual.
5. `disconnected`: aviso vermelho das Global Constraints e o formulário de chave aberto.
"Trocar chave" abre o mesmo `ConnectForm` (estado local do cliente), que chama `connectAction`.

Agenda: quando `getAccountView(...).status === "disconnected"`, o aviso que já existe mostra o texto de desconexão com link para `/admin/financeiro/sinal-pix`.

Docs: `docs/asaas.md` troca a seção de subconta por "a dona conecta a própria conta", remove `ASAAS_API_KEY`, reescreve "Ligar em produção" (gerar `ASAAS_WEBHOOK_TOKEN`, `ASAAS_BASE_URL` de produção, `db:migrate` de produção com 0036 a 0039 antes do merge, mesclar, dona conecta) e lista os riscos do spec (reembolso com aprovação, webhook pausado, tarifa). `.env.example` sem `ASAAS_API_KEY` e com o comentário do token sem "junto com".

- [ ] **Step 1:** `corepack pnpm typecheck` e `corepack pnpm lint` acusam o que falta → implementar até zerar (fora o aviso base do `opengraph-image`).
- [ ] **Step 2:** `corepack pnpm vitest run` (unit) e `corepack pnpm vitest run tests/integration/asaas-*` → passam.
- [ ] **Step 3:** `corepack pnpm prettier --check` nos arquivos alterados.
- [ ] **Step 4: Verificação no navegador** (sandbox, servidor local): sem chave, a tela mostra o passo a passo; chave `$aact_prod_x` mostra o texto de ambiente errado; chave inválida de sandbox mostra o texto de recusa. Conectar de ponta a ponta exige túnel público e fica para o teste com a Greice em produção.
- [ ] **Step 5: Commit** `feat(asaas): tela para conectar a conta Asaas da dona`.
