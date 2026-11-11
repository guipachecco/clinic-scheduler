# Módulos por clínica (PR 1): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O root escolhe, na criação e depois, quais módulos cada clínica tem (Produtos, Financeiro, Agendamento online, Fidelidade, Anamnese, Avaliações), e também muda o tipo de negócio dela. Um módulo desligado some do painel e da página pública.

**Architecture:**
- A coluna `clinics.modules text[]` guarda os módulos ligados. Só `app_platform` escreve nela.
- As três chaves que já existiam (agendamento online, fidelidade e modelo de anamnese) passam a ter duas colunas cada: a escolha da dona ou do root, renomeada para `*_choice`, e uma coluna **gerada** com o nome antigo, que vale `escolha AND módulo ligado`. Assim, todas as funções `SECURITY DEFINER`, as consultas e as regras que já liam o nome antigo passam a obedecer ao módulo sem precisar de mudança. Os corpos das funções são texto plpgsql/sql e resolvem as colunas pelo nome em tempo de execução.
- Produtos, Financeiro e Avaliações são bloqueados no código, num único helper (`hasModule`), em quatro lugares: o menu, as páginas (`notFound()`), as Server Actions e a página pública.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Drizzle ORM e drizzle-kit 0.31, PostgreSQL com RLS, zod, react-hook-form, Vitest (projetos unit e integration) e Playwright.

**Spec:** `docs/superpowers/specs/2026-11-11-modulos-produtos-estoque-design.md` (seção "PR 1").

## Global Constraints

- **Chaves dos módulos, nesta ordem:** `products`, `finance`, `online_booking`, `loyalty`, `anamnesis`, `reviews`.
- **Rótulos:** Produtos, Financeiro, Agendamento online, Fidelidade, Anamnese, Avaliações.
- **Default da coluna e valor das clínicas existentes:** todos os seis.
- **Sempre ligadas (fora da lista):** Agenda, Clientes/Pacientes, Serviços, Expediente, Minha página.
- **Mensagem de módulo desligado nas actions:** `"Este recurso não está ativo para a clínica."`
- **Rotas de módulo desligado** respondem `notFound()`.
- **Desligar não apaga dados.** Nenhuma migração ou função apaga linhas por causa de um módulo.
- **Tela de edição do root:** nome, tipo de negócio e módulos. **Nunca o endereço (slug).**
- **Auditoria:** cada mudança de módulos ou de tipo pelo root vai para `audit_logs`, como em `setClinicActive`.
- **Ambiente:**
  - Leia `node_modules/next/dist/docs/` (layouts, `notFound`, Server Actions) antes de escrever as rotas.
  - Use `corepack pnpm`. Nunca rode o prettier em pastas inteiras; formate só os arquivos que mudou (`corepack pnpm prettier --write <arquivos>`).
- **Migração:** `0027_clinic_modules.sql`. Gere o snapshot com `corepack pnpm drizzle-kit generate --custom --name=clinic_modules` depois de mudar o schema e escreva o SQL à mão.

## Review Focus

1. **Linhas inseridas por testes e fixtures com `online_booking_enabled`/`loyalty_enabled`/`anamnesis_template`.** Coluna gerada não aceita `INSERT`/`UPDATE`, então o teste quebra com "cannot insert a non-DEFAULT value into column". Todas as ocorrências em `tests/`, `e2e/` e `scripts/` (são 15) passam a usar `*_choice`. A Task 2 roda as suítes de integração inteiras.
2. **Grants por coluna depois do rename.** O grant segue a coluna renomeada, mas a coluna gerada nova nasce sem grant. Sem um `GRANT SELECT` nela, `app_client` e `app_panel` recebem "permission denied" na página pública e no painel. Teste na Task 2.
3. **"Minha página" salva a chave da dona.** O formulário precisa ler e gravar `online_booking_choice`/`loyalty_choice`. Se ler a coluna gerada, ao salvar com o módulo desligado ele gravaria `false` por cima da escolha dela. Teste na Task 3.
4. **Action chamada direto, com o módulo desligado.** Esconder o menu não basta: as actions de Financeiro, de produtos de "Minha página", de avaliações (cliente) e de resgate de fidelidade recusam. Teste na Task 5.
5. **O root desmarca todos os módulos.** É permitido: a lista vazia vale, e o painel fica só com os itens fixos. Teste na Task 1 (schema) e na Task 6 (e2e).

