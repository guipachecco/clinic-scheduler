# Página da clínica no celular — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The clinic link (`/<slug>`) becomes an app-like mobile page (photos placeholder, tabs, amenities, reviews, hours, payment, contacts, loyalty, products) with a faster booking flow, and the owner configures all of it in a new "Minha página" panel section, with every new rule enforced by PostgreSQL.

**Architecture:**
- **Migration and visibility:** one migration (`0017_clinic_page`) adds clinic columns and three tables (`products`, `reviews`, `loyalty_redemptions`) with grants and RLS following migrations 0011–0016. What anonymous visitors need beyond RLS (review authors, payment methods, owner photo) goes through `SECURITY DEFINER` functions executable only by `app_client`.
- **Modules:** a new `src/modules/clinic-page/` holds the zod fields, the public/client reads and writes, and the panel reads and writes.
- **Panel UI:** under `src/app/admin/(painel)/pagina/`.
- **Client UI:** `src/app/[slug]/` gets a shared icon set, a bottom nav and the redesigned pages.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before routing, Route Handler or Server Action code), Drizzle + node-postgres, PostgreSQL 17, Luxon, Zod, Vitest, Playwright, Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-07-pagina-da-clinica-design.md`

## Global Constraints

- **Language:**
  - All UI copy in Portuguese (pt-BR), feminine forms for the client ("Obrigada pela avaliação!").
  - Code comments in English, like the rest of the repo.
- **Icons:** no emojis anywhere in the UI. Icons are inline stroke SVGs in the style of `src/app/admin/(painel)/panel-nav.tsx` (24×24 viewBox, `fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`), each with `aria-hidden="true"`.
- **Visual:**
  - Keep the Zemana theme tokens from `src/app/globals.css` (`bg-background`, `bg-card`, `text-primary`, `font-heading`…).
  - Works in light and dark themes.
  - One column built for a 360 px phone, `max-w-md` centred on wider screens.
- **One professional per clinic:** there is no "choose a professional" step.
- **Database roles:**
  - Every new table with `clinic_id` gets RLS and a policy for `app_panel` keyed on `nullif(current_setting('app.clinic_id', true), '')::uuid`.
  - `app_client` never gets privileges on `payment_methods`, `media`, `patients` (beyond the existing column grant) or `audit_logs` SELECT.
  - Definer functions: `SET search_path = public, pg_temp`, `REVOKE ALL … FROM PUBLIC`, `GRANT EXECUTE … TO app_client` only, filter explicitly by clinic and require `clinics.is_active`.
- **Amenity keys:** exactly `wifi`, `estacionamento`, `acessibilidade`, `ar_condicionado`, `cafe_agua`, `banheiro`, `espaco_kids`, `aceita_pets`. Labels in that order: Wi-Fi, Estacionamento, Acessibilidade, Ar-condicionado, Café e água, Banheiro, Espaço kids, Aceita pets.
- **Reviews:**
  - Rating integer 1–5; comment optional, trimmed, ≤ 500 characters.
  - Allowed only for a signed-in client whose patient row in that clinic has at least one appointment with `status = 'completed'`.
  - Unlimited per person.
  - Hidden reviews never show and never count.
  - Public author is the first name plus the initial of the last name with a dot ("Ana Paula Souza" → "Ana S."; "Ana" → "Ana").
- **Loyalty:**
  - `loyalty_visits` 2–50 (default 10); `loyalty_reward` ≤ 120 characters, required when enabled.
  - Progress = completed appointments − visits × redemptions, clamped to ≥ 0.
  - Prize available when progress ≥ visits.
- **Products:** name 1–80, price optional (cents ≥ 0, ≤ 10 000 000), description ≤ 300. Example products: "Protetor solar FPS 50" R$ 79,90; "Hidratante facial" R$ 69,90; "Sérum de vitamina C" R$ 95,00. All active.
- **Instagram:** stored as the handle only, `^[A-Za-z0-9._]{1,30}$`; links built as `https://www.instagram.com/<handle>/`.
- **Map link:** `maps_url` must start with `https://`.
- **Shell:** `pnpm` is not on the shell PATH here. Use `npx` with Node at `C:\Program Files\nodejs` on PATH: `npx vitest run <path>`, `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npx playwright test <spec>`, and `npx drizzle-kit generate`. Docker Desktop (PostgreSQL) must be running for integration and e2e tests.
- **Commits:**
  - `git -c user.name="Guilherme" -c user.email="pachecaddass@gmail.com" commit`, message in Portuguese ("feat: …"), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Never `git stash`.

