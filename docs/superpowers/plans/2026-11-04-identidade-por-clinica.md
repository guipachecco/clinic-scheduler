# Identidade por clínica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each clinic's panel shows its own colors, generated logo, owner photo and tab icon, and the owner picks one of her three palettes on an "Aparência" page.

**Architecture:** Palettes live in a code catalog (`src/modules/branding`) with light and dark values for the identity tokens of `globals.css`; the clinic stores only `theme.paletteId`. The panel layout writes the chosen palette's variables in a `<style>` tag after `globals.css`; pages without a clinic use a neutral palette. Grais keeps its image logo and current colors.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Drizzle + PostgreSQL 17, Tailwind CSS v4 tokens, Vitest, Playwright, `sharp` (photo processing), `@fontsource-variable/fraunces` (logo font).

**Spec:** `docs/superpowers/specs/2026-11-04-identidade-por-clinica-design.md`

## Global Constraints

- Every module function takes `clinicId` from the session first (`requireAdmin()`), never from the form (docs/multiclinica.md).
- Contrast: every text/background pair listed in Task 1 is at least 4.5:1, in both themes.
- Grais's palette is exactly today's values in `src/app/globals.css` (`:root` and `.dark`), and Grais keeps `BrandImage`.
- Neutrals (background, card, border, foreground, muted, destructive, status colors) stay shared; only identity tokens change.
- Photo: JPEG, PNG or WebP, at most 2 MB (`media_byte_size_check`), metadata stripped, longest side at most 800 px.
- UI copy in Portuguese; code and database in English. Run pnpm as `corepack pnpm`. No commits without the user's authorization.
- Clinic slugs in the catalog: `karol-pacheco`, `sirlei-massoterapia`, `karina-manicure`, `grais`.

## Review Focus

- A clinic whose stored `paletteId` was removed from the catalog or is not offered to it: falls back to its first offered palette, never to another clinic's (Task 1, `resolvePalette`).
- A photo with EXIF orientation (phone portrait): stored upright, not rotated sideways (Task 3, `rotate()` before stripping).
- Root switching clinics: the new clinic's colors and icon show on the next page, no stale palette (Task 4 e2e).
- A display name with one word, accents or extra spaces ("  Sirlei  ", "Ângela Souza"): initials "S", "ÂS" (Task 1).
- A clinic with no photo and no display name: wordmark falls back to `clinics.name`, avatar to the user initial (Task 4).

---

### Task 1: Palette catalog and contrast check

**Files:**
- Create: `src/modules/branding/palettes.ts`, `src/modules/branding/contrast.ts`
- Test: `src/modules/branding/palettes.test.ts`

**Interfaces:**
- Produces:
  - `type TokenName = "primary" | "primary-pressed" | "primary-foreground" | "highlight" | "highlight-foreground" | "brand" | "brand-foreground" | "brand-muted" | "brand-accent" | "brand-accent-foreground" | "ring"`
  - `type Palette = { id: string; name: string; description: string; light: Record<TokenName, string>; dark: Record<TokenName, string> }`
  - `PALETTES: Record<string, Palette>`; `GRAIS_PALETTE_ID = "grais"`; `NEUTRAL_PALETTE_ID = "painel"`
  - `CLINIC_BRANDING: Record<string, { palettes: string[]; displayName: string | null; areaLabel: string | null }>`
  - `palettesForClinic(slug: string): Palette[]` — catalog list for the slug; unknown slug → neutral first, then the nine new palettes.
  - `resolvePalette(slug: string, stored: string | undefined): Palette` — stored id if offered to the slug, else the first offered.
  - `paletteCss(palette: Palette): string` — `":root{--primary:#…;…}.dark{…}"`.
  - `initialsFor(displayName: string): string` — first letter of first and last word, uppercase, max 2.
  - `contrastRatio(a: string, b: string): number` (WCAG relative luminance, hex `#rrggbb`).

