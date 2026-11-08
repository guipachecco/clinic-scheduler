# Página da Zemana — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "Site em construção" at `/` with a playful animated Zemana landing page (pencil scribbling a paper agenda, a giant X, "PROBLEMA RESOLVIDO", the app), a WhatsApp quote button, and a client entry: `/entrar` → "Suas clínicas" listing the clinics where she has a record.

**Architecture:**
- **Database:** a new definer function lists a user's clinics.
- **Client pages:** global client auth pages reuse the existing per-clinic forms.
- **Landing:** `/` is a static server page; the scroll story and the header's session switch are client islands, using the `motion` package only on `/`.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before routing, metadata or `next/og` code), React 19, Tailwind, Motion (`motion` package), Better Auth, Drizzle, PostgreSQL, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-08-pagina-zemana-design.md` (including "Detalhes decididos depois da revisão"). Visual reference: https://phin.helenadang.work/.

## Global Constraints

- **Copy and comments:** UI copy pt-BR, playful, youthful; code comments in English.
- **Icons:** no emojis anywhere. Icons are stroke SVGs (`fill="none" stroke="currentColor" stroke-width="1.8"`, `aria-hidden="true"`).
- **Brand:**
  - colours: purple `#2a0081`, yellow `#f5c700`, pink `#ffd3f0`, light blue `#b7e7fc`;
  - fonts: Bricolage Grotesque for headings (`font-heading`) and Figtree for text;
  - logos are in `public/marca/` (rendered via `BrandImage`).
- **Quote:** quote link exactly `https://wa.me/5547991037244?text=` + `encodeURIComponent("Oi! Vi o site da Zemana e quero um orçamento para minha clínica.")`, opening in a new tab with `rel="noopener noreferrer"`.
- **Do not promise:** no automatic WhatsApp reminders, no app-store app, no online payments, no prices.
- **Mobile first:** 360 px with no horizontal scroll. Nothing depends on hover.
- **Reduced motion:** `prefers-reduced-motion: reduce` shows every scene static and readable.
- **Dependencies and data:** `motion` is the only new dependency and is imported only by `/` client components. `/` does no server DB query.
- **Dark theme:** it changes only neutral surfaces (header, footer, auth pages, "Suas clínicas"). The story sections keep the brand colours in both themes, with readable contrast.
- **Reserved slugs:** add `esqueci-senha`, `nova-senha` and `minhas-clinicas` to `RESERVED_SLUGS` (`entrar` is already there). Production was checked on 2026-11-08 and has no conflicts.
- **Shell and tests:**
  - `pnpm` is not on PATH: use `npx` with `C:\Program Files\nodejs` first on PATH. Install the dependency with `corepack pnpm add motion` so `pnpm-lock.yaml` stays in sync.
  - Playwright needs a pnpm shim on PATH (a scratch folder with `pnpm.cmd` = `@corepack pnpm %*`) and Docker PostgreSQL on 5432.
  - `playwright.config.ts` forces `MAILERSEND_API_KEY` empty; keep it.
- **Commits:**
  - Use `git -c user.name="Guilherme" -c user.email="pachecaddass@gmail.com" commit`, with a pt-BR message and the trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Commit only your task's files; never `git stash`; never run prettier on whole directories.

## Review Focus

1. **A client of clinic A and of clinic B, plus another user in clinic C.** "Suas clínicas" shows A and B only, never C, never an inactive clinic, and never an anonymized record's clinic. Pinned in Task 1's integration test and Task 2's e2e.
2. **An owner or root using `/entrar`.** They are told to use the panel (link to `/admin/entrar`), and an already-signed-in owner is redirected to `/admin`. Pinned in Task 2.
3. **"Esqueci minha senha" from the Zemana page.**
   - A client gets an e-mail whose link is `/nova-senha?token=…` with subject "Troque sua senha da Zemana".
   - A panel account gets nothing, with the same on-screen answer.
   - Requests from a clinic link are unchanged.

   Pinned in Task 2.
4. **A 360 px phone with reduced motion.** The whole story is readable, there is no horizontal scroll, and the quote button is present and correct. Pinned in Task 4.
5. **The landing page when the database is unavailable.** `/` still renders, because it does no server DB query, and the header shows "Entrar". Pinned in Task 3 by a static-render check (the build marks `/` as static, `○` in the `next build` output) plus e2e.

---

### Task 1: `client_my_clinics` function and module