## Review Focus

1. **A clinic that filled in nothing:** no address, hours, products, reviews or payment methods. The page must render with those sections hidden, and only the Fotos tab shows an empty state. Pinned by an e2e in Task 5 on a bare clinic.
2. **A client trying to review without a completed appointment:** a `confirmed` future one, a `cancelled` one, or another patient's completed one. The insert must fail in the database, not only in the action. Pinned in Task 1's integration tests.
3. **An anonymous visitor or a client of clinic A reading clinic B's reviews, products, photo or payment methods,** including a deactivated clinic. They must get nothing. Pinned in Task 1.
4. **Instagram input in its many forms:** `@karolpachecojk`, `karolpachecojk`, `https://www.instagram.com/karolpachecojk/`, `instagram.com/karolpachecojk?igsh=abc`. All must store `karolpachecojk`, and junk is refused. Pinned in Task 2's unit tests.
5. **The booking day strip at month boundaries and on days with no slots:** dimmed and not selectable. The chosen service from the Serviços tab must carry over (`?servico=<id>`), and an unknown id falls back to the service list. Pinned in Task 6's e2e.

---

### Task 1: Migration 0017 — columns, tables, rules and definer functions

**Files:**
- Modify: `src/db/schema/clinic.ts` (clinics columns + `products`, `reviews`, `loyaltyRedemptions` tables), `src/db/schema/index.ts` if tables are re-exported there
- Create: `drizzle/0017_clinic_page.sql` (+ `drizzle/meta/_journal.json` entry and snapshot, produced by `npx drizzle-kit generate --name clinic_page` and then hand-extended with grants, policies and functions, like 0013/0016)
- Test: `tests/integration/clinic-page-rules.test.ts`

**Interfaces:**
- Produces (SQL):
  - **`clinics` columns:** `instagram_handle text`, `amenities text[] not null default '{}'`, `loyalty_enabled boolean not null default false`, `loyalty_visits integer not null default 10`, `loyalty_reward text`.
  - **`clinics` checks:** `clinics_instagram_check`, `clinics_amenities_check` (`amenities <@ ARRAY[...8 keys]`), `clinics_loyalty_visits_check` (2–50), `clinics_loyalty_reward_check` (≤ 120), `clinics_loyalty_check` (`not loyalty_enabled or loyalty_reward is not null`) and `clinics_maps_url_check` (`maps_url is null or maps_url ~ '^https://'`). Before adding that last check, the migration sets `maps_url = null` where it fails it.
  - **`products`:** `id uuid pk`, `clinic_id` (fk clinics, restrict), `name`, `price_cents integer null`, `description text null`, `is_active boolean not null default true`, `sort_order integer not null default 0`, `created_at` and `updated_at` (existing helpers). Checks per Global Constraints, plus `index(clinic_id)`.
  - **`reviews`:**
    - **Columns:** `id uuid pk`, `clinic_id`, `patient_id`, `rating smallint`, `comment text null`, `is_hidden boolean not null default false`, `hidden_at timestamptz null`, `hidden_by uuid null` (fk users, set null) and `created_at`.
    - **Keys and indexes:** composite fk `(clinic_id, patient_id)` → `patients(clinic_id, id)` restrict, plus `index(clinic_id, created_at)`.
    - **Checks:** rating 1–5 and comment ≤ 500.
  - **`loyalty_redemptions`:** `id`, `clinic_id`, `patient_id` (same composite fk), `created_at`, `created_by uuid null` (fk users, set null), plus `index(clinic_id, patient_id)`.
  - **`app_panel` grants:**
    - **Clinics:** UPDATE on `clinics` is extended with `headline, about, whatsapp_phone, contact_email, address, maps_url, instagram_handle, amenities, online_booking_enabled, loyalty_enabled, loyalty_visits, loyalty_reward`.
    - **Products:** SELECT, INSERT, UPDATE, DELETE.
    - **Reviews:** SELECT, plus UPDATE (`is_hidden, hidden_at, hidden_by`).
    - **Loyalty redemptions:** SELECT, INSERT.
    - Each new table has a policy `<table>_panel FOR ALL TO app_panel USING/WITH CHECK clinic_id = setting`.
  - **`app_client` grants:**
    - **Clinics:** SELECT on the extra columns `headline, about, professional_name, professional_registration, area_label, instagram_handle, amenities, loyalty_enabled, loyalty_visits, loyalty_reward, owner_photo_media_id`.
    - **Products:** SELECT `(id, clinic_id, name, price_cents, description, is_active, sort_order)`, with policy `products_client` = clinic setting AND `is_active`.
    - **Reviews:** INSERT `(clinic_id, patient_id, rating, comment)` only, with policy `reviews_client_insert`. Its WITH CHECK requires the clinic and patient settings, `not is_hidden`, and `EXISTS (select 1 from appointments a where a.clinic_id = reviews.clinic_id and a.patient_id = reviews.patient_id and a.status = 'completed')`. No SELECT on reviews.
  - **Definer functions** (all `STABLE`, return no rows unless the clinic is active):
    - `client_public_reviews(p_clinic uuid, p_limit integer) RETURNS TABLE(id uuid, rating smallint, comment text, created_at timestamptz, author text)`: visible only, newest first, `least(p_limit, 50)`; author per Global Constraints, from `patients.name`.
    - `client_review_summary(p_clinic uuid) RETURNS TABLE(average numeric, total integer)`: average rounded to 1 decimal, null when there are none; total 0 when there are none.
    - `client_payment_methods(p_clinic uuid) RETURNS TABLE(name text)`: active, by `sort_order, name`.
    - `client_loyalty_progress() RETURNS TABLE(completed integer, redeemed integer)`: reads `app.clinic_id`, `app.patient_id` and `app.user_id` from the settings (no parameters), and returns zeros unless that patient belongs to that user in that clinic.
    - `client_owner_photo(p_clinic uuid) RETURNS TABLE(mime_type text, data bytea)`: only the media row whose id is `clinics.owner_photo_media_id` of that clinic.

