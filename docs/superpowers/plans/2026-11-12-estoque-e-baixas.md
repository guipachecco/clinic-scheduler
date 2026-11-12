# Estoque e baixas (PR 3): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada produto passa a ter uma quantidade em estoque, com entradas, baixas e histórico. A dona dá baixa à mão no atendimento em que o produto foi usado, e "Dar baixa em tudo" na venda desconta o que ainda falta. O estoque nunca fica negativo, e o mesmo produto nunca é descontado duas vezes.

**Architecture:**

- `products.stock_quantity` guarda a quantidade atual, com `check (>= 0)`. A tabela `stock_movements` é o histórico e só aceita novas linhas, nunca edição.
- Toda mudança grava o movimento e faz `UPDATE products SET stock_quantity = stock_quantity + q` na mesma transação, e a check do banco trava o negativo.
- A baixa ligada a uma venda trava o item da venda (`FOR UPDATE`) e nunca passa do que falta.
- O código fica num módulo novo, `src/modules/stock/`. As telas entram na página do produto, no detalhe do atendimento e no detalhe da venda.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Drizzle ORM e drizzle-kit 0.31, PostgreSQL com RLS (app_panel/app_client/app_platform), zod, react-hook-form, Vitest (unit e integration) e Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-modulos-produtos-estoque-design.md` (seção "PR 3"). Já estão no main: o PR 1 (#34, módulos: `requireModule`, `moduleActive`, `MODULE_OFF_ERROR`) e o PR 2 (#35, produtos com categorias e produto em `quote_items`/`sale_items`, onde `sessions` guarda a quantidade).

## Global Constraints

- **Migração:** `0029_stock.sql`, gerada com `corepack pnpm drizzle-kit generate --name=stock`. Revise o SQL à mão, porque nada pode ser apagado. Ela só acrescenta coisas: o código antigo continua funcionando depois dela.
- **Tipos de movimento** (`stock_movement_kind`): `entry`, `usage`, `handover`, `reversal`.
- **Sinal da quantidade:**
  - `entry` > 0; `usage` < 0; `handover` < 0.
  - `reversal` ≠ 0, com o sinal contrário ao do movimento que estorna.
  - Um mesmo movimento só pode ser estornado uma vez (`reverses_id unique`). Um `reversal` não pode ser estornado.
- **Vínculos:**
  - `usage` tem `appointment_id` obrigatório e `sale_item_id` opcional.
  - `handover` tem `sale_item_id` obrigatório e `appointment_id` nulo.
  - `entry` não tem nenhum dos dois.
  - `reversal` copia os vínculos do movimento original.
- **Permissões:** `app_panel` só tem `SELECT` e `INSERT` em `stock_movements`. `app_client` não lê `stock_movements` nem `products.stock_quantity`: não dê grant.
- **Mensagens:**
  - estoque insuficiente: `"Estoque insuficiente: há N. Lance uma entrada primeiro."`, com N = quantidade atual. Em "Dar baixa em tudo", a mensagem começa pelo nome do produto: `"<Produto>: estoque insuficiente: há N. Lance uma entrada primeiro."`;
  - acima do vendido: `"Na venda nº X faltam só N."`;
  - estorno repetido: `"Esta baixa já foi desfeita."`;
  - venda cancelada: `"Esta venda foi cancelada."`.
- **Onde a baixa vale:** só em atendimentos `confirmed` e `completed`. Nos outros, o bloco não aparece, e o servidor recusa com `"Só dá para registrar produto em atendimento confirmado ou concluído."`.
- **Módulos:** tudo de estoque exige `products`. O seletor de venda no atendimento e o bloco "Produtos da venda" exigem também `finance`.
- **Venda cancelada:** não oferece "Dar baixa em tudo" nem entra no seletor do atendimento. As baixas já feitas continuam.
- **Textos da tela:** "Estoque", "Lançar entrada", "Quantidade", "Observação", "Histórico", "Produtos usados", "Registrar", "Desfazer", "Sem venda", "Conta na venda nº X (faltam N)", "Produtos da venda", "N de M com baixa", "Dar baixa em tudo".
- **Ambiente:** use `corepack pnpm`. Nunca rode o prettier em pastas inteiras, só nos arquivos alterados. Leia `node_modules/next/dist/docs/01-app/` antes de criar rotas ou actions.

## Review Focus

1. **Duas baixas ao mesmo tempo com estoque 1.** Uma passa e a outra recebe "Estoque insuficiente". O estoque nunca fica em -1. Teste na Task 2.
2. **Baixa ligada a uma venda de outra pessoa ou de outro produto,** enviada à mão. O servidor recusa, porque o item precisa ser da mesma pessoa atendida, do mesmo produto e de uma venda não cancelada. Teste na Task 2.
3. **"Desfazer" clicado duas vezes,** ou em duas abas. O segundo recebe "Esta baixa já foi desfeita.". Teste na Task 2.
4. **"Dar baixa em tudo" com um produto sem estoque.** Nada é baixado, e a mensagem diz qual produto faltou. Teste na Task 2.
5. **Produto com histórico de estoque.** Não pode ser excluído, então `inUse` também conta `stock_movements`. Teste na Task 2.

---

### Task 1: Migração 0029 e schema

**Files:**

- Modify: `src/db/schema/clinic.ts` (`products.stockQuantity`, mais a tabela `stockMovements` e o enum `stockMovementKind`; se o arquivo crescer demais, crie `src/db/schema/stock.ts` e exporte em `index.ts`) e `src/db/schema/finance.ts` (índices `quote_items_product_idx` e `sale_items_product_idx` em `(clinic_id, product_id)`)
- Create: `drizzle/0029_stock.sql`, mais o snapshot e o journal
- Test: `tests/integration/stock-db.test.ts`

**Interfaces:**

- Produces:
  - `products.stockQuantity`: `integer not null default 0`, com `products_stock_check (stock_quantity >= 0)`.
  - `stockMovements`: `id`, `clinicId`, `productId`, `kind`, `quantity`, `appointmentId?`, `saleItemId?`, `reversesId?` (`unique`), `note?` (≤ 200), `createdByUserId?`, `createdAt`.
  - FKs compostas por `clinic_id` para `products`, `appointments`, `sale_items` e para a própria `stock_movements` (`reverses_id`), todas `on delete restrict`. Quem ainda não tiver `unique (clinic_id, id)`, ganha.
  - Checks das regras de sinal e de vínculo das Global Constraints.
  - Índices `(clinic_id, product_id, created_at desc)`, `(appointment_id)` e `(sale_item_id)`.
  - RLS: `stock_movements_panel FOR ALL TO app_panel` por `app.clinic_id`, como em 0024, com `GRANT SELECT, INSERT` apenas.

- [ ] **Step 1: Escrever os testes de integração que falham**
  - `"app_panel cannot update or delete stock movements"`
  - `"stock_quantity cannot go below zero"`
  - `"app_client cannot read stock_quantity nor stock_movements"`
  - `"movement checks: usage needs an appointment, handover needs a sale item, entry is positive, a movement is reversed at most once"`
  - `"a clinic cannot see another clinic's movements"`
- [ ] **Step 2:** Rodar `corepack pnpm vitest run --project integration tests/integration/stock-db.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Implementar o schema, gerar e revisar o SQL. Uma segunda `generate` deve dizer "No schema changes".
- [ ] **Step 4:** Rodar `corepack pnpm test:integration`, `test:unit` e `typecheck`. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(db): estoque e histórico de movimentos (0029)`.

### Task 2: Módulo de estoque

**Files:**

- Create: `src/modules/stock/fields.ts`, `src/modules/stock/stock.ts` e `src/modules/stock/fields.test.ts`
- Modify: `src/modules/products/products.ts` (`inUse` e `deleteProduct` também contam `stock_movements`; `ProductListItem` ganha `stockQuantity`)
- Test: `tests/integration/stock.test.ts`

**Interfaces:**

- Produces:
  - `entrySchema`: `{ quantity: 1-10000, note?: ≤200 }`.
  - `usageSchema`: `{ productId: uuid, quantity: 1-200, saleItemId: uuid | null }`.
  - Todas as funções devolvem `StockResult = { ok: true } | { ok: false; formError: string }`, e todas recebem `clinicId` e `actorUserId`:
    - `recordEntry(clinicId, productId, values, actorUserId)`
    - `recordUsage(clinicId, appointmentId, values, actorUserId)`:
      - o atendimento precisa estar `confirmed` ou `completed`;
      - o produto precisa estar ativo e ser da clínica;
      - quando há `saleItemId`, trava o item, que precisa ser de produto, do mesmo produto, de uma venda não cancelada da mesma pessoa, e com quantidade ≤ o que falta.
    - `handOverAll(clinicId, saleId, actorUserId)`: um `handover` para cada item de produto com saldo, tudo ou nada.
    - `reverseMovement(clinicId, movementId, actorUserId)`: cria o `reversal`. Ao estornar uma entrada, o estoque precisa continuar ≥ 0.
  - `type StockHistoryEntry = { id; kind; quantity; createdAt: Date; actorName: string | null; note: string | null; origin: { type: "entry" } | { type: "appointment"; appointmentId; patientName; startsAt: Date } | { type: "sale"; saleId; saleNumber } ; reversed: boolean }`
  - `getProductStock(clinicId, productId): Promise<{ quantity: number; history: StockHistoryEntry[] } | null>`, com o mais novo primeiro e no máximo 100 linhas.
  - `listAppointmentUsage(clinicId, appointmentId): Promise<{ movementId; productName; quantity; saleNumber: number | null; reversed: boolean }[]>`
  - `listOpenSaleItems(clinicId, patientId): Promise<{ saleItemId; saleId; saleNumber; productId; productName; remaining }[]>`: só vendas não canceladas e itens com saldo > 0, a mais antiga primeiro.
  - `saleProductProgress(clinicId, saleId): Promise<{ saleItemId; productName; sold; done; remaining }[]>`, onde `done` é a soma das saídas menos os estornos daquele item.
- Cada mudança grava em `audit_logs` (`stock.entry`, `stock.usage`, `stock.handover`, `stock.reversal`), só com ids e quantidades.

- [ ] **Step 1: Escrever os testes que falham**
  - Unidade: os limites dos schemas.
  - Integração:
    - `"entries and usages keep stock_quantity equal to the sum of movements"`
    - `"two concurrent usages with stock 1: one succeeds, one gets Estoque insuficiente"` (duas transações em paralelo com `Promise.all`)
    - `"usage linked to a sale cannot exceed what is left"`
    - `"usage refuses a sale item of another patient, another product or a cancelled sale"`
    - `"usage refuses an appointment that is not confirmed or completed"`
    - `"handOverAll is all or nothing and names the product without stock"`
    - `"reversing twice is refused"`
    - `"reversing an entry cannot make stock negative"`
    - `"a product with stock history cannot be deleted"`
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar. Para a mensagem com N, pegue a violação de `products_stock_check` (código 23514) e leia a quantidade atual numa consulta nova, depois do rollback. Ou trave o produto (`FOR UPDATE`) e compare antes do `UPDATE`; a check continua como última trava.
- [ ] **Step 4:** Rodar `corepack pnpm test:integration`, `test:unit` e `typecheck`. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(estoque): entradas, baixas, estornos e histórico`.

