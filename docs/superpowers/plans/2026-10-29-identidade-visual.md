# Identidade visual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved Grais identity (colors, fonts, logos, panel navigation, access screens) to the existing Next.js app without changing behavior.

**Architecture:** Colors live as CSS variables in `src/app/globals.css`, which shadcn/ui components already consume; one new `highlight` token holds the yellow. Fonts are self-hosted npm packages. The panel layout gains a server-rendered sidebar whose items come from a small list of existing routes.

**Tech Stack:** Next.js 16 App Router, Tailwind CSS 4, shadcn/ui, Playwright, Vitest, pnpm (via `corepack pnpm`).

**Spec:** `docs/identidade-visual.md`

## Global Constraints

- Colors exactly: primary `#00357A`, primary pressed `#00245A`, highlight `#FFDE59` with foreground `#00357A`, background `#F7F5F8`, card `#FFFFFF`, border `#E4DFE8`, input border `#C9C2CF`, foreground `#1C1A22`, muted foreground `#5E5868`, muted/secondary/accent surface `#EEEBF0`, destructive `#B3261E`.
- Yellow is never text on a light background.
- Fonts: `@fontsource-variable/archivo` (headings, `font-heading`) and `@fontsource-variable/figtree` (body, `font-sans`). No request to any external host; `src/lib/csp.ts` stays unchanged.
- Buttons and inputs 44 px tall by default (`h-11`); radius stays `--radius: 0.625rem`.
- Visible copy and labels used by `e2e/*.spec.ts` stay identical ("Entrar", "Entrar no painel", "Verificar", "Sair", "Olá, …").
- No commits without the user's authorization: each task ends with a stopped, uncommitted working tree.

## Review Focus

- Phone width (390 px): panel nav must not overflow horizontally; it scrolls in its own row. Test: e2e at 390×844 asserts `document.documentElement.scrollWidth <= 390` on `/admin`.
- Fonts must load from the app's own origin with no CSP violation. Test: e2e asserts no console CSP messages on `/admin/entrar` and that a font request URL starts with the app origin.
- Keyboard users must see focus on navy and on yellow surfaces: focus ring on the sidebar is white with a navy offset (and `--ring` navy elsewhere). Checked visually (no automated test).
- The current page in the nav is announced: the active link has `aria-current="page"`. Test: e2e asserts it on "Início".
- The favicon resolves. Test: e2e `GET /icon.png` returns 200 with `image/png`.

---

### Task 1: Tokens, fonts, logos and favicon

**Files:**

- Modify: `package.json`, `pnpm-lock.yaml` (via `corepack pnpm add @fontsource-variable/archivo @fontsource-variable/figtree`)
- Modify: `src/app/globals.css`, `src/app/layout.tsx`
- Create: `public/marca/logo-marinho.png`, `logo-preto.png`, `simbolo-marinho.png`, `simbolo-preto.png` (from the user's zip: 2, 1, 3, 4)
- Create: `src/app/icon.png`, `src/app/apple-icon.png` (copies of `simbolo-marinho.png`)
- Modify: `src/components/ui/button.tsx` (sizes: default `h-11 px-5 text-[15px] font-semibold`, sm `h-9`, lg `h-12`, icon `size-11`), `src/components/ui/input.tsx` (`h-11`, white background, `border-input`), `src/components/ui/card.tsx` (`rounded-2xl`, `shadow-none`)
- Test: `e2e/site.spec.ts`

**Interfaces:**

- Produces: Tailwind utilities `bg-highlight`, `text-highlight-foreground`, `font-heading`, `font-sans`; static files under `/marca/*.png`.

- [ ] **Step 1: Write the failing test** in `e2e/site.spec.ts`: `test("site icon is served")` → `request.get("/icon.png")` has status 200 and `content-type` `image/png`.
- [ ] **Step 2: Run** `corepack pnpm test:e2e -g "site icon"`. Expected: FAIL (404).
- [ ] **Step 3: Implement.** Add the packages; import both in `src/app/layout.tsx`; in `globals.css` set the colors above, add `--highlight`/`--highlight-foreground` and map them in `@theme inline`, set `--font-sans: "Figtree Variable", system-ui, sans-serif` and `--font-heading: "Archivo Variable", system-ui, sans-serif`, and give `h1, h2, h3` the heading font in `@layer base`. Copy the logos and icons. Update the three ui components.
- [ ] **Step 4: Run** `corepack pnpm test:e2e`, `corepack pnpm lint`, `corepack pnpm typecheck`. Expected: all pass.

### Task 2: Panel shell with navigation

**Files:**

- Create: `src/app/admin/(painel)/panel-nav.tsx` (client component; needs `usePathname`)
- Modify: `src/app/admin/(painel)/layout.tsx`, `src/app/admin/(painel)/sign-out-button.tsx` (variant for the dark sidebar)
- Test: `e2e/admin-auth.spec.ts`

**Interfaces:**

- Consumes: `bg-highlight`, `font-heading`, `/marca/simbolo-marinho.png` from Task 1.
- Produces: `PanelNav({ items }: { items: { href: Route; label: string }[] })`; the layout passes `[{ href: "/admin", label: "Início" }]`.

- [ ] **Step 1: Write the failing test.** In the existing login-with-2FA test, after the "Olá" heading: `page.getByRole("navigation", { name: "Menu principal" })` is visible and its link "Início" has `aria-current="page"`. New test at viewport 390×844 on `/admin` (logged in via the same helper): `scrollWidth <= 390`.
- [ ] **Step 2: Run** `corepack pnpm test:e2e -g "painel"`. Expected: FAIL (no navigation landmark).
- [ ] **Step 3: Implement.** From `md` up: a 240 px navy sidebar (symbol 48 px, "GRAIS" in `font-heading`, "SAÚDE INTEGRATIVA" in tracked capitals, link list, user name and the sign-out button at the bottom). Below `md`: a navy top bar with the same brand and a horizontally scrollable link row. Active link: `bg-highlight text-highlight-foreground font-semibold`. Main area on the `#F7F5F8` background.
- [ ] **Step 4: Run** `corepack pnpm test:e2e`, `lint`, `typecheck`. Expected: all pass.

### Task 3: Access screens (login, code, 2FA setup)

**Files:**

- Modify: `src/app/admin/(acesso)/layout.tsx`, `src/app/page.tsx` (logo above the existing heading), `src/app/not-found.tsx` and `src/app/error.tsx` only if headings need `font-heading`
- Test: `e2e/admin-auth.spec.ts`

**Interfaces:**

- Consumes: `/marca/logo-marinho.png`, Card from Task 1.

- [ ] **Step 1: Write the failing test.** On `/admin/entrar`: `getByRole("img", { name: "Grais Saúde Integrativa" })` is visible; collect console messages and assert none contains "Content Security Policy"; assert some response URL matching `/\.woff2/` starts with the page's origin.
- [ ] **Step 2: Run** `corepack pnpm test:e2e -g "entrar"`. Expected: FAIL (no logo image).
- [ ] **Step 3: Implement.** Navy full-height background; logo (`next/image`, 200 px, `preload`, alt "Grais Saúde Integrativa") above the card; card keeps every existing title, label and button.
- [ ] **Step 4: Run** the full suite: `corepack pnpm lint`, `typecheck`, `test:unit`, `test:integration`, `test:e2e`, `build`. Expected: all pass.
- [ ] **Step 5: Update docs.** README status table and Tecnologias line mention the identity; `docs/decisoes-tecnicas.md` gets "Fontes empacotadas" replacing the system-fonts line. Leave uncommitted for the user's review.