**Files:**
- Create: `drizzle/0019_client_my_clinics.sql` (with a journal entry and snapshot, made the way 0018 was: `npx drizzle-kit generate --custom --name client_my_clinics`, then the SQL)
- Create: `src/modules/clients/my-clinics.ts`
- Test: `tests/integration/my-clinics.test.ts`

**Interfaces:**
- Produces:
  - **SQL:** `client_my_clinics(p_user uuid) RETURNS TABLE(slug text, name text, area_label text, has_photo boolean)`.
    - It is `STABLE SECURITY DEFINER`, with `SET search_path = public, pg_temp`, `REVOKE ALL ... FROM PUBLIC` and `GRANT EXECUTE ... TO app_client`.
    - It returns active clinics (`is_active`) that have a `patients` row with `user_id = p_user` and `anonymized_at IS NULL`. Provisional rows count.
    - `name` = `coalesce(display_name, name)`; `has_photo` = `owner_photo_media_id IS NOT NULL`.
    - Rows are distinct per clinic and ordered by `name`.
  - **TS:** `export type MyClinic = { slug: string; name: string; areaLabel: string | null; hasPhoto: boolean }` and `export async function listMyClinics(userId: string): Promise<MyClinic[]>`.
    - It uses `clientDb.execute` with no settings needed, like `client_context` in `src/modules/clients/context.ts`.
    - It returns `[]` for a non-UUID id or the nil UUID.
    - The file imports `"server-only"`.

- [ ] **Step 1: Write the failing integration test** `tests/integration/my-clinics.test.ts` in the fixture style of `tests/integration/client-access.test.ts`, with fictitious e-mails `@minhas-clinicas.example.test` and scoped cleanup.
  - **Setup:** user U has patient rows in clinic A and clinic B (B with `display_name`); user V has a row in clinic C; U also has an anonymized row (user_id cleared) in clinic D, and a row in clinic E that is inactive.
  - `it("lists only the user's active clinics, by name")`: `listMyClinics(U)` → the slugs of A and B, in name order, with B's display name.
  - `it("never returns another user's clinics")`: no C in U's list; `listMyClinics(V)` → only C.
  - `it("ignores anonymized records and inactive clinics")`: no D or E.
  - `it("returns nothing for an unknown or malformed id")`: `listMyClinics(randomUUID())` → `[]`; `listMyClinics("x")` → `[]`.
  - `it("is executable only by app_client")`: as `app_panel` (through `inClinic`), `select * from client_my_clinics(...)` rejects with 42501.
- [ ] **Step 2: Run it and see it fail.** Run `npx vitest run tests/integration/my-clinics.test.ts`.
- [ ] **Step 3: Implement the migration and the module.**
  - Update `tests/integration/client-access.test.ts` if it keeps an allowlist of definer functions reachable by `app_client`.
- [ ] **Step 4: Run** `npx vitest run tests/integration/my-clinics.test.ts tests/integration/client-access.test.ts tests/integration/db-roles.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: lista das clínicas da cliente no banco`.

---

### Task 2: Global client pages — `/entrar`, `/minhas-clinicas`, `/esqueci-senha`, `/nova-senha`

**Files:**
- Create: `src/app/(zemana)/entrar/page.tsx`, `src/app/(zemana)/minhas-clinicas/page.tsx`, `src/app/(zemana)/esqueci-senha/page.tsx`, `src/app/(zemana)/nova-senha/page.tsx` and a shared `src/app/(zemana)/auth-shell.tsx` (Zemana header, brand card, theme toggle). The route group keeps `/` free for Task 3; adapt it if Next 16 conventions require.
- Modify:
  - `src/modules/clinics/fields.ts` (`RESERVED_SLUGS`);
  - `src/modules/clients/auth-emails.ts` (reset e-mail in Zemana mode);
  - `src/modules/email/templates.ts` (`resetPasswordEmail` without a clinic: subject exactly "Troque sua senha da Zemana");
  - the existing forms in `src/app/[slug]/entrar/login-form.tsx`, `esqueci-senha/forgot-form.tsx` and `nova-senha/new-password-form.tsx`, generalized with props so both places reuse them, without duplicating markup.
- Test: `e2e/zemana-entrar.spec.ts`; a unit test for `resetPasswordEmail` without a clinic, next to the existing template tests or in a new `src/modules/email/templates.test.ts`.

