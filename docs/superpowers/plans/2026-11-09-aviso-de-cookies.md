# Aviso de cookies com o Zema — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faixa amarela fixa embaixo nas páginas da Zemana, com o Zema fugindo de um biscoito gigante até a pessoa clicar em "Entendi"; a escolha fica num cookie e o aviso não volta.

**Architecture:** Um componente de servidor (`CookieNotice`) lê o cookie e só renderiza a faixa cliente (`CookieNoticeBar`) quando ele não existe. A corrida em loop é CSS (`cookie-notice.css`); a saída ao clicar é `motion/react`. Montado na landing (`src/app/page.tsx`) e no layout `src/app/(zemana)/layout.tsx`.

**Tech Stack:** Next.js 16 (App Router, `cookies()` de `next/headers`), Tailwind v4, motion/react, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-09-aviso-de-cookies-design.md` (mockup aprovado: proposta A em `.superpowers/brainstorm/793-1794277468/content/aviso-cookies-v2.html`).

## Global Constraints

- Cookie: nome `aviso_cookies`, valor `ok`, `path=/; max-age=31536000; samesite=lax`, gravado por `document.cookie` (como `src/components/theme-toggle.tsx`).
- Textos exatos: título "Só cookies do bem"; frase "Usamos apenas o necessário: manter você conectada e lembrar o tema claro ou escuro. Nada de rastrear."; links "Privacidade" (`/privacidade`) e "Termos" (`/termos`); botão "Entendi".
- Região: `role="region"`, `aria-label="Aviso de cookies"`; personagens `aria-hidden`.
- Cores só da marca: `#2a0081`, `#f5c700`, `#ffd3f0`, `#b7e7fc` (iguais nos temas claro e escuro).
- Loop só sob `@media (prefers-reduced-motion: no-preference)`; com movimento reduzido, personagens parados e o clique esconde sem animar.
- 360 px sem rolagem horizontal; pista dos personagens com `pointer-events: none`.
- Não tocar em `src/app/landing/scroll-story.tsx`. Não aparece em `[slug]` nem `admin`.

## Review Focus

- Página com movimento reduzido: o clique em "Entendi" precisa esconder o aviso mesmo sem a animação de saída terminar → teste e2e com `reducedMotion: "reduce"`.
- Rolagem horizontal no celular: a dupla começa fora da tela (à esquerda) e sai pela direita → teste e2e mede `scrollWidth <= clientWidth` em 360 px.
- Cliques embaixo da pista: links/botões logo acima da faixa continuam clicáveis → coberto por `pointer-events: none` e pelos e2e existentes da landing (Task 2).
- Recarregar depois de aceitar: o HTML do servidor não traz o aviso → teste e2e recarrega e confere ausência.
- Páginas das clínicas: não mostram o aviso → teste e2e em `/privacidade` (aparece) e no painel `/admin/entrar` ou rota `[slug]` existente (não aparece).

---

### Task 1: Aviso de cookies (servidor + faixa + arte + montagem)

**Files:**
- Create: `src/app/landing/cookie-notice/cookie.ts` — constantes do cookie.
- Create: `src/app/landing/cookie-notice/cookie-notice.tsx` — componente de servidor.
- Create: `src/app/landing/cookie-notice/cookie-notice-bar.tsx` — `"use client"`, faixa + saída.
- Create: `src/app/landing/cookie-notice/characters.tsx` — `Zema()` e `BigCookie()` em SVG (desenho do mockup v2).
- Create: `src/app/landing/cookie-notice/cookie-notice.css` — keyframes da corrida.
- Modify: `src/app/page.tsx` — renderiza `<CookieNotice />` no fim.
- Modify: `src/app/(zemana)/layout.tsx` — `<>{children}<CookieNotice /></>`.
- Modify: `src/app/(zemana)/privacidade/page.tsx:119-124` — seção Cookies cita o cookie que guarda o "Entendi" do aviso.
- Test: `e2e/cookie-notice.spec.ts`

**Interfaces:**
- Produces: `COOKIE_NOTICE_COOKIE = "aviso_cookies"`, `COOKIE_NOTICE_ACCEPTED = "ok"` (de `cookie.ts`); `async function CookieNotice(): Promise<React.ReactNode>`; `function CookieNoticeBar(): React.ReactNode`.
- Consumes: `displayClass`, `TornEdge` de `src/app/landing/ui.tsx`; `@fontsource-variable/bricolage-grotesque/wdth.css` (importado pela faixa, para o `font-stretch` funcionar fora da landing).

- [ ] **Step 1: Write the failing e2e `e2e/cookie-notice.spec.ts`** (viewport 360×800)