Light values from the approved proposals (mapping decided in the spec: `brand`/`primary` = main tone, `highlight` = accent, `brand-accent` = light tint); dark values are the builder's, within the contrast test:

| id | name | slug | primary/brand | highlight | brand-accent |
| --- | --- | --- | --- | --- | --- |
| `karol-vinho` | Nude e vinho | karol-pacheco | #6E1F2E | #B08D57 | #E8D3C3 |
| `karol-preto-ouro` | Preto e dourado | karol-pacheco | #1F1B1A | #B8925A | #ECE3D6 |
| `karol-rose` | Rosé terroso | karol-pacheco | #A4553F | #D9A38F | #F5DED5 |
| `sirlei-salvia` | Sálvia | sirlei-massoterapia | #4F6F5A | #A9BFA8 | #E3EBE4 |
| `sirlei-argila` | Argila | sirlei-massoterapia | #8A5A44 | #C9A88E | #EFE3D6 |
| `sirlei-grafite` | Grafite e cobre | sirlei-massoterapia | #2E2E33 | #B87348 | #E7E3DE |
| `karina-marinho-coral` | Marinho e coral | karina-manicure | #22315A | #D9503E | #E6E9F2 |
| `karina-rosa` | Rosa esmalte | karina-manicure | #B2295B | #E98AAE | #F9DCE6 |
| `karina-ameixa` | Ameixa e dourado | karina-manicure | #5B3A7A | #C9A84E | #ECE3F6 |
| `painel` | Painel (neutra) | — | #3E4C63 | #D8E1EE | #C7D3E3 |

Order in `CLINIC_BRANDING` (first = initial): karol `[karol-vinho, karol-preto-ouro, karol-rose]`, displayName "Karol Pacheco", area "Estética"; sirlei `[sirlei-salvia, sirlei-argila, sirlei-grafite]`, "Sirlei", "Massoterapia"; karina `[karina-rosa, karina-marinho-coral, karina-ameixa]`, "Karina", "Manicure"; grais `[grais]`, null, null.

- [ ] **Step 1: Write the failing tests** in `palettes.test.ts`:
  - `"every palette is readable in both themes"`: for each palette and theme, `contrastRatio` ≥ 4.5 for `primary-foreground`/`primary`, `brand-foreground`/`brand`, `highlight-foreground`/`highlight`, `brand-accent-foreground`/`brand-accent`, and `primary` on background (`#f7f5f8` light, `#0b0b10` dark).
  - `"grais is today's globals.css"`: `PALETTES.grais.light.primary === "#00357a"`, `light.highlight === "#ffde59"`, `dark.primary === "#99f0ff"`, `dark.brand === "#000000"` and every other token equal to the `:root`/`.dark` values in globals.css.
  - `"each clinic sees its three palettes"`: `palettesForClinic("karina-manicure").map(p => p.id)` → `["karina-rosa","karina-marinho-coral","karina-ameixa"]`; `palettesForClinic("grais")` → `["grais"]`; `palettesForClinic("nova")[0].id` → `"painel"` and length 10.
  - `"resolvePalette never borrows another clinic's palette"`: `resolvePalette("karina-manicure", "karol-vinho").id` → `"karina-rosa"`; `resolvePalette("sirlei-massoterapia", "sirlei-argila").id` → `"sirlei-argila"`; `resolvePalette("x", undefined).id` → `"painel"`.
  - `"initials"`: `"Karol Pacheco"`→`"KP"`, `"  Sirlei  "`→`"S"`, `"Ângela Souza"`→`"ÂS"`, `"maria da silva"`→`"MS"`.
  - `"paletteCss writes both themes"`: output contains `:root{` and `.dark{` and `--brand:#b2295b` (lowercase) for karina-rosa.
- [ ] **Step 2:** `corepack pnpm exec vitest run --project unit src/modules/branding` → FAIL (module missing).
- [ ] **Step 3:** Implement the two files. If a proposal color fails contrast, darken the main tone (keep the hue) and keep the test unchanged.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit (with authorization): `feat: catálogo de paletas por clínica`.