- [ ] **Step 1: Write the failing integration test** `tests/integration/clinic-page-rules.test.ts`
  - **Setup:** follow `tests/integration/client-access.test.ts`, with fictitious e-mails ending `@pagina-clinica.example.test` and cleanup scoped to them. Setup creates, via the owner `db`, clinic B (`otherClinic("clinica-pagina-teste")`), patients Ana (with a completed appointment in `CLINIC`), Bia (only a confirmed future appointment), Carla (only cancelled) and a patient in clinic B.
  - **Cases:**
    - `it("lets a client with a completed appointment review, any number of times")`: `asClient` for Ana inserts two reviews; the owner `db` sees 2 rows.
    - `it("refuses a review without a completed appointment")`: Bia and Carla each `rejects` with `findPgError(...).code === "42501"`.
    - `it("refuses a review for another patient or clinic")`: Ana's scope with `patient_id` of Bia, or `clinic_id` of B → 42501.
    - `it("gives app_client no SELECT on reviews")`: a select as Ana → 42501.
    - `it("public reviews hide hidden ones and abbreviate the author")`: hide one through `inClinic(CLINIC, tx => tx.update(reviews)…)`; `client_public_reviews(CLINIC, 10)` returns only visible ones, author `"Ana S."` for "Ana Souza Teste"… (choose the fixture name so the expected author is exact); `client_review_summary` total counts only visible ones.
    - `it("returns nothing for an inactive clinic or another clinic's data")`: deactivate B → every function returns 0 rows for B; `client_public_reviews(B)` never contains A's rows.
    - `it("shows clients only active products of their clinic")`: insert active and inactive products in A and B as owner; a `clientDb` transaction with `app.clinic_id = A` sees only A's active ones.
    - `it("panel can hide a review but not change its rating or text")`: `inClinic(CLINIC, …)` UPDATE `rating` → 42501; UPDATE `is_hidden` ok; panel of B sees 0 of A's reviews.
    - `it("loyalty progress counts only her completed appointments and redemptions")`: as Ana → `{ completed: 1, redeemed: 0 }`; after the panel inserts a redemption → `redeemed: 1`; with a mismatched `app.user_id` → zeros.
    - `it("payment methods and owner photo are readable only through the functions")`: direct select on `payment_methods` as app_client → 42501; `client_payment_methods(CLINIC)` returns the active names.
    - `it("enforces the clinic checks")`: owner-db updates with `amenities = '{sauna}'`, `instagram_handle = 'bad handle'`, `loyalty_visits = 1`, `loyalty_enabled = true` with null reward, and `maps_url = 'javascript:alert(1)'` each fail with 23514.
    - `it("panel may update the new clinic page columns")`: `inClinic(CLINIC)` updates `instagram_handle`, `amenities`, `online_booking_enabled` → ok.

