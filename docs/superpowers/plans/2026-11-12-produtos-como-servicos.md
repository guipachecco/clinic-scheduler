# Produtos como Serviços (PR 2): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Os produtos ganham área própria no painel, como Serviços: menu, lista por categoria, novo, editar e categorias próprias. Também passam a entrar no orçamento e na venda.

**Architecture:**

- Tabela nova `product_categories` (RLS por clínica). `products` ganha `category_id`, `show_on_page` e `unique (clinic_id, id)`.
- `quote_items` e `sale_items` aceitam um serviço **ou** um produto: `service_id` passa a aceitar nulo, entra `product_id` e uma check de "exatamente um dos dois". Para produto, `sessions` guarda a quantidade e `service_name` guarda o nome do produto.
- O código dos produtos sai de `src/modules/clinic-page/panel.ts` e vai para um módulo próprio, `src/modules/products/`.
- As telas copiam o padrão de `src/app/admin/(painel)/servicos/`.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Drizzle ORM e drizzle-kit 0.31, PostgreSQL com RLS (app_panel/app_client/app_platform), zod, react-hook-form, Vitest (unit e integration) e Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-modulos-produtos-estoque-design.md` (seção "PR 2"). O PR 1 (#34, módulos por clínica) já está no main: `hasModule`, `requireModule`, `moduleActive` e `MODULE_OFF_ERROR` em `src/modules/clinics/modules.ts` e `src/modules/auth/session.ts`.

## Global Constraints

- **Migração:** `0028_products_like_services.sql`. Rode `corepack pnpm drizzle-kit generate --name=products_like_services` depois de mudar o schema. Se a geração pedir rename ou gerar drop e recriação, reescreva o SQL à mão; nada pode ser apagado.
- **Produção:** a migração precisa funcionar com o código **antigo** ainda no ar até o merge. Por isso, nada de rename nem drop de coluna. As colunas novas têm default, ou podem ser nulas, e o backfill é feito na própria migração.
- **Categoria padrão:** "Outros", criada para cada clínica existente (migração) e para cada clínica nova (`createClinic`). Os produtos existentes vão para ela.
- **"Mostrar na página":** os produtos existentes recebem `show_on_page = is_active` e depois `is_active = true`. A política `products_client` passa a exigir `is_active AND show_on_page`.
- **Significado dos campos:** "Ativo" quer dizer que o produto pode ser usado (orçamento, e baixa no PR 3); "Mostrar na página" quer dizer que aparece na página pública.
- **Apagar:** um produto citado em orçamento é desativado, nunca apagado. O botão "Excluir" só aparece para produto que nunca foi usado.
- **Dependência de módulos:** a área de Produtos exige `products`. Produto no orçamento e na venda exige `products` **e** `finance`.
- **Plano "por sessão":** cada item de produto gera **uma** parcela própria (`sale_item_id` = item, `due_date` = data da venda). Nos outros planos, o produto entra no total como os serviços.
- **Venda:** item de produto nunca é agendado nem revisto. "Agendar sessões", "adicionar sessões" e "remover sessões" recusam com `"Produto não tem sessões."`. "Refazer parcelas" (replan) continua valendo para a venda toda.
- **Textos:** menu "Produtos"; botões "Novo produto" e "Nova categoria"; campos "Nome", "Categoria", "Descrição", "Preço", "Mostrar na página", "Ativo"; no orçamento, os tipos "Serviço" e "Produto", e o campo "Quantidade" para produto, no lugar de "Sessões".
- **Ambiente:** use `corepack pnpm`. Nunca rode o prettier em pastas inteiras, só nos arquivos alterados. Leia `node_modules/next/dist/docs/01-app/` antes de criar rotas, redirects ou actions.

## Review Focus

1. **Orçamento em rascunho que já tem itens antigos.** Ele continua abrindo, editando e aprovando igual, porque os itens antigos têm `service_id` e `product_id` nulo. Teste na Task 4.
2. **Produto desativado depois de entrar num orçamento em rascunho.** Ao salvar o orçamento de novo, a tela recusa com "Este produto não está mais ativo." Ao aprovar um orçamento já salvo, a aprovação continua valendo (o nome foi copiado no item). Teste na Task 4.
3. **Clínica com Financeiro desligado e Produtos ligado.** A área de produtos funciona, e o orçamento simplesmente não existe. Clínica com Produtos desligado e Financeiro ligado: o orçamento não oferece "Produto", e o servidor recusa um item de produto enviado à mão. Teste na Task 4.
4. **Página pública com produto ativo, mas fora da página.** Ele não aparece para a cliente. Teste na Task 1 (política) e na Task 2 (`getClinicPage`).
5. **Venda "por sessão" só com produtos.** Gera uma parcela por produto, com vencimento hoje, e nenhuma sessão para agendar. Teste na Task 4.

---

### Task 1: Migração 0028 e schema

**Files:**

- Modify: `src/db/schema/clinic.ts` (`products` e a tabela nova `productCategories`, perto de `serviceCategories`) e `src/db/schema/finance.ts` (`quoteItems`, `saleItems`)
- Create: `drizzle/0028_products_like_services.sql`, mais o snapshot e o journal gerados
- Modify: `src/modules/clinics/clinics.ts` (`createClinic` cria a categoria "Outros" de produtos)
- Test: `tests/integration/products-db.test.ts`

**Interfaces:**

- Produces, no schema:
  - `productCategories`: `id`, `clinicId`, `name` (1-40 caracteres), `sortOrder`, `isActive`, `createdAt`, `updatedAt`; `unique (clinic_id, id)` e `unique (clinic_id, name)`. **Sem slug.**
  - `PRODUCT_OTHER_CATEGORY_NAME = "Outros"`
  - `products.categoryId` (notNull, FK composta → productCategories, `on delete restrict`), `products.showOnPage` (boolean, notNull, default true), `unique products_clinic_id_id_unique (clinic_id, id)`
  - `quoteItems.serviceId` e `saleItems.serviceId` passam a aceitar nulo; `quoteItems.productId` e `saleItems.productId` (uuid, nulos) com FK composta → products, `on delete restrict`; as checks `quote_items_kind_check` e `sale_items_kind_check` com `num_nonnulls(service_id, product_id) = 1`

**SQL, em ordem:** criar `product_categories`; inserir "Outros" para cada clínica; adicionar `products.category_id` (ainda nulo) e preencher com a "Outros" da clínica; depois `SET NOT NULL`; adicionar `show_on_page` com o backfill das Global Constraints; as constraints; os grants (`GRANT SELECT, INSERT, UPDATE, DELETE ON product_categories TO app_panel`); RLS `product_categories_panel FOR ALL TO app_panel` por `app.clinic_id`, como em 0024; recriar `products_client` (olhe a definição em 0017) com `AND show_on_page`; `GRANT SELECT (show_on_page) ON products TO app_client`, se `app_client` tiver grant por coluna em `products`.

- [ ] **Step 1: Escrever os testes de integração que falham**
  - `"every clinic has the Outros product category and old products are in it"`
  - `"a clinic cannot see another clinic's product categories"` (como app_panel, com `app.clinic_id` de outra clínica)
  - `"app_client does not see an active product hidden from the page"`
  - `"a quote item must have exactly one of service or product"`: inserir com os dois, ou com nenhum, viola `quote_items_kind_check`; o mesmo para `sale_items`
  - `"createClinic creates the Outros product category"`
- [ ] **Step 2:** Rodar `corepack pnpm vitest run --project integration tests/integration/products-db.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Implementar o schema, gerar e escrever o SQL.
- [ ] **Step 4:** Ajustar o código que lê `serviceId` como `string` e quebrou no typecheck: só o mínimo para compilar, tratando `serviceId` como possivelmente nulo. A lógica de produto no orçamento é da Task 4.
- [ ] **Step 5:** Rodar `corepack pnpm test:integration`, `corepack pnpm test:unit` e `corepack pnpm typecheck`. Esperado: PASS.
- [ ] **Step 6:** Commit `feat(db): categorias de produto e produto no orçamento (0028)`.