### Task 2: Clinic branding data and module

**Files:**
- Modify: `src/db/schema/clinic.ts` (clinics: `displayName: text("display_name")`, `areaLabel: text("area_label")`, `ownerPhotoMediaId: uuid("owner_photo_media_id")` → `media.id` on delete set null; checks `char_length between 1 and 40` when not null; `ClinicTheme` gains `paletteId?: string`)
- Create: migration `drizzle/0010_clinic_branding.sql` via `corepack pnpm exec drizzle-kit generate --name clinic_branding` (pure column adds, no prompt)
- Create: `src/modules/branding/branding.ts`
- Modify: `src/modules/clinics/clinics.ts` (`createClinic` sets `theme: { paletteId }`, `displayName`, `areaLabel` from `CLINIC_BRANDING[slug]` when present)
- Test: `tests/integration/branding.test.ts`

**Interfaces:**
- Consumes: Task 1 `resolvePalette`, `palettesForClinic`, `CLINIC_BRANDING`.
- Produces:
  - `type ClinicBranding = { clinicId: string; slug: string; name: string; displayName: string; areaLabel: string | null; palette: Palette; offered: Palette[]; usesBrandImages: boolean; ownerPhotoMediaId: string | null }` (`usesBrandImages` = slug `grais`; `displayName` falls back to `name`)
  - `getClinicBranding(clinicId: string): Promise<ClinicBranding | null>` (wrap callers with React `cache` where used per request)
  - `setClinicPalette(clinicId: string, paletteId: string, actorUserId: string): Promise<{ ok: true } | { ok: false; formError: string }>` — refuses ids not in `palettesForClinic(slug)`; audit `clinic.palette_changed` with `{ from, to }`.
  - `updateBrandingText(clinicId: string, values: { displayName: string | null; areaLabel: string | null }, actorUserId: string): Promise<{ ok: true }>` — audit `clinic.branding_updated` with `{ fields }`.
  - zod `brandingTextSchema` in `src/modules/branding/fields.ts` (trim, empty → null, max 40).

- [ ] **Step 1: Failing tests** in `branding.test.ts`:
  - `"a new catalog clinic starts with its first palette and names"`: `createClinic({ name: "Karina Manicure", slug: "karina-manicure" })` then `getClinicBranding` → `palette.id === "karina-rosa"`, `displayName === "Karina"`, `areaLabel === "Manicure"`.
  - `"an unknown clinic starts neutral"`: slug `"clinica-nova"` → `palette.id === "painel"`.
  - `"refuses a palette of another clinic"`: `setClinicPalette(karinaId, "karol-vinho", actor)` → `{ ok: false }`, palette unchanged.
  - `"changing one clinic never changes another"`: set sirlei to `sirlei-argila`; karina still `karina-rosa`.
  - `"grais keeps its brand"`: `getClinicBranding(CLINIC)` → `palette.id === "grais"`, `usesBrandImages === true`.
- [ ] **Step 2:** `corepack pnpm exec vitest run --project integration tests/integration/branding.test.ts` → FAIL.
- [ ] **Step 3:** Schema, migration, module, `createClinic` change.
- [ ] **Step 4:** Same command → PASS; `corepack pnpm test` → all pass.
- [ ] **Step 5:** Commit: `feat: dados de identidade da clínica`.

### Task 3: Owner photo

**Files:**
- Modify: `package.json` (`sharp` `^0.35.5`, already in the lockfile through Next)
- Create: `src/modules/branding/photo.ts`
- Create: `src/app/admin/(painel)/foto/[id]/route.ts`
- Test: `tests/integration/owner-photo.test.ts`