- [ ] **Step 2: Run it to see it fail.** Run `npx vitest run tests/integration/clinic-page-rules.test.ts`. Expected: FAIL (tables and functions missing).

- [ ] **Step 3: Add the schema in `src/db/schema/clinic.ts` and generate the migration.** Run `npx drizzle-kit generate --name clinic_page`, then append the grants, policies and functions to `drizzle/0017_clinic_page.sql`. Start the file with a comment block like 0013's explaining who reaches what.

- [ ] **Step 4: Run the new test and the existing role tests.** Run `npx vitest run tests/integration/clinic-page-rules.test.ts tests/integration/db-roles.test.ts tests/integration/client-access.test.ts tests/integration/database-rules.test.ts`. Expected: PASS. The catalog checks in `db-roles` must accept the new tables.

- [ ] **Step 5: Commit** — `feat: banco da página da clínica (produtos, avaliações, fidelidade)`.

---

### Task 2: Fields and the clinic-page module

**Files:**
- Create: `src/modules/clinic-page/fields.ts`, `src/modules/clinic-page/fields.test.ts`, `src/modules/clinic-page/public.ts` (anonymous and client reads/writes), `src/modules/clinic-page/panel.ts` (owner reads/writes)
- Test: `tests/integration/clinic-page.test.ts`

**Interfaces:**
- Consumes: Task 1 tables, columns and functions; `asClient`, `inClinic` and `clientDb` from `@/db/client`; `normalizeBrPhone` from `@/modules/patients/fields`; `BookingContext` from `@/modules/booking/booking`.
- Produces, from `fields.ts`:
  - `export const AMENITIES` (readonly tuple of the 8 keys) and `export type Amenity`.
  - `export const AMENITY_LABELS: Record<Amenity, string>`.
  - `export function parseInstagram(input: string): string | null`.
  - `export function parsePriceInput(input: string): number | null | "invalid"`: `""` → null, `"79,90"` / `"R$ 79,90"` / `"79.90"` → 7990.
  - `export const clinicPageSchema`: zod object with `headline` (≤ 120), `about` (≤ 2000), `whatsappPhone` (BR → E.164 or empty), `contactEmail`, `address` (≤ 200), `mapsUrl` (https, ≤ 500), `instagram`, `amenities: Amenity[]` and `onlineBookingEnabled: boolean`. Empty strings become null. The output carries `instagramHandle`.
  - `export const loyaltySchema` (`enabled`, `visits`, `reward`).
  - `export const productSchema` (`name`, `price`, `description`, `isActive`).
  - `export const reviewSchema` (`rating`, `comment`).
  - Each schema has its inferred `…Input` type.
- Produces, from `public.ts`:
  - `export type ClinicPage = PublicClinic & { headline: string | null; about: string | null; areaLabel: string | null; professionalName: string | null; professionalRegistration: string | null; instagramHandle: string | null; amenities: Amenity[]; hasOwnerPhoto: boolean; loyalty: { visits: number; reward: string } | null; paymentMethods: string[]; hours: { weekday: number; intervals: { start: string; end: string }[] }[]; services: { id: string; name: string; description: string | null; durationMinutes: number; priceCents: number | null; priceDisplay: "fixed" | "starting_at" | "on_request" | "hidden" }[]; products: { id: string; name: string; priceCents: number | null; description: string | null }[]; reviews: { id: string; rating: number; comment: string | null; createdAt: Date; author: string }[]; reviewSummary: { average: number | null; total: number } }`.
  - `export async function getClinicPage(slug: string): Promise<ClinicPage | null>`: one `clientDb` transaction like `readContext` in `src/modules/clients/context.ts`. Hours come from `client_business_hours`; reuse its row shape. `services` reads through the existing `services_client` policy, with the same filter and order as `listBookableServices`, and `priceCents` null when `priceDisplay` is hidden.
  - `export async function getOwnerPhoto(slug: string): Promise<{ mimeType: string; data: Buffer } | null>`.
  - `export async function canReview(ctx: BookingContext): Promise<boolean>`: own completed appointment exists.
  - `export async function createReview(ctx: BookingContext, input: ReviewInput): Promise<{ ok: true } | { ok: false; reason: "not_allowed" | "invalid" }>`: no `RETURNING` (no SELECT grant); 42501 → `not_allowed`.
  - `export async function getLoyaltyProgress(ctx: BookingContext, visits: number): Promise<{ stamps: number; prize: boolean }>`, where `stamps = min(progress, visits)`.