### Task 3: Estoque na área de Produtos

**Files:**

- Modify:
  - `src/app/admin/(painel)/produtos/[id]/page.tsx`: o bloco "Estoque", com a quantidade, o formulário "Lançar entrada" (Quantidade, Observação) e o "Histórico", com data, quem fez, a origem como texto (links para o atendimento ou a venda quando houver) e "Desfazer" nos movimentos `entry` e `usage` ainda não estornados.
  - `src/app/admin/(painel)/produtos/page.tsx`: cada cartão mostra "Estoque: N".
  - `src/app/admin/(painel)/produtos/actions.ts`: `recordEntryAction` e `reverseMovementAction`, com o mesmo guard de `products`.
- Create: `src/app/admin/(painel)/produtos/[id]/stock-forms.tsx`

**Textos da origem:**

- "Entrada";
- "Atendimento de <nome> em dd/MM" (o fuso da clínica vem de `getClinicTimezone`);
- "Venda nº X";
- "Baixa desfeita" nos estornos.

O link do histórico só aparece com o módulo ligado: a venda pede `finance`.

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** Rodar `corepack pnpm lint`, `typecheck` e `test:unit`. Esperado: sem erros.
- [ ] **Step 3:** Commit `feat(produtos): estoque, entradas e histórico na página do produto`.