**Interfaces:**
- Produces:
  - `saveOwnerPhoto(clinicId: string, input: { bytes: Buffer; mimeType: string }, actorUserId: string): Promise<{ ok: true; mediaId: string } | { ok: false; formError: string }>` — refuses mime outside jpeg/png/webp and > 2 MB input; `sharp(bytes).rotate().resize(800, 800, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 })` (output has no metadata by default); stores `media` row `kind: "photo"`, `clinicId`, `mimeType: "image/webp"`, dimensions from output; sets `clinics.owner_photo_media_id`; deletes the previous photo row; audit `clinic.owner_photo_changed`.
  - `removeOwnerPhoto(clinicId: string, actorUserId: string): Promise<{ ok: true }>`
  - `getClinicMedia(clinicId: string, mediaId: string): Promise<{ mimeType: string; data: Buffer } | null>` — only that clinic's row.
  - Route `GET /admin/foto/[id]`: `requireAdmin()`, then `getClinicMedia(clinicId, id)`; 404 when null; `Cache-Control: private, max-age=3600`.
- [ ] **Step 1: Failing tests:**
  - `"strips metadata and keeps the photo upright"`: input JPEG made with `sharp({ create: { width: 1200, height: 600, channels: 3, background: "#888" } }).withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "gps-test" } } }).jpeg().toBuffer()`; stored image `sharp(data).metadata()` → `exif === undefined`, `width <= 800`, `height > width` (orientation 6 applied).
  - `"refuses a big or wrong file"`: 2 MB + 1 byte → `{ ok: false }`; `mimeType: "image/gif"` → `{ ok: false }`.
  - `"another clinic cannot read it"`: `getClinicMedia(otherClinicId, mediaId)` → `null`.
- [ ] **Step 2:** `corepack pnpm exec vitest run --project integration tests/integration/owner-photo.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5:** Commit: `feat: foto da dona da clínica`.

### Task 4: Apply the identity in the panel

**Files:**
- Modify: `src/app/layout.tsx` (import `@fontsource-variable/fraunces`), `src/app/globals.css` (add `--font-wordmark: "Fraunces Variable", Georgia, serif` in `@theme inline`), `package.json` (`@fontsource-variable/fraunces`)
- Create: `src/components/clinic-wordmark.tsx` — `ClinicWordmark({ displayName, areaLabel }: { displayName: string; areaLabel: string | null })`: monogram circle (`bg-brand-accent text-brand-accent-foreground`, `initialsFor`) + name in `font-wordmark` + area in small spaced uppercase, as in the proposal.
- Create: `src/components/palette-style.tsx` — `PaletteStyle({ palette }: { palette: Palette })` renders `<style>{paletteCss(palette)}</style>`.
- Modify: `src/app/admin/(painel)/layout.tsx` — `getClinicBranding(session.clinicId)`; render `PaletteStyle`; Grais (`usesBrandImages`) keeps `BrandImage`, others `ClinicWordmark`; user avatar shows `<img src="/admin/foto/{id}">` when `ownerPhotoMediaId` exists; `generateMetadata` sets `icons: { icon: "/admin/icone" }` unless Grais.
- Create: `src/app/admin/(painel)/icone/route.ts` — `GET`: `requireAdmin()`, branding, returns `image/svg+xml` 64×64 circle in `palette.light.brand` with `initialsFor(displayName)` in `palette.light["brand-foreground"]` (escape text).
- Modify: `src/app/admin/(acesso)/layout.tsx`, `src/app/admin/(root)/layout.tsx`, `src/app/admin/(painel)/error.tsx` if present (else `src/app/error.tsx` stays) — render `PaletteStyle` with `PALETTES.painel`, replace the Grais logo in (acesso) with the text "Painel" in `font-heading`; `metadata.icons` → `/admin/icone-neutro` (static SVG route, neutral palette, letter "P").
- Test: `e2e/branding.spec.ts`; update `e2e/admin-auth.spec.ts` / `e2e/site.spec.ts` only where they assert the Grais logo on the sign-in screen.

**Interfaces:**
- Consumes: Task 1 `paletteCss`, `PALETTES`, `initialsFor`; Task 2 `getClinicBranding`; Task 3 photo route.
- [ ] **Step 1: Failing e2e** `e2e/branding.spec.ts` (serial, signs in with `TEST_ROOT`, creates `karina-manicure` and `sirlei-massoterapia` through `/admin/clinicas` and deletes them in `afterAll` like `e2e/clinics.spec.ts`):
  - `"the sign-in screen is neutral"`: `/admin/entrar` has no `img[alt="Grais Saúde Integrativa"]`; computed `--brand` on `html` is `#3e4c63`.
  - `"Karina's panel is pink with her initial"`: open the clinic; computed `--brand` is `#b2295b`; sidebar contains "Karina" and "Manicure"; `GET /admin/icone` body contains `>K<`.
  - `"switching to Grais restores its brand"`: open Grais; `--brand` is `#00357a`; `img[alt=""]` brand symbol visible.
  - `"no sideways scroll at 360 px"` on `/admin` for Karina.