---

### Task 1: Catálogo de módulos

**Files:**
- Create: `src/modules/clinics/modules.ts`
- Test: `src/modules/clinics/modules.test.ts`

**Interfaces:**
- Produces:
  - `CLINIC_MODULES: readonly ["products","finance","online_booking","loyalty","anamnesis","reviews"]`
  - `type ClinicModule = (typeof CLINIC_MODULES)[number]`
  - `CLINIC_MODULE_LABELS: Record<ClinicModule, string>`
  - `hasModule(clinic: { modules: readonly string[] }, key: ClinicModule): boolean`
  - `modulesSchema: z.ZodType<ClinicModule[]>`: remove repetições e ordena na ordem de `CLINIC_MODULES`.
  - `MODULE_OFF_ERROR = "Este recurso não está ativo para a clínica."`

- [ ] **Step 1: Escrever os testes que falham**
  - `hasModule({ modules: ["finance"] }, "finance") === true` e `hasModule({ modules: [] }, "products") === false`.
  - `modulesSchema.parse(["reviews","products","products"])` → `["products","reviews"]`.
  - `modulesSchema.parse([])` → `[]`.
  - `modulesSchema.safeParse(["estoque"]).success === false`.
  - `Object.keys(CLINIC_MODULE_LABELS)` é igual a `CLINIC_MODULES`.
- [ ] **Step 2:** Rodar `corepack pnpm vitest run --project unit src/modules/clinics/modules.test.ts`. Esperado: FAIL (módulo não existe).
- [ ] **Step 3:** Implementar `modules.ts` com os valores das Global Constraints.
- [ ] **Step 4:** Rodar de novo. Esperado: PASS.
- [ ] **Step 5:** Commit `feat(clinicas): catálogo de módulos por clínica`.

### Task 2: Migração 0027 e schema

**Files:**
- Modify: `src/db/schema/clinic.ts`, nas colunas de `clinics` em torno das linhas 182-211 e na check `clinics_loyalty_check`.
- Create: `drizzle/0027_clinic_modules.sql` e o snapshot e o journal em `drizzle/meta/`, gerados.
- Modify: as fixtures e os testes que inserem as três colunas antigas (`grep -rn "online_booking_enabled\|loyalty_enabled\|anamnesis_template" tests e2e scripts`).
- Test: `tests/integration/clinic-modules-db.test.ts`

**Interfaces:**
- Produces, no schema Drizzle:
  - `clinics.modules` (`text("modules").array().notNull()` com o default dos seis).
  - `clinics.onlineBookingChoice`, `clinics.loyaltyChoice` e `clinics.anamnesisTemplateChoice`: as colunas graváveis.
  - `clinics.onlineBookingEnabled`, `clinics.loyaltyEnabled` e `clinics.anamnesisTemplate`: as colunas geradas, só de leitura (`.generatedAlwaysAs(sql\`...\`)`).

**SQL da migração, em ordem:**
1. `ALTER TABLE clinics ADD COLUMN modules text[] NOT NULL DEFAULT '{products,finance,online_booking,loyalty,anamnesis,reviews}'`, mais `CHECK (modules <@ ARRAY[...seis...]::text[])` com o nome `clinics_modules_check`.
2. Renomear `online_booking_enabled` → `online_booking_choice`, `loyalty_enabled` → `loyalty_choice` e `anamnesis_template` → `anamnesis_template_choice`. A check `clinics_loyalty_check` segue o rename por OID. Confira com `\d clinics` que ela agora cita `loyalty_choice`.
3. Adicionar as colunas geradas `STORED`:
   - `online_booking_enabled = online_booking_choice AND 'online_booking' = ANY(modules)`
   - `loyalty_enabled = loyalty_choice AND 'loyalty' = ANY(modules)`
   - `anamnesis_template = CASE WHEN 'anamnesis' = ANY(modules) THEN anamnesis_template_choice END`
