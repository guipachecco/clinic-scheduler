# Minha página em passo a passo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O dono monta logo, foto de perfil, capa, cor, botões, fonte, texto, galeria e tipo de negócio num assistente de passos no painel, com prévia ao vivo, e tudo só vale na página pública depois de "Publicar".

**Architecture:** Rascunho em `clinics.page_draft` (jsonb), gravado passo a passo por Server Actions como `app_panel` dentro da clínica (`inClinic`). "Publicar" copia o rascunho para as colunas publicadas numa transação e limpa mídias órfãs. A página pública (`app_client`) lê só colunas publicadas e imagens por funções definer.

**Tech Stack:** Next.js 16 (ler `node_modules/next/dist/docs/` antes de escrever rotas/Server Actions), Drizzle, PostgreSQL com RLS, zod 4, sharp, vitest (unit + integration), Playwright, `@fontsource-variable/*`.

**Spec:** `docs/superpowers/specs/2026-11-11-minha-pagina-passo-a-passo-design.md`

## Global Constraints

- Um sistema só; nada específico de um cliente no código.
- Nada do rascunho aparece para `app_client`: nunca `GRANT SELECT (page_draft)` a `app_client`.
- Toda imagem enviada passa por `reencodeImage` (sem EXIF) antes de ir para `media`.
- Contraste: texto sobre a cor ≥ 4.5 (`contrastRatio`), em claro e escuro.
- Fundo do botão cheio usa a cor exatamente como escolhida.
- Clínicas existentes continuam `business_type = 'clinic'` e com paleta Zemana enquanto não escolherem cor.
- Nunca rodar prettier em pastas inteiras; só nos arquivos tocados (`pnpm exec prettier --write <arquivos>`).
- Textos da interface em português, sem jargão.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Mídia de outra clínica no rascunho (id forjado) → publicar recusa; teste em Task 4.
2. Publicar duas vezes seguidas / publicar sem rascunho → segunda vez é no-op, nada apagado; teste em Task 4.
3. Cor muito clara (`#ffff00`) ou muito escura (`#000000`) → texto do botão e links continuam legíveis nos dois temas; teste em Task 2.
4. Descartar depois de trocar o logo → o logo publicado continua e a mídia nova some; teste em Task 4.
5. Rascunho com campo inválido gravado direto no banco → página do painel abre mesmo assim (campos inválidos ignorados); teste em Task 4 (`parseDraft`).

---

### Task 1: Migração 0025 e schema

**Files:**
- Create: `drizzle/0025_page_builder.sql` (via `pnpm db:generate` e depois SQL manual de grants/funções, como em `0020_clinic_photos.sql`), snapshot e `_journal.json` gerados.
- Modify: `src/db/schema/clinic.ts` (enum, colunas, FK, `ClinicTheme`)
- Test: `tests/integration/page-builder-db.test.ts`

**Interfaces — Produces:**
- `businessType = pgEnum("business_type", ["clinic", "barbershop", "nail_salon", "other"])`
- `clinics.businessType` (not null default `clinic`), `clinics.coverMediaId` (uuid, FK composta `clinics_cover_media_fk` como a do logo), `clinics.pageDraft` (`jsonb().$type<unknown>()`, nulo).
- Check `clinics_page_draft_size_check`: `page_draft is null or pg_column_size(page_draft) <= 16384`.
- `ClinicTheme = { primaryColor?: string; buttonShape?: "pill" | "rounded" | "square"; buttonFill?: "solid" | "outline"; fontId?: FontId; paletteId?: string }` (`FontId` vem da Task 3; para não criar ciclo, declare-o como `string` aqui e restrinja no zod).
- SQL manual:
  - `GRANT UPDATE (logo_media_id, cover_media_id, business_type, page_draft, headline, about, theme, owner_photo_media_id, updated_at) ON clinics TO app_panel;`
  - `GRANT SELECT (business_type, cover_media_id, logo_media_id, theme) ON clinics TO app_client;`
  - `client_clinic_logo(p_clinic uuid)` e `client_clinic_cover(p_clinic uuid)` → `TABLE (mime_type text, data bytea)`, copiando o molde de `client_owner_photo` em `0017_clinic_page.sql` (só `c.is_active`), `REVOKE ALL ... FROM PUBLIC`, `GRANT EXECUTE ... TO app_client`.
  - Atualizar o comentário do 0011 não é preciso; comentar no 0025 por que o painel agora troca o logo.