- Produces, from `panel.ts` (all take `clinicId` first and run in `inClinic`):
  - `getClinicPageSettings(clinicId)` returns the editable fields with the instagram handle and the loyalty settings.
  - `updateClinicPage(clinicId, input: ClinicPageInput)`.
  - `updateLoyalty(clinicId, input: LoyaltyInput)`.
  - `listProducts(clinicId)`, `createProduct(clinicId, input)`, `updateProduct(clinicId, id, input)`, `deleteProduct(clinicId, id)`.
  - `addExampleProducts(clinicId)`: inserts the 3 Global Constraints products only when the clinic has none, and returns their count.
  - `listReviews(clinicId)`: newest first, with the full patient name and `patientId`.
  - `setReviewHidden(clinicId, reviewId, hidden: boolean, actorUserId: string)`.
  - `getPatientLoyalty(clinicId, patientId)` returns `{ enabled; visits; reward; stamps; prize }`.
  - `redeemLoyalty(clinicId, patientId, actorUserId)` returns `{ ok: true } | { ok: false; reason: "no_prize" }`.

- [ ] **Step 1: Write the unit tests** `src/modules/clinic-page/fields.test.ts`
  - **Instagram:** `parseInstagram` maps the four forms in Review Focus #4 to `"karolpachecojk"`; `"https://evil.com/x"`, `"a b"` and `""` → null.
  - **Price:** `parsePriceInput("R$ 79,90") === 7990`, `parsePriceInput("") === null`, `parsePriceInput("abc") === "invalid"`.
  - **Page schema:**
    - refuses `mapsUrl: "javascript:alert(1)"` and `"http://maps.google.com"`;
    - refuses `amenities: ["sauna"]`;
    - turns a WhatsApp `"(47) 99626-2982"` into `"+5547996262982"`.
  - **Loyalty schema:** refuses `{ enabled: true, reward: "" }` and `visits: 1`.
  - **Review schema:** refuses rating 0 and 6, and a 501-character comment.

- [ ] **Step 2: Write the integration test** `tests/integration/clinic-page.test.ts`
  - **Setup:** same fixture style as Task 1.
  - **Cases:**
    - `getClinicPage` returns amenities, the instagram handle, payment method names, products (active only), the review summary and author abbreviations.
    - `getClinicPage("nao-existe")` → null.
    - `createReview` ok for a completed patient, `not_allowed` for a patient without one.
    - `addExampleProducts` is idempotent (second call → 0).
    - `redeemLoyalty` → `no_prize` below the threshold; after enough completed appointments → ok, and `getPatientLoyalty.stamps` restarts at the remainder.
    - `setReviewHidden` hides it from `getClinicPage`.

- [ ] **Step 3: Run both and see them fail.** Run `npx vitest run src/modules/clinic-page tests/integration/clinic-page.test.ts`. Expected: FAIL.

- [ ] **Step 4: Implement `fields.ts`, `public.ts` and `panel.ts`.**
  - Add `import "server-only"` to `public.ts` and `panel.ts`, like the other modules.
  - `updateClinicPage` sets `updated_at`.
  - `setReviewHidden` sets `hidden_at` and `hidden_by`, or clears them.

- [ ] **Step 5: Run both and see them pass.** Expected: PASS.

- [ ] **Step 6: Commit** — `feat: módulo da página da clínica`.

---

### Task 3: Panel — "Minha página"

**Files:**
- Create: `src/app/admin/(painel)/pagina/page.tsx`, `pagina/actions.ts`, `pagina/page-form.tsx` (dados + comodidades checklist + online toggle), `pagina/loyalty-form.tsx`, `pagina/produtos/page.tsx`, `pagina/produtos/product-form.tsx`, `pagina/avaliacoes/page.tsx`
- Modify: `src/app/admin/(painel)/layout.tsx` (nav item `{ href: "/admin/pagina", label: "Minha página", icon: "page" }`), `panel-nav.tsx` (new `page` stroke icon), `src/app/admin/(painel)/pacientes/[id]/page.tsx` (loyalty block)
- Test: `e2e/clinic-page-panel.spec.ts`