### Task 2: Módulo de produtos

**Files:**

- Create: `src/modules/products/fields.ts`, `src/modules/products/products.ts` e `src/modules/products/fields.test.ts`
- Modify: `src/modules/clinic-page/panel.ts` (remover `PanelProduct`, `listProducts`, `createProduct`, `updateProduct`, `deleteProduct` e `addExampleProducts`, que vão para o módulo novo) e `src/modules/clinic-page/fields.ts` (`productSchema` vai para `products/fields.ts`)
- Modify: `src/modules/clinic-page/public.ts` (a consulta de produtos filtra `showOnPage`; a ordem passa a ser categoria, ordem e nome)
- Test: `tests/integration/products.test.ts` (mova para cá os casos de produto que já existem em `tests/integration/clinic-page.test.ts`)

**Interfaces:**

- Produces:
  - `productFormSchema`: `{ name, categoryId (uuid), description, price (texto, aceita vazio; use parsePriceInput), showOnPage, isActive }`; `ProductFormInput` / `ProductFormValues`
  - `productCategoryFormSchema`: `{ name }`
  - `type ProductListItem = { id; name; priceCents: number | null; showOnPage; isActive; inUse: boolean }`
  - `type ProductCatalogCategory = { id; name; isActive; products: ProductListItem[] }`
  - `listProductCatalog(clinicId): Promise<ProductCatalogCategory[]>`: categorias em ordem e nome, inclusive categorias vazias
  - `getProduct(clinicId, id): Promise<ProductRecord | null>`
  - `createProduct(clinicId, values, actorUserId)` / `updateProduct(clinicId, id, values, actorUserId)`: `Promise<{ ok: true; id } | { ok: false; fieldErrors }>`. Recusa categoria de outra clínica ou inexistente, com `fieldErrors.categoryId`. Cada mudança vai para `audit_logs`, como em `services.ts`.
  - `deleteProduct(clinicId, id)`: recusa quando `inUse` (citado em `quote_items`)
  - `createProductCategory(clinicId, values)` / `updateProductCategory(clinicId, id, values)`: nome repetido dá `fieldErrors.name = "Já existe uma categoria com este nome."`
  - `addExampleProducts(clinicId)`: igual ao de hoje, todos na "Outros"
  - `listActiveProducts(clinicId): Promise<{ id; name; priceCents: number | null }[]>`, para o orçamento