4. Grants:
   - `GRANT SELECT (modules, online_booking_enabled, loyalty_enabled, anamnesis_template) ON clinics TO app_panel, app_client`. Confira antes se `app_panel` tem `SELECT` na tabela inteira; nesse caso, só `app_client` precisa do grant por coluna.
   - `app_panel` continua com `UPDATE` só nas colunas `*_choice` de fidelidade e agendamento, que herdam o grant pelo rename. **Nenhum** grant de `UPDATE` em `modules`.
   - Confira que `app_platform` consegue `UPDATE (modules, business_type, name)`. Se não conseguir, faça o grant.

- [ ] **Step 1: Escrever os testes de integração que falham**, no padrão de `tests/integration/database-rules.test.ts` e `db-roles.test.ts`:
  - `"app_panel cannot change clinics.modules"`: o update como `app_panel` rejeita com permission denied.
  - `"rejects an unknown module"`: o update com `'{estoque}'` (como owner) viola `clinics_modules_check`.
  - `"online booking needs the module and the owner's choice"`: com `online_booking_choice = true`, tirar `online_booking` de `modules` faz `online_booking_enabled = false`, e recolocar volta a `true`.
  - `"anamnesis template is hidden while the module is off"`: com `anamnesis_template_choice = 'integrativa-ads-v1'` e sem `anamnesis` em `modules`, `anamnesis_template` é null.
  - `"client_busy_intervals returns nothing while online booking module is off"`: a função de `0014`, chamada como `app_client`, devolve 0 linhas.
  - `"app_client reads modules"`: o select como `app_client` de `modules`, `online_booking_enabled` e `loyalty_enabled` funciona.
- [ ] **Step 2:** Rodar `corepack pnpm vitest run --project integration tests/integration/clinic-modules-db.test.ts`. Esperado: FAIL.
- [ ] **Step 3:** Mudar o schema, gerar o snapshot com `--custom` e escrever o SQL acima.
- [ ] **Step 4:** Trocar as três colunas antigas por `*_choice` nos testes e fixtures que as escrevem, e no código que as **escreve** (`src/modules/clinic-page/panel.ts:75,90`, `src/modules/clinics/clinics.ts:183`). O código que só lê continua com os nomes antigos.
- [ ] **Step 5:** Rodar a suíte de integração inteira com `corepack pnpm test:integration`. Esperado: PASS.
- [ ] **Step 6:** Commit `feat(db): módulos por clínica com chaves efetivas geradas (0027)`.

### Task 3: Dados das clínicas (criar, editar, sessão)

**Files:**
- Modify: `src/modules/clinics/clinics.ts`, `src/modules/clinics/fields.ts`, `src/modules/clinic-page/panel.ts` (as leituras do formulário de "Minha página" e da fidelidade: linhas 50-51 e 299)
- Test: `tests/integration/clinic-modules.test.ts` e `src/modules/clinics/fields.test.ts` (criar se não existir)

**Interfaces:**
- Consumes: `modulesSchema` e `ClinicModule` (Task 1); as colunas da Task 2.
- Produces:
  - `ClinicSummary` ganha `modules: ClinicModule[]`.
  - `clinicFormSchema` ganha `modules` e `businessType` (enum `BUSINESS_TYPES`, com default `"clinic"`). O formulário de criação manda os dois.
  - `clinicEditSchema = { name, businessType, modules }`, sem slug.
  - `updateClinic(id: string, values: ClinicEditValues, actorUserId: string): Promise<ClinicResult>`: grava como `app_platform` e registra em `audit_logs` a ação `clinic.updated`, com o antes e o depois de `modules` e `businessType`.
  - `getClinicForEdit(id): Promise<{ id; slug; name; businessType; modules } | null>`
  - `getPageSettings` (`panel.ts`) passa a devolver `onlineBookingEnabled` e `loyaltyEnabled` lidos de `*_choice`. A forma devolvida não muda, para não mexer no formulário.

- [ ] **Step 1: Escrever os testes que falham**
  - Unidade: `clinicEditSchema.safeParse({ name:"X", businessType:"nail_salon", modules:[] }).success === true` e `clinicEditSchema` sem `slug` em `shape`.
  - Integração `"createClinic stores the chosen modules and type"`: criar com `modules:["finance"]` e `businessType:"nail_salon"`; `getClinic` devolve os dois.
  - Integração `"updateClinic changes modules and type and audits it"`: depois do update, uma linha em `audit_logs` com `action = 'clinic.updated'`.
  - Integração `"saving the page keeps the owner's online booking choice while the module is off"`: com `online_booking_choice = true` e o módulo desligado, `getPageSettings(...).onlineBookingEnabled === true`. Depois de salvar a página com os mesmos valores, `online_booking_choice` continua `true`.