**Interfaces:**
- Consumes: Task 2 `panel.ts` functions and schemas; `requireAdmin()` from `@/modules/auth/session` (returns `{ clinicId, … }`, including the user id used as the actor — read it there).
- Produces: routes `/admin/pagina`, `/admin/pagina/produtos` and `/admin/pagina/avaliacoes`.
- Actions follow `src/app/admin/(painel)/expediente/actions.ts`: return values, never redirect; `ActionFailure` with `fieldErrors`.

- [ ] **Step 1: Write the e2e** `e2e/clinic-page-panel.spec.ts` (sign in as in `e2e/branding.spec.ts`)
  - `test("owner edits her page")`:
    - fills Instagram `@karolpachecojk`, checks "Wi-Fi" and saves;
    - sees "Página salva.";
    - after reload the Instagram field shows `karolpachecojk` and Wi-Fi is checked.
  - `test("owner turns online booking off and on")`.
  - `test("owner starts products with examples and edits one")`:
    - on an empty list, clicks "Começar com exemplos" and sees the 3 names;
    - edits the price of "Hidratante facial" to `59,90`.
  - `test("owner hides a review")`:
    - seeds a review through the owner db helper;
    - "Esconder" → its badge reads "Escondida".
  - `test("owner sets loyalty and marks a prize used")`:
    - enables loyalty with 2 visits and "Uma limpeza de pele grátis";
    - seeds 2 completed appointments for a patient;
    - on the patient page sees "Prêmio disponível", clicks "Prêmio usado" and sees "0 de 2".

- [ ] **Step 2: Run it and see it fail.** Run `npx playwright test e2e/clinic-page-panel.spec.ts`. Expected: FAIL.

- [ ] **Step 3: Implement the pages, forms, actions, nav item and patient loyalty block.**
  - The checklist renders the 8 amenities with their labels as native checkboxes.
  - Field help text: Instagram "Pode colar o link do perfil ou o @"; map "Cole o link do Google Maps (começa com https://)".

- [ ] **Step 4: Run the e2e and the existing panel specs.** Run `npx playwright test e2e/clinic-page-panel.spec.ts e2e/branding.spec.ts e2e/patients.spec.ts`. Expected: PASS.

- [ ] **Step 5: Commit** — `feat: dona configura a página da clínica no painel`.

---

### Task 4: Client shell — icons, bottom nav, public owner photo

**Files:**
- Create: `src/app/[slug]/icons.tsx`, `src/app/[slug]/bottom-nav.tsx` (client component, active state from `usePathname`), `src/app/[slug]/foto/route.ts`
- Modify: `src/app/[slug]/layout.tsx` (compact header with the Zemana mark, the theme toggle and the bottom nav; `main` gets bottom padding so content never hides behind the nav), `src/app/[slug]/ui.tsx` (`instagramUrl(handle)`, `mapsLink`, `ClinicContacts` with icons)
- Test: `e2e/client-area.spec.ts` (extend)

**Interfaces:**
- Consumes: `getOwnerPhoto(slug)` (Task 2).
- Produces:
  - **`icons.tsx`:** `export function Icon({ name, className }: { name: IconName; className?: string })`, with `IconName` = `"home" | "calendar" | "clock" | "person" | "wifi" | "parking" | "accessibility" | "snowflake" | "coffee" | "restroom" | "kids" | "paw" | "star" | "starFilled" | "map" | "whatsapp" | "instagram" | "mail" | "phone" | "copy" | "chevronLeft" | "chevronRight" | "image" | "gift" | "bag" | "check"`.
  - **Amenity icons:** `export const AMENITY_ICONS: Record<Amenity, IconName>`.
  - **`bottom-nav.tsx`:** `BottomNav({ slug, signedIn })`, with the items Início `/<slug>`, Agendar `/<slug>/marcar`, Meus horários `/<slug>/meus-horarios` and Perfil (`/<slug>/perfil` when signed in, else `/<slug>/entrar`).
  - **`/<slug>/perfil` page:** her name, her e-mail and `SignOutButton`; it requires the client.
  - **`GET /<slug>/foto`:** returns the image with `Content-Type` from the row and `Cache-Control: public, max-age=300`, or 404.