### Task 4: Baixa no atendimento e na venda

**Files:**

- Modify: `src/app/admin/(painel)/agenda/[id]/page.tsx`. Novo bloco "Produtos usados", só com `products` e com o atendimento `confirmed`/`completed`:
  - o formulário tem Produto (ativos), Quantidade e, quando `finance` está ligado e há itens em aberto daquele produto para a pessoa, o seletor "Conta na venda nº X (faltam N)" / "Sem venda", com a venda mais antiga marcada;
  - o botão é "Registrar";
  - a lista de `listAppointmentUsage` mostra "Desfazer".
- Create: `src/app/admin/(painel)/agenda/[id]/product-usage.tsx` e as actions `recordUsageAction` / `reverseUsageAction` em `src/app/admin/(painel)/agenda/actions.ts` (guard de `products`; a action recusa `saleItemId` quando `finance` está desligado).
- Modify: `src/app/admin/(painel)/financeiro/vendas/[id]/page.tsx`. Bloco "Produtos da venda", só com `products` e só quando a venda tem item de produto:
  - por item, "N de M com baixa";
  - o botão "Dar baixa em tudo" aparece quando há saldo e a venda não está cancelada.
  - A action `handOverAllAction` fica em `financeiro/actions.ts`, com os guards de `finance` e de `products`.