- [ ] **Step 2:** Rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar os testes. Esperado: PASS. Rodar também `corepack pnpm typecheck`.
- [ ] **Step 5:** Commit `feat(clinicas): root escolhe módulos e tipo ao criar e editar`.

### Task 4: Telas do root

**Files:**
- Modify: `src/app/admin/(root)/clinicas/clinic-form.tsx`, `actions.ts` e `page.tsx` (botão "Editar" por clínica, `href /admin/clinicas/${id}`)
- Create:
  - `src/app/admin/(root)/clinicas/[id]/page.tsx`
  - `src/app/admin/(root)/clinicas/modules-fieldset.tsx`: checkboxes com os rótulos de `CLINIC_MODULE_LABELS` e `<fieldset><legend>Módulos</legend>`, compartilhado pela criação e pela edição.
  - `src/app/admin/(root)/clinicas/[id]/clinic-edit-form.tsx`

**Interfaces:**
- Consumes: `createClinic`, `updateClinic`, `getClinicForEdit`, `clinicEditSchema` (Task 3); `BUSINESS_TYPES` e `BUSINESS_TYPE_LABELS` de `@/modules/business-type/vocabulary`.
- Produces: `updateClinicAction(id: string, input: ClinicEditInput): Promise<ClinicSaveResult>`, que chama `requireRoot()` e valida `id` com `z.uuid()`.

**Requisitos:**
- Na criação, os seis checkboxes vêm marcados, e o tipo vem com "Clínica".
- O tipo de negócio é um `<select>` com o rótulo "Tipo de negócio".
- A edição mostra o endereço só como texto ("Endereço: /karol-pacheco, não muda aqui").
- Depois de salvar: "Alterações salvas." e `router.refresh()`.
- Um `id` inexistente dá `notFound()`.

- [ ] **Step 1:** Implementar as telas e a action.
- [ ] **Step 2:** Verificar no navegador (skill `run`, ou `corepack pnpm dev`): criar uma clínica com Produtos desmarcado e editar o tipo de outra.
- [ ] **Step 3:** Rodar `corepack pnpm lint` e `corepack pnpm typecheck`. Esperado: sem erros.
- [ ] **Step 4:** Commit `feat(root): módulos e tipo de negócio na tela de clínicas`. O e2e fica na Task 6.

### Task 5: O módulo desligado some do painel e da página pública

**Files:**
- Modify: `src/modules/auth/session.ts`. Adicionar `requireModule(key: ClinicModule): Promise<PanelContext>` (chama `requireAdmin()`; se `!hasModule(ctx.clinic, key)`, `notFound()`) e `moduleActive(ctx: PanelContext, key: ClinicModule): boolean`.
- Modify: `src/app/admin/(painel)/layout.tsx`. Financeiro só entra em `navItems` com `finance`.
- Create: `src/app/admin/(painel)/financeiro/layout.tsx`, que chama `await requireModule("finance")` e renderiza `children`.
- Modify: `src/app/admin/(painel)/financeiro/actions.ts`. Toda action recusa com `{ ok:false, formError: MODULE_OFF_ERROR }` quando `finance` está desligado, num helper local usado por todas.
- Modify:
  - `src/app/api/mercado-pago/conectar/route.ts`: 404 com `finance` desligado. O webhook e o retorno **continuam funcionando**, para não perder pagamentos já em andamento.
  - `src/app/admin/(painel)/agenda/[id]/page.tsx`: o bloco de pagamento só aparece com `finance`.
  - `src/app/admin/(painel)/pacientes/[id]/page.tsx`: `PatientFinance` só com `finance`; `PatientLoyalty` só com `loyalty`.
- Modify: `src/app/admin/(painel)/pagina/page.tsx` e `page-form.tsx`:
  - Sem `online_booking`, a chave "Agendamento online" some.
  - Sem `loyalty`, o bloco de fidelidade some.
  - Sem `products`, o link para Produtos some.
  - Sem `reviews`, o link para Avaliações some.