- [ ] **Step 1: Extend the e2e**
  - `test("clinic link shows the bottom navigation")`: the four links are visible at 360×800 and none of them is an emoji (assert each link contains an `svg`).
  - `test("owner photo route serves only an active clinic's photo")`: `/<slug>/foto` → 200 with `image/` for a clinic with a photo, and 404 for one without.

- [ ] **Step 2: Run it and see it fail.** Run `npx playwright test e2e/client-area.spec.ts`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement the icons, nav, layout, profile page and photo route.** Check the Route Handler conventions in `node_modules/next/dist/docs/` first.

- [ ] **Step 4: Run it and see it pass.** Run `npx playwright test e2e/client-area.spec.ts`. Expected: PASS, including the old tests (update selectors only where the old two-button page changed).

- [ ] **Step 5: Commit** — `feat: navegação da área da cliente com ícones`.

---

### Task 5: Client home page — hero, tabs and sections

**Files:**
- Modify: `src/app/[slug]/page.tsx`
- Create: `src/app/[slug]/home/hero.tsx`, `home/tabs.tsx` (client component; tab state in the URL hash or local state, keyboard-accessible `role="tablist"`), `home/sections.tsx` (amenities, reviews, location, hours, payment, contacts), `home/open-status.ts` + `home/open-status.test.ts`
- Test: `e2e/clinic-page.spec.ts`

**Interfaces:**
- Consumes: `getClinicPage(slug)`, `canReview`, `getLoyaltyProgress` (Task 2); `Icon` and `AMENITY_ICONS` (Task 4); `priceLabel` and `whatsappUrl` from `ui.tsx`; the Serviços tab uses `ClinicPage.services`.
- Produces: `export function openStatus(hours: ClinicPage["hours"], zone: string, now: Date): { open: boolean; label: string }`, with labels exactly "Aberto agora · até HH:mm", "Fechado · abre hoje às HH:mm", "Fechado · abre amanhã às HH:mm", "Fechado · abre <weekday> às HH:mm" and "Fechado hoje" (the last only when there are no hours at all in the week).

- [ ] **Step 1: Write the unit test** `home/open-status.test.ts`. Cover inside an interval, between two intervals the same day, after closing with tomorrow open, Saturday closing with Monday next, and no hours at all. Use zone `America/Sao_Paulo`.