- Modify: o retorno do pagamento no atendimento (`agenda/[id]`). Depois de registrar o pagamento de uma parcela de venda que ainda tem produto com saldo, aparece o link "Dar baixa nos produtos da venda" para `/admin/financeiro/vendas/<id>#produtos-da-venda`. _(Decisão do controlador: a venda já mostra o bloco logo abaixo das parcelas.)_

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** Rodar `corepack pnpm lint`, `typecheck`, `test:unit` e `test:integration`. Esperado: PASS.
- [ ] **Step 3:** Rodar `e2e/agenda.spec.ts` e `e2e/finance.spec.ts`. Esperado: PASS, exceto a falha antiga das visões de mês e dia da agenda.
- [ ] **Step 4:** Commit `feat(estoque): baixa no atendimento e "Dar baixa em tudo" na venda`.

### Task 5: e2e

**Files:**

- Create: `e2e/stock.spec.ts` (serial, com uma conta própria de dona da Grais em `e2e/test-account.ts` e `global-setup.ts`, como fez `products.spec.ts`)

- [ ] **Step 1: Escrever os testes**
  - `"launches an entry and sees the stock"`: criar o produto "Mounjaro Fictício E2E", "Lançar entrada" com 2, e a tela mostra "Estoque: 2".
  - `"records usage in an appointment linked to a sale"`:
    - preparar via banco um paciente, uma venda aprovada com o produto (quantidade 2) e um atendimento confirmado;
    - no atendimento, "Produtos usados" com o produto e Quantidade 1;
    - o seletor vem marcado com "Conta na venda nº X (faltam 2)";
    - "Registrar". O estoque vai a 1, e a venda mostra "1 de 2 com baixa".
  - `"refuses usage above stock"`: Quantidade 5, e aparece "Estoque insuficiente: há 1. Lance uma entrada primeiro.".
  - `"hands over everything left on the sale"`: na venda, "Dar baixa em tudo"; aparece "2 de 2 com baixa", e o estoque vai a 0.
  - `"undoes a usage"`: no atendimento, "Desfazer"; o estoque volta a 1, e o histórico mostra "Baixa desfeita".
  - O `afterAll` apaga só as linhas criadas: movimentos, parcelas, itens, vendas, orçamentos, atendimento, produto e paciente.
- [ ] **Step 2:** Rodar `PATH=<pasta do pnpm.cmd>:$PATH corepack pnpm exec playwright test e2e/stock.spec.ts`. Esperado: PASS.
- [ ] **Step 3:** Rodar a suíte e2e inteira em background. Esperado: PASS, salvo a falha antiga e já conhecida da agenda.
- [ ] **Step 4:** Commit `test(e2e): estoque, baixa no atendimento e na venda`.

### Task 6: PR

- [ ] Fazer o push e abrir o PR com `gh pr create --base main`. Título: `feat: estoque com baixa no atendimento e na venda`. O corpo traz:
  - o que muda;
  - **migração 0029 de produção logo antes de mesclar**, que só acrescenta coisas, com o comando e a conferência por curl;
  - os testes;
  - a linha de atribuição.