- Modify:
  - `src/app/admin/(painel)/pagina/produtos/page.tsx`: `requireModule("products")`.
  - `src/app/admin/(painel)/pagina/avaliacoes/page.tsx`: `requireModule("reviews")`.
  - `src/app/admin/(painel)/pagina/actions.ts`: as actions de produto recusam sem `products`, as de avaliação sem `reviews` e as de fidelidade (`saveLoyaltyAction`, `redeemLoyaltyAction`) sem `loyalty`.
- Modify: `src/modules/clinic-page/public.ts`:
  - Selecionar `modules`.
  - Sem `products`, `products: []`.
  - Sem `reviews`, `reviews: []` e `reviewSummary: { average: null, total: 0 }`, e as consultas de avaliação nem rodam.
  - Expor `modules` em `ClinicPage`.
- Modify: `src/app/[slug]/home/tabs.tsx` e `sections.tsx`. As abas Produtos e Avaliações não aparecem quando a lista vem vazia por módulo desligado; use `page.modules`, não o tamanho da lista.
- Modify: `src/app/[slug]/avaliar/page.tsx` (`notFound()` sem `reviews`) e `actions.ts` (recusa com `MODULE_OFF_ERROR`).
- Test: `tests/integration/clinic-modules.test.ts`, que estende o da Task 3.

Agendamento online, fidelidade e anamnese não precisam de código aqui, porque as colunas geradas da Task 2 já resolvem. Basta conferir que os testes atuais de `booking` e `anamnesis` continuam passando.

- [ ] **Step 1: Escrever os testes de integração que falham**
  - `"public page hides products and reviews while their modules are off"`: `getClinicPage(slug)` devolve `products: []`, `reviews: []` e `modules` sem os dois.
  - `"client cannot submit a review while reviews module is off"`: `submitReview`, ou a função de módulo que ele chama, recusa. Se a action depender de cookies, teste a função de `src/modules/clinic-page` e a recusa na action fica no e2e.
- [ ] **Step 2:** Rodar. Esperado: FAIL.
- [ ] **Step 3:** Implementar a lista de arquivos acima.
- [ ] **Step 4:** Rodar `corepack pnpm test:integration`, `corepack pnpm test:unit`, `corepack pnpm lint` e `corepack pnpm typecheck`. Esperado: PASS e sem erros.
- [ ] **Step 5:** Commit `feat(painel): módulo desligado some do painel e da página`.

### Task 6: e2e

**Files:**
- Modify: `e2e/clinics.spec.ts`, na sequência serial que já cria "Studio Fictício de Unhas".

- [ ] **Step 1: Escrever os testes**
  - `"creates a clinic without Produtos and Financeiro"`: desmarcar "Produtos" e "Financeiro", escolher "Manicure" e criar.
  - `"the panel of that clinic hides the turned-off modules"`: abrir o painel. Não aparece o link "Financeiro" no menu, e o item de pessoas diz "Clientes". `page.goto("/admin/financeiro")` mostra a página 404 (`not-found.tsx` do painel). `/admin/pagina/produtos` também dá 404.
  - `"root turns Financeiro back on from the edit page"`: voltar a `/admin/clinicas`, clicar em "Editar" da clínica, marcar "Financeiro", salvar ("Alterações salvas."), abrir o painel e ver o link "Financeiro".
  - Na limpeza de `afterAll`, nada muda: a clínica nova não ganha tabelas novas.
- [ ] **Step 2:** Rodar `corepack pnpm playwright test e2e/clinics.spec.ts`. Esperado: PASS. É preciso o `pnpm.cmd` no PATH (`@corepack pnpm %*`) e o Postgres no Docker.
- [ ] **Step 3:** Rodar a suíte e2e inteira em background (`corepack pnpm test:e2e`). Esperado: PASS, salvo o aviso antigo de lint, que já é conhecido.
- [ ] **Step 4:** Commit `test(e2e): root escolhe módulos da clínica`.

### Task 7: PR

- [ ] Fazer o push do branch e abrir o PR com `gh pr create --base main`. Título: `feat: módulos por clínica e tipo de negócio na tela do root`. Corpo:
  - o que muda e o que não muda (nada é apagado; as clínicas existentes ficam com tudo ligado);
  - o passo manual depois do deploy: o root muda a Karol para Manicure e desmarca Produtos;
  - os resultados dos testes;
  - a linha de atribuição.