**Interfaces:**
- Consumes: `listMyClinics` and `MyClinic` (Task 1); `getClientUser` and `safeNext` (`src/modules/clients/session.ts` and `safe-next.ts`); `authClient` (`src/lib/auth-client.ts`).
- Produces:
  - **`/entrar`:**
    - e-mail, password and "Esqueci minha senha" (to `/esqueci-senha`), plus the link "É profissional? Entre no painel" to `/admin/entrar`;
    - on success it goes to `/minhas-clinicas`;
    - a two-factor (panel) account gets the message "Essa conta entra pelo painel." with the panel link;
    - an already signed-in client is redirected to `/minhas-clinicas`, and an already signed-in admin or root to `/admin`.
  - **`/minhas-clinicas`:**
    - it requires a signed-in client, else redirects to `/entrar`; an admin or root is redirected to `/admin`;
    - the title is "Suas clínicas";
    - one card per `MyClinic`: photo `/<slug>/foto` when `hasPhoto`, else initials; name; `areaLabel`; buttons "Agendar" (`/<slug>/marcar`) and "Meus horários" (`/<slug>/meus-horarios`);
    - empty state exactly "Você ainda não é cliente de nenhuma clínica. Peça o link para a sua profissional.";
    - a sign-out button.
  - **`/esqueci-senha`:** it calls the reset request with `redirectTo: "/nova-senha"` and shows the same neutral confirmation as the clinic version.
  - **`/nova-senha?token=`:** it sets the new password and then links to `/entrar`.
  - **Reset e-mail:** when the callback is exactly `/nova-senha` and the user role is `client`, the e-mail link is `${baseUrl}/nova-senha?token=<encoded>`, using the template without a clinic. Panel accounts still get nothing. The clinic-callback behaviour is unchanged.

- [ ] **Step 1: Write the tests.**
  - **Unit:** `resetPasswordEmail({ baseUrl, url, userName, clinicName: null })` has subject "Troque sua senha da Zemana" and no clinic name in the text.
  - **E2E** `e2e/zemana-entrar.spec.ts`, seeding through the owner db in the existing fixture style; the client is verified and has records in two seeded clinics, and one other clinic belongs to another user:
    - `test("client signs in at /entrar and sees only her clinics")`: the cards show both clinic names; the other clinic is absent; "Agendar" links to `/<slug>/marcar`.
    - `test("client without clinics sees the empty message")`.
    - `test("panel account is sent to the panel")`: sign in with an existing e2e admin account → the message "Essa conta entra pelo painel." and a link to `/admin/entrar`.
    - `test("forgot password from Zemana e-mails a /nova-senha link")`: request a reset for the client; the outbox e-mail subject is "Troque sua senha da Zemana" and the link matches `/nova-senha?token=`; following it lets her set a new password and sign in at `/entrar`.
    - `test("reserved paths are not clinics")`: `/minhas-clinicas` without a session redirects to `/entrar` and is not a 404 clinic page.