```ts
const notice = (page: Page) => page.getByRole("region", { name: "Aviso de cookies" });

test("the cookie notice shows until Entendi and stays gone after reload", async ({ page, context }) => {
  await page.goto("/");
  await expect(notice(page)).toBeVisible();
  await expect(notice(page).getByRole("link", { name: "Privacidade" })).toHaveAttribute("href", "/privacidade");
  await expect(notice(page).getByRole("link", { name: "Termos" })).toHaveAttribute("href", "/termos");
  await notice(page).getByRole("button", { name: "Entendi" }).click();
  await expect(notice(page)).toHaveCount(0);
  expect((await context.cookies()).find((c) => c.name === "aviso_cookies")?.value).toBe("ok");
  await page.reload();
  await expect(notice(page)).toHaveCount(0);
  await page.goto("/privacidade");
  await expect(notice(page)).toHaveCount(0);
});

test("the notice shows on the Zemana pages without horizontal scroll", async ({ page }) => {
  for (const path of ["/", "/privacidade", "/entrar"]) {
    await page.goto(path);
    await expect(notice(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }
});

test("the notice does not show in the panel", async ({ page }) => {
  await page.goto("/admin/entrar");   // usar a rota de login do painel que existir
  await expect(notice(page)).toHaveCount(0);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("Entendi hides the notice", async ({ page }) => {
    await page.goto("/");
    await notice(page).getByRole("button", { name: "Entendi" }).click();
    await expect(notice(page)).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx playwright test e2e/cookie-notice.spec.ts`
Expected: FAIL — região "Aviso de cookies" não encontrada.

- [ ] **Step 3: Implement**

  - `CookieNotice`: `(await cookies()).get(COOKIE_NOTICE_COOKIE)?.value === COOKIE_NOTICE_ACCEPTED ? null : <CookieNoticeBar />`.
  - `CookieNoticeBar`: `position: fixed; inset-x-0; bottom-0; z-40`, padding inferior com `env(safe-area-inset-bottom)`. Faixa `bg-[#f5c700]` com `<TornEdge className="text-[#f5c700]" />`; texto/links/botão conforme Global Constraints; botão no estilo do `QuoteButton` (rosa, borda e sombra roxas, foco visível); no celular coluna com botão de largura total, a partir de `sm` em linha. Acima da faixa, a pista (`pointer-events-none`, `aria-hidden`) com a dupla biscoito + Zema atravessando (`left` de fora à esquerda até fora à direita, ≈6,5 s em `sm+`, ≈3,6 s no celular), a pista com `overflow-hidden` horizontal para não criar rolagem.
  - Clique: grava o cookie; com `useReducedMotion()` verdadeiro, esconde na hora; senão anima com `useAnimate` (Zema pula para a direita e sai, biscoito passa reto, faixa `y: "120%"`, ≈1 s no total) e depois esconde (estado `hidden` → retorna `null`).
  - `characters.tsx`: copiar o desenho do mockup v2 (`zemaSVG`/`cookieSVG`) para JSX, com classes `cn-leg-l`, `cn-leg-r`, `cn-arm-l`, `cn-arm-r`, `cn-bob`, `cn-sweat`, `cn-spin` usadas pelo CSS; `transform-origin` em unidades do viewBox como no mockup.
  - `cookie-notice.css`: keyframes `stride`, `swing`, `bob`, `sweat`, `roll`, `cross`, `gap` do mockup (prefixo `cn-`), aplicadas só dentro de `@media (prefers-reduced-motion: no-preference)`.
  - Privacidade: acrescentar à frase da seção Cookies "e o que lembra que você já viu o aviso de cookies".

- [ ] **Step 4: Run the test again**

Run: `npx playwright test e2e/cookie-notice.spec.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Look at it** — `next dev`, landing e `/entrar` em 360 px e desktop, claro e escuro; conferir que bate com o mockup aprovado.

- [ ] **Step 6: Commit**

```bash
git add src/app/landing/cookie-notice src/app/page.tsx "src/app/(zemana)/layout.tsx" "src/app/(zemana)/privacidade/page.tsx" e2e/cookie-notice.spec.ts docs/superpowers
git commit -m "feat: aviso de cookies com o Zema fugindo do biscoito"
```

### Task 2: Testes existentes e checagens

**Files:**
- Modify (se precisar): `e2e/landing.spec.ts`, `e2e/site.spec.ts`, `e2e/seo.spec.ts`, `e2e/zemana-entrar.spec.ts`, `e2e/branding.spec.ts`.

- [ ] **Step 1: Run** `npx playwright test e2e/landing.spec.ts e2e/site.spec.ts e2e/seo.spec.ts e2e/zemana-entrar.spec.ts e2e/branding.spec.ts e2e/cookie-notice.spec.ts`. Expected: tudo passa; onde a faixa interceptar um clique, o spec ganha `await context.addCookies([{ name: "aviso_cookies", value: "ok", url: <baseURL> }])` num `beforeEach` (não mudar o que o teste confere).
- [ ] **Step 2: Run** `npx pnpm@10.28.0 lint`, `npx pnpm@10.28.0 typecheck`, `npx pnpm@10.28.0 format:check`, `npx pnpm@10.28.0 test:unit`. Expected: tudo sem erro.
- [ ] **Step 3: Commit** `test: e2e convivem com o aviso de cookies`.