- [ ] **Step 1: Teste que falha** em `tests/integration/page-builder-db.test.ts`, no estilo de `clinic-photos.test.ts`/`db-roles.test.ts` (ver `tests/helpers/roles.ts` para executar como um papel):
  - `it("client cannot read page_draft")`: como `app_client`, `select page_draft from clinics` → erro de permissão (`42501`).
  - `it("client reads business_type, theme, logo and cover columns")`.
  - `it("panel cannot write another clinic's page_draft")`: `inClinic(CLINIC, …)` update em `otherClinic()` → 0 linhas.
  - `it("cover must be a media of the same clinic")`: setar `cover_media_id` com mídia de `otherClinic` → violação de FK.
  - `it("client_clinic_cover returns nothing for an inactive clinic")`.
- [ ] **Step 2:** `pnpm test:integration tests/integration/page-builder-db.test.ts` → FAIL (coluna não existe).
- [ ] **Step 3:** Editar schema, `pnpm db:generate --name page_builder`, acrescentar o SQL manual ao arquivo gerado (com `--> statement-breakpoint`).
- [ ] **Step 4:** `pnpm db:migrate` (banco de testes) e rodar o teste → PASS. Rodar também `pnpm test:integration tests/integration/db-roles.test.ts` → PASS.
- [ ] **Step 5:** Commit `feat(db): rascunho da página, capa e tipo de negócio`.

### Task 2: Cor livre → paleta legível

**Files:**
- Create: `src/modules/branding/derive.ts`, `src/modules/branding/derive.test.ts`
- Modify: `src/modules/branding/contrast.ts` (exportar helpers de mistura se úteis)

**Interfaces — Produces:**
- `HEX_COLOR = /^#[0-9a-f]{6}$/` (minúsculas; normalizar entrada com `.toLowerCase()`).
- `paletteFromColor(hex: string): Palette` — `Palette` de `palettes.ts` (`id: "custom"`).
- `readableOn(hex: string): "#ffffff" | "#1c1a22"` — o de maior contraste.

Regras (todas pinadas por teste):
- `light.primary`, `light.brand` = a cor exata. `light["primary-foreground"]`, `light["brand-foreground"]` = `readableOn(cor)`.
- `light["primary-pressed"]`, `light["brand-muted"]` = cor escurecida 12% (mistura com preto).
- `light["brand-accent"]` = cor misturada 85% com branco; `light["brand-accent-foreground"]` = cor escurecida até contraste ≥ 4.5 sobre `brand-accent`.
- `light.ring` = cor escurecida até contraste ≥ 3 contra `#ffffff`.
- Para texto/contorno no tema claro adicione o token novo `"primary-text"` a `TokenName` (cor escurecida até ≥ 4.5 contra `#ffffff`; igual à cor quando já passa). Em `fromTones`/GRAIS/ZEMANA, `primary-text` = `primary` (e acrescentar `--primary-text`/`--color-primary-text` em `globals.css` com o valor da Zemana; `palettes.test.ts` confere igualdade).
- Dark: `dark.primary` e `dark["primary-text"]` = cor clareada até ≥ 4.5 contra `#0b0b10`; `dark["primary-foreground"]` = `readableOn(dark.primary)`; `dark.brand` = cor misturada 80% com `#0b0b10`; `highlight`/`highlight-foreground` copiados da Zemana.

- [ ] **Step 1: Testes que falham** em `derive.test.ts`, para `["#7a3cff", "#ffff00", "#000000", "#ffffff", "#0a7d5a", "#ff8fab"]`:
  - `light.primary === cor`
  - `contrastRatio(light.primary, light["primary-foreground"]) >= 4.5`
  - `contrastRatio(light["primary-text"], "#ffffff") >= 4.5`
  - `contrastRatio(dark["primary-text"], "#0b0b10") >= 4.5`
  - `contrastRatio(dark.primary, dark["primary-foreground"]) >= 4.5`
  - `contrastRatio(light["brand-accent"], light["brand-accent-foreground"]) >= 4.5`
  - `readableOn("#ffff00") === "#1c1a22"`, `readableOn("#000000") === "#ffffff"`.