- [ ] **Step 2: Run and see them fail.** Run `npx vitest run src/modules/email` and `npx playwright test e2e/zemana-entrar.spec.ts`.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx playwright test e2e/zemana-entrar.spec.ts e2e/client-area.spec.ts e2e/admin-auth.spec.ts`, plus `npx vitest run src/modules tests/integration/client-accounts.test.ts`. Expected: PASS, with the existing clinic login and reset flows unchanged.
- [ ] **Step 5: Commit** — `feat: entrar pela Zemana e ver suas clínicas`.

---

### Task 3: Landing page — static sections, header island, metadata, OG image

**Files:**
- Modify: `src/app/page.tsx` (it becomes the landing page and server-renders static content only), `package.json` and `pnpm-lock.yaml` (`motion`)
- Create: `src/app/landing/` components: `site-header.tsx` (client island: "Entrar" by default, "Suas clínicas" when `authClient.useSession()` returns a client), `hero.tsx`, `features.tsx`, `final-cta.tsx`, `site-footer.tsx`, `quote-link.ts`. Also `src/app/opengraph-image.tsx` (`next/og`: yellow background, Zemana symbol, headline).
- Test: `e2e/landing.spec.ts`

**Interfaces:**
- Produces:
  - `export const QUOTE_URL: string` in `quote-link.ts`, the exact URL from Global Constraints.
  - `<StoryPlaceholder />`: a slot in `page.tsx` between the hero and the features, filled by Task 4 with `<ScrollStory />`.
  - Section content, per the spec's steps 1, 5, 6 and 7:
    - **Hero:** a giant headline in the spirit of "SUA AGENDA, SEM BAGUNÇA.", a light logo bounce (Motion, disabled under reduced motion) and the "Quero um orçamento" button.
    - **Features:** 3 or 4 tilted colour cards — agendamento online pelo link da clínica; agenda e fichas das clientes; financeiro; página da clínica com avaliações e fidelidade.
    - **Final call:** "Bora organizar sua agenda?" and the quote button.
    - **Footer:** "Sou cliente, quero entrar" linking to `/entrar`.
  - **Metadata:** title "Zemana — agenda online para profissionais de beleza e saúde", a short description, and Open Graph using the generated image.

- [ ] **Step 1: Write the e2e** `e2e/landing.spec.ts`, at 360×800:
  - `test("landing replaces the placeholder")`: "Site em construção" has count 0, and an `h1` is visible.
  - `test("quote buttons open the WhatsApp with the message")`: every link named "Quero um orçamento" has an `href` equal to the expected URL, `target="_blank"` and `rel` containing `noopener`.
  - `test("header shows Entrar signed out and Suas clínicas for a signed-in client")`.
  - `test("footer links clients to /entrar")`.
  - `test("no horizontal scroll at 360 px")`: `scrollWidth <= 360`.
  - `test("features promise only what exists")`: the page text has none of "lembrete automático", "pagamento online" or "App Store".
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.** Install `motion`. Keep `/` free of server DB calls. Update any test that asserted "Site em construção".
- [ ] **Step 4: Run** `npx playwright test e2e/landing.spec.ts e2e/site.spec.ts`, plus `npx next build` once, confirming the `next build` output marks `/` as static (`○`). Expected: PASS.
- [ ] **Step 5: Commit** — `feat: página da Zemana`.

---

### Task 4: Scroll story — pencil, scribbles, X, stamp, phone

**Files:**
- Create: `src/app/landing/scroll-story.tsx` (client) and focused subcomponents under `src/app/landing/story/` (`paper-agenda.tsx`, `pencil.tsx`, `big-x.tsx`, `stamp.tsx`, `phone-app.tsx`)
- Modify: `src/app/page.tsx` (replace `<StoryPlaceholder />` with `<ScrollStory />`)
- Test: extend `e2e/landing.spec.ts`

**Interfaces:**
- Consumes: the Task 3 page layout and `QUOTE_URL` if needed.
- Produces: `<ScrollStory />`. A sticky stage pinned while its tall section scrolls, driven by `useScroll({ target })` and `useTransform`.
  1. **The paper agenda:** drawn in SVG, it fills progressively. Handwritten entries (e.g. "Ana 14h", "Bia 14h??", "remarcar", arrows and strike-throughs) are drawn as SVG paths whose `pathLength` follows scroll, with the pencil following the current stroke. A post-it drops in, and a phone buzzes "tem horário amanhã?".
  2. **The X:** at about 70 % of the section, a giant X is drawn corner to corner across the stage.
  3. **The stamp:** a tilted "PROBLEMA RESOLVIDO" stamp springs in.
  4. **The phone:** the paper slides out and a phone springs in, showing a clean, illustrative clinic page and agenda (stylized shapes in brand colours, not real data).
  - The scene text stays real DOM text, not text baked into paths, so screen readers and tests can read it.
  - **Reduced motion** (`useReducedMotion()`): render the final readable states stacked vertically (filled agenda, X, stamp, phone) with no scroll-linked transforms.

- [ ] **Step 1: Extend the e2e:**
  - `test("story shows the X and the stamp after scrolling")`: scroll the story section into the end; "PROBLEMA RESOLVIDO" is visible.
  - `test("reduced motion shows every scene statically")`: with `page.emulateMedia({ reducedMotion: "reduce" })`, without scrolling interactions, the texts "Ana 14h", "PROBLEMA RESOLVIDO" and the phone scene label are all present and visible after scrolling into view; there is no horizontal scroll at 360 px.
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.** Keep the bundle lean: SVG only, no images. Use `will-change` sparingly, and make sure scrolling stays smooth on a mid-range phone (no layout-thrashing reads in scroll handlers; Motion values only).
- [ ] **Step 4: Run** `npx playwright test e2e/landing.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: história do lápis e do X na página da Zemana`.

---

### Task 5: Verification and docs

- [ ] **Step 1:** Run `npx eslint . --max-warnings=0`, `npx tsc --noEmit`, `npx vitest run` and the full `npx playwright test`. Expected: all pass.
- [ ] **Step 2:** Add one short README sentence (pt-BR, repo style) on the Zemana page, `/entrar` and "Suas clínicas". Commit — `docs: página da Zemana`.