- [ ] **Step 1: Escrever os testes que falham**
  - Unidade: `productFormSchema` aceita o preço "59,90" e devolve 5990, aceita o preço vazio como null e recusa nome vazio.
  - Integração:
    - `listProductCatalog` agrupa por categoria.
    - Criar com a categoria de outra clínica falha.
    - `deleteProduct` de produto citado num orçamento falha, e sem uso funciona.
    - `getClinicPage` não mostra produto com `showOnPage = false`.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar e mover. Ajuste os imports de `src/app/admin/(painel)/pagina/actions.ts` e de `pagina/produtos/*` só para compilar; a tela nova é a Task 3.
- [ ] **Step 4:** Rodar unidade, integração e typecheck. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(produtos): módulo de produtos com categorias`.

### Task 3: Telas de Produtos no painel

**Files:**

- Create:
  - `src/app/admin/(painel)/produtos/page.tsx`, `novo/page.tsx`, `[id]/page.tsx`
  - `actions.ts` (`createProductAction`, `updateProductAction`, `deleteProductAction`, `addExampleProductsAction`, `createProductCategoryAction` e `updateProductCategoryAction`, todas com o guard de `products` e `MODULE_OFF_ERROR`)
  - `product-form.tsx` e `category-forms.tsx`
- Modify: `src/app/admin/(painel)/layout.tsx`. O item "Produtos" (`/admin/produtos`) vem depois de Serviços e só aparece com `products`. O ícone novo é `"box"` em `panel-nav.tsx`, com o mesmo estilo de traço.
- Replace: `src/app/admin/(painel)/pagina/produtos/page.tsx` vira um `redirect("/admin/produtos")`. Apague `pagina/produtos/product-form.tsx` e as actions de produto de `pagina/actions.ts`. O link "Produtos" de `pagina/page.tsx` aponta para `/admin/produtos`.
- Test: `e2e/clinic-page-panel.spec.ts` e outros specs que usam `/admin/pagina/produtos` (procure com grep) passam a usar a tela nova.

**Requisitos:**

- A lista copia `servicos/page.tsx`: cartões agrupados por categoria, com preço e com os selos "Fora da página" (`!showOnPage`) e "Inativo" (`!isActive`).
- Topo da lista: "Novo produto" e "Nova categoria".
- Lista vazia: o botão de produtos de exemplo.
- O formulário de editar mostra "Excluir" só quando `!inUse`.
- Todas as páginas chamam `requireModule("products")`.

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** Rodar `corepack pnpm lint`, `corepack pnpm typecheck` e `corepack pnpm test:unit`. Esperado: sem erros.
- [ ] **Step 3:** Rodar os specs e2e de produtos que já existem, depois de ajustá-los. Esperado: PASS.
- [ ] **Step 4:** Commit `feat(painel): área de Produtos como a de Serviços`.

### Task 4: Produto no orçamento e na venda

**Files:**

- Modify: `src/modules/finance/fields.ts`. `quoteItemSchema` vira uma união discriminada por `kind: "service" | "product"`: `{ kind:"service", serviceId, sessions }` ou `{ kind:"product", productId, sessions (a quantidade, 1-200) }`, mais `unitPrice` e `discount`, como hoje.
- Modify: `src/modules/finance/quotes.ts`
  - `readServiceNames` passa a ler serviços e produtos. Produto só ativo e da clínica; senão `"Este produto não está mais ativo."`.
  - `writeItems`, `duplicateQuote`, `getQuote` (o item devolve `kind`, `productId`) e `approveQuote` (`saleItems.productId`).
  - `planInstallments` segue a regra do plano "por sessão" das Global Constraints.
  - Com o módulo `products` desligado, a gravação de um item de produto recusa com `MODULE_OFF_ERROR`. A função recebe a lista de módulos ou um booleano `productsOn` vindo da action.
- Modify: `src/modules/finance/sales.ts`. `SaleDetail.items` ganha `kind`. Agendar, adicionar e remover sessões num item de produto recusam com `"Produto não tem sessões."`. `remaining` de produto é 0.
- Modify: `src/app/admin/(painel)/financeiro/orcamentos/quote-form.tsx` e `services.ts` (a lista de produtos ativos só quando `products` está ligado), as páginas de detalhe do orçamento e da venda (o produto mostra "Quantidade N" em vez de sessões e não tem botões de sessão) e `financeiro/actions.ts` (passa o `productsOn`).
- Test: `tests/integration/finance.test.ts`, ou um arquivo novo `tests/integration/quote-products.test.ts`, e `src/modules/finance/fields.test.ts`, se existir (senão, crie).

- [ ] **Step 1: Escrever os testes que falham**
  - Unidade: `quoteItemSchema` aceita `{kind:"product", productId, sessions:2, unitPrice:5990, discount:0}` e recusa `kind:"product"` sem `productId`.
  - Integração:
    - `"quote with a service and a product saves, totals and approves"`: a venda tem dois itens, o de produto com `productId`.
    - `"per-session plan gives one installment per product, due on the sale date"`
    - `"old quotes with service items still edit and approve"`
    - `"saving a quote with an inactive product is refused"` e `"approving a saved quote whose product was deactivated still works"`
    - `"product item is refused while products module is off"`
    - `"scheduling sessions on a product item is refused"`
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar `corepack pnpm test:integration`, `test:unit`, `lint` e `typecheck`. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(orçamento): produto como item do orçamento e da venda`.