- [ ] **Step 2:** `pnpm test:unit src/modules/branding` → FAIL.
- [ ] **Step 3:** Implementar. Escurecer/clarear em passos de 2% até atingir o alvo (no máximo até preto/branco).
- [ ] **Step 4:** `pnpm test:unit src/modules/branding` → PASS (inclui `palettes.test.ts`).
- [ ] **Step 5:** Commit `feat(branding): paleta legível a partir de qualquer cor`.

### Task 3: Fontes, botões e vocabulário por tipo de negócio

**Files:**
- Create: `src/modules/page-style/fonts.ts`, `src/modules/page-style/buttons.ts`, `src/modules/page-style/page-style.test.ts`, `src/modules/business-type/vocabulary.ts`, `src/modules/business-type/vocabulary.test.ts`
- Modify: `package.json` (+ `@fontsource-variable/playfair-display`, `@fontsource-variable/oswald`, `@fontsource-variable/quicksand`, `@fontsource-variable/dm-sans`), `pnpm-lock.yaml`
- Create: `src/app/page-fonts.ts` (só os `import "@fontsource-variable/..."`, importado pela página pública e pelo assistente)

**Interfaces — Produces:**
- `FONTS = [{ id: "bricolage", label: "Moderna", family: '"Bricolage Grotesque Variable"' }, { id: "playfair", label: "Elegante", family: '"Playfair Display Variable"' }, { id: "oswald", label: "Forte", family: '"Oswald Variable"' }, { id: "quicksand", label: "Delicada", family: '"Quicksand Variable"' }, { id: "dmsans", label: "Simples", family: '"DM Sans Variable"' }] as const`; `type FontId`; `fontFamily(id: FontId | undefined): string` (padrão `bricolage`).
- `BUTTON_SHAPES = ["pill", "rounded", "square"] as const`, `BUTTON_FILLS = ["solid", "outline"] as const`; `buttonRadius(shape): "9999px" | "0.75rem" | "0.25rem"` (padrão `pill`).
- `pageStyleVars(theme: ClinicTheme): Record<string, string>` → `{ "--font-heading": …, "--radius-button": … }`.
- `BUSINESS_TYPES = ["clinic", "barbershop", "nail_salon", "other"] as const`; `BUSINESS_TYPE_LABELS` = `{ clinic: "Clínica", barbershop: "Barbearia", nail_salon: "Manicure e estética", other: "Outro" }`.
- `vocabulary(type: BusinessType): { person: string; people: string; Person: string; People: string; newPerson: string }` — `clinic` → paciente/pacientes/"Novo paciente"; demais → cliente/clientes/"Novo cliente".
- `STARTER_STYLE: Record<BusinessType, Required<Pick<ClinicTheme, "primaryColor" | "fontId" | "buttonShape">>>` — clinic `#2f6f9f`/`dmsans`/`rounded`; barbershop `#1f1b1a`/`oswald`/`square`; nail_salon `#c2577a`/`quicksand`/`pill`; other `#7a3cff`/`bricolage`/`pill`.