- [ ] **Step 2:** `corepack pnpm exec playwright test e2e/branding.spec.ts` (with the pnpm shim on PATH) → FAIL.
- [ ] **Step 3:** Implement the files above.
- [ ] **Step 4:** Same command → PASS; `corepack pnpm test:e2e` → all pass.
- [ ] **Step 5:** Commit: `feat: painel com a identidade de cada clínica`.

### Task 5: "Aparência" page

**Files:**
- Create: `src/app/admin/(painel)/aparencia/page.tsx`, `actions.ts`, `palette-picker.tsx` (client), `photo-form.tsx` (client), `branding-text-form.tsx` (client)
- Modify: `src/app/admin/(painel)/layout.tsx` + `panel-nav.tsx` (menu item "Aparência", icon `brush`, after "Financeiro")
- Test: extend `e2e/branding.spec.ts`

**Interfaces:**
- Consumes: Task 2 `setClinicPalette`, `updateBrandingText`, `brandingTextSchema`, `getClinicBranding`; Task 3 `saveOwnerPhoto`, `removeOwnerPhoto`.
- Produces: actions `choosePaletteAction(paletteId: string)`, `saveBrandingTextAction(input)`, `uploadOwnerPhotoAction(formData: FormData)` (field `foto`), `removeOwnerPhotoAction()`; all `requireAdmin()` first, return `{ ok, formError?, fieldErrors? }`, `revalidatePath("/admin", "layout")` on success.
- Page: palette cards (each with a mini sidebar + "Agendar horário" phone preview using the palette's light values inline, the current one marked `aria-pressed="true"`); Grais shows "Marca própria" text instead of cards and hides the name/area form; photo section with preview (`/admin/foto/{id}`), upload (`accept="image/jpeg,image/png,image/webp"`) and "Remover foto".
- [ ] **Step 1: Failing e2e** additions:
  - `"the owner switches Karina to Marinho e coral"`: `/admin/aparencia`, click the card "Marinho e coral" → after reload `--brand` is `#22315a` and the card has `aria-pressed="true"`.
  - `"changes the area label"`: fill "Área" with "Unhas e cuidados", save → sidebar shows "Unhas e cuidados".
  - `"uploads and removes the photo"`: `setInputFiles` with a small PNG made in the test → sidebar avatar `img[src^="/admin/foto/"]` visible; "Remover foto" → avatar back to the initial.
  - `"Grais shows Marca própria"`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** run → PASS; then `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm test:e2e`, build with test env values → all pass.
- [ ] **Step 5:** Docs: `docs/identidade-visual.md` gains a section "Identidade de cada clínica" (catalog, how to add a palette or a clinic to `CLINIC_BRANDING`, contrast test); README "O que já funciona" mentions it; `docs/multiclinica.md` "O que ainda é igual para todas" drops the visual-identity line.
- [ ] **Step 6:** Commit: `feat: tela Aparência com as paletas de cada clínica`.