### Task 5: e2e

**Files:**

- Create: `e2e/products.spec.ts` (serial, com o dono da Grais, como `services.spec.ts`; olhe ali como ele entra e como limpa no `afterAll`)

- [ ] **Step 1: Escrever os testes**
  - `"creates a category and a product, then edits it"`: em `/admin/produtos`, "Nova categoria" "Injetáveis"; "Novo produto" "Produto Fictício E2E", categoria Injetáveis, preço "120,00"; o produto aparece sob "Injetáveis"; editar e desmarcar "Mostrar na página"; aparece o selo "Fora da página".
  - `"a product hidden from the page is not on the public page"`: `/grais` → aba Produtos sem "Produto Fictício E2E".
  - `"a quote takes the product and becomes a sale"`: novo orçamento para um paciente de teste, item Produto "Produto Fictício E2E", Quantidade 2; aprovar à vista; a venda mostra "Quantidade 2".
  - `"the old address redirects"`: `/admin/pagina/produtos` → `/admin/produtos`.
  - O `afterAll` apaga, nesta ordem, as parcelas, os itens de venda, as vendas, os itens de orçamento, os orçamentos, os produtos e as categorias criados.
- [ ] **Step 2:** Rodar `PATH=<pasta do pnpm.cmd>:$PATH corepack pnpm exec playwright test e2e/products.spec.ts`. Esperado: PASS.
- [ ] **Step 3:** Rodar a suíte e2e inteira em background. Esperado: PASS, exceto a falha antiga de `e2e/agenda.spec.ts` (visões de mês e dia), que já falha no main.
- [ ] **Step 4:** Commit `test(e2e): produtos como serviços e no orçamento`.

### Task 6: PR

- [ ] Fazer o push e abrir o PR com `gh pr create --base main`. Título: `feat: produtos como serviços, com categorias e no orçamento`. O corpo traz:
  - o que muda e o que não muda;
  - **migração 0028 de produção logo antes de mesclar**, com o comando e a conferência por curl;
  - os testes;
  - a linha de atribuição.