- [ ] **Step 1: Testes que falham:** `fontFamily(undefined)` contém `Bricolage`; `buttonRadius("square") === "0.25rem"`; `pageStyleVars({ fontId: "oswald", buttonShape: "rounded" })` igual ao esperado; `vocabulary("barbershop").People === "Clientes"`; `vocabulary("clinic").newPerson === "Novo paciente"`; toda `STARTER_STYLE[t].primaryColor` casa `HEX_COLOR`.
- [ ] **Step 2:** `pnpm test:unit src/modules/page-style src/modules/business-type` → FAIL.
- [ ] **Step 3:** `corepack pnpm add @fontsource-variable/playfair-display @fontsource-variable/oswald @fontsource-variable/quicksand @fontsource-variable/dm-sans`; implementar.
- [ ] **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat: fontes, botões e vocabulário por tipo de negócio`.

### Task 4: Rascunho — gravar, enviar imagem, publicar, descartar

**Files:**
- Create: `src/modules/page-builder/draft.ts` (zod + merge, puro), `src/modules/page-builder/draft.test.ts`, `src/modules/page-builder/builder.ts` (`server-only`, banco), `tests/integration/page-builder.test.ts`

**Interfaces — Consumes:** Task 1 colunas; Task 3 `FONTS`, `BUTTON_*`, `BUSINESS_TYPES`; Task 2 `HEX_COLOR`.

**Interfaces — Produces (draft.ts):**
- `pageDraftSchema` (zod, todos os campos opcionais): `businessType`, `logoMediaId: uuid|null`, `ownerPhotoMediaId: uuid|null`, `coverMediaId: uuid|null`, `theme: { primaryColor?, buttonShape?, buttonFill?, fontId? }`, `headline: string(≤120)|null`, `about: string(≤2000)|null`, `gallery: uuid[] (≤ MAX_CLINIC_PHOTOS)`.
- `type PageDraft = z.infer<typeof pageDraftSchema>`
- `parseDraft(raw: unknown): PageDraft` — campos inválidos são descartados um a um (nunca lança).
- `type PublishedPage = { businessType; logoMediaId; ownerPhotoMediaId; coverMediaId; theme: ClinicTheme; headline; about; gallery: string[] }`
- `mergeDraft(published: PublishedPage, draft: PageDraft): PublishedPage` — campo ausente mantém o publicado; `theme` mescla campo a campo.
- `draftMediaIds(draft: PageDraft): string[]`.
- `STEP_IDS = ["tipo", "logo", "perfil", "capa", "cor", "botoes", "fonte", "texto", "galeria", "publicar"] as const`; `type StepId`.

**Interfaces — Produces (builder.ts), todas `(clinicId, …, actorUserId: string)` dentro de `inClinic`:**
- `getBuilderState(clinicId): Promise<{ slug: string; name: string; published: PublishedPage; draft: PageDraft; hasDraft: boolean; galleryMedia: { id: string; width: number; height: number }[] }>` — `galleryMedia` cobre publicadas + do rascunho.
- `saveDraftPatch(clinicId, patch: PageDraft): Promise<{ ok: true } | { ok: false; formError: string }>` — `select … for update`, `mergeDraft` em nível de rascunho (patch sobre rascunho atual), recusa media id que não seja da clínica.
- `uploadDraftImage(clinicId, slot: "logo" | "ownerPhoto" | "cover" | "gallery", input: { bytes: Buffer; mimeType: string }): Promise<{ ok: true; mediaId: string } | { ok: false; formError: string }>` — `reencodeImage` (logo/perfil `maxSide 800`, capa/galeria `1600`, quality 85/80), insere `media` (`kind` `logo` para logo, `photo` para o resto); para `gallery` acrescenta ao fim de `draft.gallery` (partindo da galeria publicada se ausente); para os outros grava no slot. Rascunho anterior daquele slot que não esteja publicado é apagado.
- `publishDraft(clinicId, actorUserId): Promise<{ ok: true; changed: string[] } | { ok: false; formError: string }>` — numa transação: lock da linha; `parseDraft`; conferir que todos os ids são `media` da clínica; `update clinics` (campos presentes; `theme` mesclado); reescrever `clinic_photos` conforme `gallery` (apagar linhas fora da lista, inserir novas, atualizar `position` = índice) com o mesmo advisory lock de `photos.ts`; depois apagar `media` substituídas (logo/perfil/capa antigos) e de galeria removidas, e as do rascunho não usadas; `page_draft = null`; `audit_logs` `clinic.page_published` com `changes: { fields: changed }`. Sem rascunho → `{ ok: true, changed: [] }`.
- `discardDraft(clinicId, actorUserId): Promise<{ ok: true }>` — apaga mídias de `draftMediaIds` que nenhuma coluna publicada nem `clinic_photos` referencia; `page_draft = null`; audit `clinic.page_draft_discarded`.

- [ ] **Step 1: Testes unitários que falham** (`draft.test.ts`): `parseDraft({ theme: { primaryColor: "azul" }, headline: "Oi" })` → `{ theme: {}, headline: "Oi" }`; `parseDraft("lixo")` → `{}`; `mergeDraft` mantém `logoMediaId` publicado quando ausente e troca para `null` quando `null`; `mergeDraft` mescla `theme` (`{ fontId }` + publicado `{ primaryColor }` → ambos).
- [ ] **Step 2: Testes de integração que falham** (`page-builder.test.ts`, imagens com `sharp` como em `clinic-photos.test.ts`):
  - `it("draft does not change the public page")`: upload de capa + `saveDraftPatch({ headline: "Nova" })` → `getClinicPage(slug)` igual ao de antes.
  - `it("publish copies fields, rewrites the gallery and clears the draft")`.
  - `it("publish deletes the replaced logo media")`.
  - `it("publish refuses a media id from another clinic")` (Review Focus 1).
  - `it("publishing twice is a no-op the second time")` (Review Focus 2).
  - `it("discard keeps the published logo and deletes the draft one")` (Review Focus 4).
  - `it("builder state ignores an invalid stored draft")`: gravar `page_draft = '{"theme":{"primaryColor":1}}'` direto pelo `db` dono → `getBuilderState` não lança (Review Focus 5).
  - `it("upload strips EXIF")` (molde de `clinic-photos.test.ts`).
- [ ] **Step 3:** Rodar `pnpm test:unit src/modules/page-builder` e `pnpm test:integration tests/integration/page-builder.test.ts` → FAIL.
- [ ] **Step 4:** Implementar `draft.ts` e `builder.ts`.
- [ ] **Step 5:** Rodar de novo → PASS.
- [ ] **Step 6:** Commit `feat: rascunho da página com publicar e descartar`.

### Task 5: Página pública lê o que foi publicado

**Files:**
- Modify: `src/modules/clinic-page/public.ts` (`ClinicPage` + `getClinicPage` + `getClinicLogo(slug)`, `getClinicCover(slug)`), `src/modules/clients/session.ts` ou o tipo que `requireClinic` devolve (se o layout precisar de `theme`/`hasLogo`, preferir ler de `getClinicPage` em cache)
- Create: `src/app/[slug]/logo/route.ts`, `src/app/[slug]/capa/route.ts` (molde de `src/app/[slug]/foto/route.ts`), `src/app/[slug]/page-theme.tsx`
- Modify: `src/app/[slug]/layout.tsx`, `src/app/[slug]/page.tsx` (`describe`, Open Graph, JSON-LD com capa), `src/app/[slug]/home/hero.tsx`, `src/app/[slug]/home/sections.tsx` (botão de agendar e botões principais), `src/app/globals.css` (`--radius-button` default `9999px`, `--primary-text`)
- Test: `tests/integration/clinic-page.test.ts` (acrescentar casos), `src/app/[slug]/page-theme.test.ts`

**Interfaces — Consumes:** `paletteFromColor`, `paletteCss`-like bloco; `pageStyleVars`; Task 1 funções definer.
**Interfaces — Produces:**
- `ClinicPage` ganha `theme: ClinicTheme`, `businessType: BusinessType`, `hasLogo: boolean`, `cover: { width: number; height: number } | null` (capa própria; senão o `Hero` usa `photos[0]` como hoje).
- `pageThemeCss(theme: ClinicTheme, scope: string): string` em `page-theme.tsx` — `""` sem `primaryColor`; senão `${scope}{--primary:…;…}.dark ${scope}{…}` com os tokens de `paletteFromColor`. Componente `<PageTheme theme scopeClass="clinic-page" />` que renderiza `<style>` com isso e as `pageStyleVars`.
- No layout: contêiner raiz ganha `className="clinic-page …"`; cabeçalho mostra `<img src="/<slug>/logo">` (altura 28, `alt` = nome) quando `hasLogo`, senão o `BrandImage` atual.
- Botões da página que hoje usam `rounded-full` + `bg-primary` passam a `rounded-[var(--radius-button)]`; com `buttonFill: "outline"` o botão de agendar vira `border-2 border-primary-text bg-transparent text-primary-text` (classe escolhida em `sections.tsx` a partir de `page.theme.buttonFill`). Links/abas de cor usam `text-primary-text`.

- [ ] **Step 1: Testes que falham:**
  - `page-theme.test.ts`: `pageThemeCss({}, ".clinic-page") === ""`; com `{ primaryColor: "#0a7d5a" }` contém `.clinic-page{` e `--primary:#0a7d5a`; contém `.dark .clinic-page{`.
  - `clinic-page.test.ts`: após `publishDraft` com logo e capa, `getClinicPage` → `hasLogo === true`, `cover` com dimensões, `theme.primaryColor` publicado; `getClinicLogo(slug)` devolve `image/webp`; com a clínica inativa → `null`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar → PASS; `pnpm typecheck` e `pnpm lint` → sem erros.
- [ ] **Step 5:** Commit `feat(página): logo, capa, cor, botões e fonte publicados`.

### Task 6: Assistente "Monte a cara da sua página" no painel

**Files:**
- Create: `src/app/admin/(painel)/pagina/montar/page.tsx` (server: `requireAdmin`, `getBuilderState`, lê `searchParams.passo` validado contra `STEP_IDS`), `.../montar/builder-wizard.tsx` (client), `.../montar/steps/*.tsx` (um componente por passo), `.../montar/page-preview.tsx` (client), `.../montar/actions.ts`
- Modify: `src/app/admin/(painel)/pagina/page.tsx` (cartão no topo: "Monte a cara da sua página" + `Começar` ou `Continuar rascunho`), `.../pagina/page-form.tsx` e `src/modules/clinic-page/fields.ts` / `panel.ts` (tirar `headline` e `about` do formulário, do schema e do `update`), `e2e/clinic-page-panel.spec.ts` (o teste "owner edits her page" deixa de preencher frase/sobre)

**Interfaces — Consumes:** Task 4 (`getBuilderState`, `saveDraftPatch`, `uploadDraftImage`, `publishDraft`, `discardDraft`, `STEP_IDS`, `mergeDraft`), Task 2 `paletteFromColor`, Task 3 listas.
**Interfaces — Produces (actions.ts, `"use server"`, cada uma chama `requireAdmin()` primeiro e devolve valores, nunca redirect, no molde de `pagina/actions.ts`):**
- `saveStepAction(patch: unknown): Promise<{ ok: true } | ActionFailure>` (valida com `pageDraftSchema`)
- `uploadImageAction(formData: FormData): Promise<{ ok: true; mediaId: string } | ActionFailure>` (`slot` + `file`; reaproveitar o limite de tamanho do envio de foto do dono se houver em `next.config`)
- `publishAction(): Promise<{ ok: true } | ActionFailure>`; `discardAction(): Promise<{ ok: true } | ActionFailure>`

Comportamento:
- Layout do passo (modelo A): topo "Passo N de 10 · <nome>" + barra de progresso; prévia; título em pergunta ("Qual a cor do seu negócio?"); controle; rodapé com `Voltar` e `Próximo` (no último: `Publicar` e `Descartar rascunho`). Um índice (`<details>` "Ver todos os passos") leva a qualquer passo.
- `Próximo` grava o patch do passo (`saveStepAction`) e navega para `?passo=<próximo>` com `router.push`; erro mostra `FormError` e não avança.
- Prévia (`page-preview.tsx`): recebe `PublishedPage` mesclado com o estado local e renderiza capa, foto de perfil (iniciais quando não há), nome, frase, botão "Agendar horário" com forma/preenchimento/fonte, e um `<style>` com `pageThemeCss(theme, ".page-preview")`. Imagens do rascunho via `/admin/foto/<mediaId>`.
- Passo `tipo`: 4 cartões (`BUSINESS_TYPE_LABELS`); ao escolher, o patch inclui as `STARTER_STYLE` só para campos de `theme` que nem publicado nem rascunho têm.
- Passo `cor`: 6 atalhos + `<input type="color">` + campo de texto `#rrggbb`.
- Passo `galeria`: enviar (vários), remover, subir/descer; envia `gallery` completa no patch.
- Passo `publicar`: prévia maior e lista do que mudou; `Publicar` → `publishAction` → mensagem "Página publicada." e link "Ver minha página" (`/<slug>`, nova aba).
- `requireAdmin` vale para `admin` e `root`.

- [ ] **Step 1:** Ler `node_modules/next/dist/docs/` sobre Server Actions, `searchParams` em page e envio de arquivos (limite de corpo), e anotar no commit o que mudou em relação ao Next conhecido.
- [ ] **Step 2:** Implementar actions + página + passos + prévia.
- [ ] **Step 3:** `pnpm typecheck`, `pnpm lint` → limpos; abrir o app (`pnpm dev`) no painel e percorrer os passos no tamanho de celular (preset mobile do navegador) para conferir que cada tela cabe sem rolar muito.
- [ ] **Step 4:** Commit `feat(painel): assistente para montar a página`.

### Task 7: Vocabulário no painel

**Files:**
- Modify: `src/modules/clinics/clinics.ts` (`ClinicSummary` + `businessType`, lido onde o resumo já é montado), `src/app/admin/(painel)/layout.tsx` (rótulo do menu = `vocabulary(session.clinic.businessType).People`), `src/app/admin/(painel)/pacientes/page.tsx` (título e botão novo), `src/app/admin/(painel)/pacientes/novo/page.tsx` (título)
- Test: `src/modules/business-type/vocabulary.test.ts` já cobre o mapa; e2e na Task 8.

- [ ] **Step 1:** Implementar; URLs `/admin/pacientes` não mudam.
- [ ] **Step 2:** `pnpm typecheck` e `pnpm test:unit` → PASS; rodar `pnpm test:e2e e2e/patients.spec.ts` (Grais é `clinic`, nada muda) → PASS.
- [ ] **Step 3:** Commit `feat(painel): "Clientes" para barbearia e manicure`.

### Task 8: E2E e PR

**Files:**
- Create: `e2e/page-builder.spec.ts`, fixtures de imagem geradas em tempo de teste com `sharp` (sem binários no repo)
- Modify: `e2e/test-account.ts` (`PAGE_BUILDER_CLINIC_SLUG = "barbearia-montar-pagina"` e `TEST_ADMIN_PAGE_BUILDER`), `e2e/global-setup.ts` (inserir a clínica e criar o admin, como `PANEL_HOME_CLINIC_SLUG`)

- [ ] **Step 1: Teste** `owner builds and publishes her page` (serial, molde de `clinic-page-panel.spec.ts`):
  1. Entrar com `signInWithFreshTwoFactor(page, TEST_ADMIN_PAGE_BUILDER)`; ir a `/admin/pagina`; clicar `Começar`.
  2. Passo tipo: escolher `Barbearia`; `Próximo`.
  3. Logo: `setInputFiles` com PNG gerado; prévia mostra a imagem; `Próximo`. Pular perfil.
  4. Capa: enviar JPEG; `Próximo`.
  5. Cor: preencher `#0a7d5a`; a prévia do botão tem `background-color: rgb(10, 125, 90)`; `Próximo` até `Texto`, preencher frase "Corte na régua desde 2010".
  6. Abrir `/<slug>` em outra aba: frase **não** aparece, `img[src$="/capa"]` ausente.
  7. Ir ao passo publicar, `Publicar`, ver "Página publicada.".
  8. Recarregar `/<slug>`: frase aparece; `header img[src$="/logo"]` visível; capa com `src` em `/capa`; botão "Agendar" com `rgb(10, 125, 90)`.
  9. Menu do painel mostra `Clientes`.
- [ ] **Step 2:** Rodar com o `pnpm.cmd` temporário no PATH: `pnpm test:e2e e2e/page-builder.spec.ts e2e/clinic-page-panel.spec.ts e2e/clinic-page.spec.ts` → PASS.
- [ ] **Step 3:** Suíte completa: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` → tudo PASS (relatar falhas preexistentes do CI separadamente; o conserto do CI está no PR #32).
- [ ] **Step 4:** Commit `test(e2e): dono monta e publica a página`; `git push -u origin HEAD`; `gh pr create --base main` com resumo, como testar e "🤖 Generated with [Claude Code](https://claude.com/claude-code)".