- [ ] **Step 2: Write the e2e** `e2e/clinic-page.spec.ts`, at a 360×800 viewport.
  - `test("full page")`:
    - for the e2e clinic seeded with Wi-Fi, Instagram, a product, a visible and a hidden review, and payment methods;
    - sees the tabs Serviços/Fotos/Fidelidade/Produtos/Sobre;
    - sees "Fotos em breve" under Fotos, "Wi-Fi", one review, "PIX" and an Instagram link to `https://www.instagram.com/<handle>/`;
    - the hidden review is absent.
  - `test("bare clinic hides empty sections")` (Review Focus #1): a clinic with nothing filled shows no Comodidades, Avaliações, Localização or Formas de pagamento headings, and no Produtos/Fidelidade tabs; Fotos still shows its empty state.
  - `test("online booking off shows contact instead of Agendar")`.
  - `test("Agendar on a service carries it to the booking page")`: the link has `?servico=<id>`.

- [ ] **Step 3: Run them and see them fail.**

- [ ] **Step 4: Implement the page per the spec's "Início" section.**
  - Reviews show 10, with stars as icons and the accessible text "Nota 5 de 5".
  - Phone copy uses `navigator.clipboard` with an "Copiado" status message.
  - The "Avaliar" button shows only when `canReview` and links to `/<slug>/avaliar`.

- [ ] **Step 5: Run the unit test and the e2e.** Expected: PASS.

- [ ] **Step 6: Commit** — `feat: nova página inicial da clínica no celular`.

---

### Task 6: Booking flow redesign

**Files:**
- Modify: `src/app/[slug]/marcar/page.tsx` (reads `searchParams.servico`), `src/app/[slug]/marcar/booking-flow.tsx` (split if it grows: `day-strip.tsx`, `slot-groups.tsx`, `confirm-sheet.tsx`)
- Test: `e2e/client-area.spec.ts` (update the booking tests), `src/app/[slug]/marcar/slot-groups.test.ts`

**Interfaces:**
- Consumes: the existing `loadDays`, `loadSlots` and `book` actions (unchanged), plus `ServiceOption`.
- Produces: `export function groupSlots(slots: string[]): { period: "manha" | "tarde" | "noite"; label: "Manhã" | "Tarde" | "Noite"; slots: string[] }[]`. The groups are before 12:00, 12:00–17:59 and ≥ 18:00, read from the slot's HH:mm; empty groups are omitted.

- [ ] **Step 1: Write the unit test** `slot-groups.test.ts`. Slots `["…T09:00:00-03:00","…T12:00:00-03:00","…T17:50:00-03:00","…T18:00:00-03:00"]` → three groups with 1, 2 and 1 slots; `[]` → `[]`.

- [ ] **Step 2: Update the e2e booking tests to the new flow.**
  - **Preselected service:** `?servico=<id>` opens directly on days.
  - **Day strip:** shows the month, dims days without slots and disables them (Review Focus #5); the arrows cross a month boundary.
  - **Periods:** the period chips scroll to their group.
  - **Confirm sheet:** tapping a slot opens a dialog (`role="dialog"`) with service, day, "HH:mm – HH:mm" and price, plus a "Confirmar agendamento" button. Confirming shows the existing confirmation.
  - **Unknown service:** an unknown `?servico=` shows the service list.

- [ ] **Step 3: Run them and see them fail.**

- [ ] **Step 4: Implement.**
  - The rules and server checks stay exactly as they are.
  - No observation field (bookings do not store client notes).
  - The sheet traps focus and closes on Escape and on the close icon.

- [ ] **Step 5: Run the unit test and `npx playwright test e2e/client-area.spec.ts`.** Expected: PASS.

- [ ] **Step 6: Commit** — `feat: agendamento com faixa de dias e horários por período`.

---

### Task 7: Reviews and loyalty for the client

**Files:**
- Create: `src/app/[slug]/avaliar/page.tsx`, `avaliar/review-form.tsx`, `avaliar/actions.ts`
- Modify: `src/app/[slug]/meus-horarios/page.tsx` (visual refresh, plus "Avaliar" on completed appointments), `src/app/[slug]/home/tabs.tsx` (Fidelidade tab: rule always; with login the stamp card "N de M" or "Você ganhou: <reward>. Avise na próxima visita.")
- Test: `e2e/clinic-page.spec.ts` (extend)

**Interfaces:**
- Consumes: `createReview`, `canReview` and `getLoyaltyProgress` (Task 2); `requireClient` from `@/modules/clients/session`; `reviewSchema`.
- Produces: route `/<slug>/avaliar`. Without permission it shows "Você poderá avaliar depois do seu primeiro atendimento." and no form.

- [ ] **Step 1: Extend the e2e**
  - `test("client with a completed appointment reviews")`:
    - picks 5 stars (buttons with `aria-pressed`) and writes a comment;
    - sends and sees "Obrigada pela avaliação!";
    - the home page shows the new review with her abbreviated name.
  - `test("client without a completed appointment cannot review")`: sees the message and no form.
  - `test("loyalty card shows progress")`: with loyalty at 2 visits and 1 completed, sees "1 de 2".

- [ ] **Step 2: Run them and see them fail.**

- [ ] **Step 3: Implement.** The action re-checks with `createReview`, so the database rule is the gate and the UI only mirrors it.

- [ ] **Step 4: Run `npx playwright test e2e/clinic-page.spec.ts e2e/client-area.spec.ts`.** Expected: PASS.

- [ ] **Step 5: Commit** — `feat: cliente avalia e acompanha a fidelidade`.

---

### Task 8: Docs and full verification

**Files:**
- Modify: `README.md` (Minha página, the reviews rule, loyalty), `docs/decisoes-tecnicas.md` (new tables and functions, and why the definer functions exist)

- [ ] **Step 1: Update the docs** in the repo's style: short Portuguese sentences, no marketing.
- [ ] **Step 2: Run everything:** `npx eslint . --max-warnings=0`, `npx tsc --noEmit`, `npx vitest run` and `npx playwright test`. Expected: all pass.
- [ ] **Step 3: Commit** — `docs: página da clínica`.
