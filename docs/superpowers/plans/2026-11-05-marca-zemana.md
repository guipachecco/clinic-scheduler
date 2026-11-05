# Marca Zemana Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every screen and every clinic uses the Zemana brand (colors, fonts, logo, tab icon); the Aparência screen leaves the menu.

**Architecture:** A `zemana` palette joins the existing catalog and becomes the only palette offered to any clinic; `globals.css` gets the same values, so pages without a palette style match. Logo PNGs are cropped from the brand-manual PDF and served from `public/marca/`; `BrandImage` points at them, and the generated per-clinic wordmark and tab icon stop being used.

**Tech Stack:** Next.js 16, Tailwind v4 tokens, `@fontsource-variable/bricolage-grotesque`, Playwright (also used to rasterize the PDF with pdf.js), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-marca-zemana-design.md`

## Global Constraints

- Colors (verbatim from the manual): roxo `#2A0081`, amarelo `#F5C700`, rosa `#FFD3F0`, azul-claro `#B7E7FC`, framboesa `#BA1650`. Error color stays `#B3261E`.
- Light theme: `primary` = `brand` = `ring` = `#2A0081`; `highlight` = `#F5C700` with `highlight-foreground` `#2A0081`; `brand-accent` = `#FFD3F0` with foreground `#2A0081`; `status-confirmed` = `#2A0081`.
- Dark theme: builder's values, `brand` a very dark purple, `highlight` `#F5C700`, every pair passing the existing contrast test (≥ 4.5:1).
- Fonts: headings Bricolage Grotesque, text Figtree. Archivo and Fraunces are no longer loaded.
- Logo: never redrawn or set in another font; cropped from the manual; no logo under 120 px wide, no symbol under 16 px; `alt="Zemana"` on the logo images.
- No Grais images, colors or icon left on any screen. UI copy in Portuguese; code in English. pnpm as `corepack pnpm`.
- Brand manual: `C:\Users\Guilherme\Desktop\Zemana-Manual-de-Marca.pdf` (page 1 vertical logo; page 3 permitted versions; page 4 versions per background).

## Review Focus

- Dark theme on every screen: logo variant for dark backgrounds, no purple-on-purple (Task 3 e2e checks the dark sign-in logo source).
- Phone width 360 px with the longer "Grais Saúde Integrativa" name under the Zemana logo: no sideways scroll (Task 3 e2e).
- A clinic that had saved a non-Zemana `paletteId` before this change still shows Zemana (Task 2 test).
- Old links to `/admin/aparencia` show the panel's not-found page, in Zemana colors (Task 3 e2e).
- Browser tab on panel pages shows the Zemana symbol, not the old `/admin/icone` (Task 3 e2e checks `link[rel=icon]`).

---

### Task 1: Zemana logo files

**Files:**
- Create: `public/marca/zemana-simbolo.png`, `public/marca/zemana-simbolo-fundo-escuro.png`, `public/marca/zemana-horizontal.png`, `public/marca/zemana-horizontal-fundo-escuro.png`, `public/marca/zemana-vertical.png`, `public/marca/zemana-vertical-fundo-escuro.png`
- Replace: `src/app/icon.png` (symbol, 512×512), `src/app/apple-icon.png` (symbol, 180×180, symbol centered on `#2A0081` would break the manual — use the symbol as is on a transparent canvas)
- Delete: `public/marca/logo-marinho.png`, `logo-preto.png`, `simbolo-marinho.png`, `simbolo-preto.png` (Grais), `public/painel-icone.svg`

**Interfaces:**
- Produces: the six PNG paths above (transparent background, at least 2× the largest displayed size: vertical ≥ 600 px wide, horizontal ≥ 480 px wide, symbol ≥ 256 px).
- [ ] **Step 1:** Rasterize the manual with pdf.js in Playwright Chromium at scale ≥ 4 with a transparent canvas (no background fill): page 1 → vertical logo (light); page 3 → horizontal and symbol (light); page 4 color row, third tile (purple background) → dark-background vertical logo (yellow symbol, white name). Derive the dark horizontal and dark symbol from the same tile if needed by cropping. Crop tightly with a small even margin; for crops taken from a colored tile, remove only the tile's flat background color to transparency.
- [ ] **Step 2:** Verify each PNG by viewing it: correct variant, no clipped edges, transparent corners (read pixel (0,0) alpha = 0).
- [ ] **Step 3:** Commit: `feat: arquivos do logo da Zemana`.

### Task 2: Zemana palette and tokens

**Files:**
- Modify: `src/modules/branding/palettes.ts` (add `ZEMANA_PALETTE_ID = "zemana"`, palette `zemana` "Zemana"; `CLINIC_BRANDING` → every listed slug offers `["zemana"]`; unknown slugs → `[zemana]`; `NEUTRAL_PALETTE_ID` kept but `resolvePalette` for any slug returns `zemana`)
- Modify: `src/app/globals.css` (`:root` and `.dark` identity tokens and `status-confirmed`/`-foreground` = the zemana values; comment block describes the Zemana identity)
- Modify: `src/app/layout.tsx`, `package.json` (load `@fontsource-variable/bricolage-grotesque`; drop the Archivo and Fraunces imports and dependencies); `globals.css` `--font-heading` → `"Bricolage Grotesque Variable"`, remove `--font-wordmark`
- Test: `src/modules/branding/palettes.test.ts`, `tests/integration/branding.test.ts`

**Interfaces:**
- Produces: `ZEMANA_PALETTE_ID`; `palettesForClinic(slug)` → `[PALETTES.zemana]` for every slug; `resolvePalette(slug, stored)` → `PALETTES.zemana` always.
- [ ] **Step 1: Update tests first:**
  - `palettes.test.ts`: "every palette is readable" now includes `zemana` (unchanged loop); new `"zemana matches the manual"`: `light.primary === "#2a0081"`, `light.brand === "#2a0081"`, `light.highlight === "#f5c700"`, `light["highlight-foreground"] === "#2a0081"`, `light["brand-accent"] === "#ffd3f0"`, `dark.highlight === "#f5c700"`; `"every clinic sees only zemana"`: `palettesForClinic(s).map(p => p.id)` → `["zemana"]` for `grais`, `karina-manicure`, `nova`; `resolvePalette("karina-manicure", "karina-rosa").id` → `"zemana"`. Replace the old per-clinic expectations; keep the "grais is today's globals.css" test only if renamed to check the Grais palette entry still exists unchanged in `PALETTES` (not offered).
  - `branding.test.ts`: new clinics (`karina-manicure`, `clinica-nova`) and Grais → `palette.id === "zemana"`; `setClinicPalette(id, "karina-rosa")` → `{ ok: false }`; `setClinicPalette(id, "zemana")` → `{ ok: true }`; a row whose `theme.paletteId` is `"karina-rosa"` (set directly in SQL) → `getClinicBranding` returns `zemana`; `usesBrandImages` → `false` for every clinic.
- [ ] **Step 2:** `corepack pnpm exec vitest run --project unit src/modules/branding` and `corepack pnpm exec vitest run --project integration tests/integration/branding.test.ts` → FAIL.
- [ ] **Step 3:** Implement. `getClinicBranding.usesBrandImages` becomes `false` for all (Zemana images come from `BrandImage` for every clinic in Task 3; keep the field for the type).
- [ ] **Step 4:** Both commands → PASS; `corepack pnpm test` → all pass.
- [ ] **Step 5:** Commit: `feat: paleta e fontes da Zemana`.

### Task 3: Zemana on every screen; Aparência leaves

**Files:**
- Modify: `src/components/brand-image.tsx` — `BrandImage({ kind: "vertical" | "horizontal" | "symbol"; size?: number; className?: string })`, `alt="Zemana"`, renders the light variant with `dark:hidden` and the dark-background variant with `hidden dark:block` (same pattern as today); in the panel sidebar (always purple) use a `onBrand` prop that always renders the dark-background variant.
- Modify: `src/app/admin/(painel)/layout.tsx` — sidebar: `BrandImage kind="horizontal" onBrand` (≥ 120 px wide), clinic name below in `text-sm`, "Trocar de clínica" for root; avatar back to the user initial (no owner photo); remove `PaletteStyle`, `ClinicWordmark` and `generateMetadata` icon override; remove the "Aparência" nav item and the `brush` icon from `panel-nav.tsx`.
- Modify: `src/app/admin/(acesso)/layout.tsx` (vertical logo instead of the "Painel" text; drop `PaletteStyle` and the `painel-icone.svg` metadata), `src/app/admin/(root)/layout.tsx` (horizontal logo `onBrand` in the header; drop `PaletteStyle`/icon metadata), `src/app/page.tsx` (vertical logo).
- Delete: `src/app/admin/(painel)/aparencia/` (page, actions, forms), `src/app/admin/(painel)/icone/route.ts`, `src/components/clinic-wordmark.tsx`, `src/components/palette-style.tsx` if unused.
- Keep: `src/modules/branding/*` and `src/app/admin/(painel)/foto/[id]/route.ts` (unused now, per spec path A).
- Test: `e2e/branding.spec.ts` (rewrite), `e2e/admin-auth.spec.ts`, `e2e/site.spec.ts`, `e2e/clinics.spec.ts` where they assert "Painel"/old logo/per-clinic colors.
- Docs: `docs/identidade-visual.md` (rewrite for Zemana: colors with uses, fonts, logo files and where each appears, link to the manual rules), `docs/multiclinica.md` and README (brand is Zemana for all clinics; Aparência removed).

**Interfaces:**
- Consumes: Task 1 PNG paths; Task 2 tokens.
- [ ] **Step 1: Rewrite `e2e/branding.spec.ts`** (serial, `TEST_ROOT_BRANDING`, creates and cleans up `karina-manicure` as today):
  - `"the sign-in screen is Zemana"`: `img[alt="Zemana"]` visible; computed `--brand` on `html` is `#2a0081`; in dark theme the visible logo `src` contains `fundo-escuro`.
  - `"every clinic panel is Zemana"`: open Grais then Karina: `--brand` is `#2a0081` in both; sidebar shows the clinic name and `img[alt="Zemana"]`; no `img[src*="logo-marinho"], img[src*="simbolo-marinho"]` on the page.
  - `"the tab icon is the Zemana symbol"`: `link[rel="icon"]` href does not contain `/admin/icone` and the menu has no "Aparência" link.
  - `"old Aparência links are not found"`: `/admin/aparencia` shows "Página não encontrada" with `--brand` `#2a0081`.
  - `"no sideways scroll at 360 px"` on Grais `/admin`.
- [ ] **Step 2:** `pnpm exec playwright test e2e/branding.spec.ts` (pnpm shim on PATH) → FAIL.
- [ ] **Step 3:** Implement the files above; update the other e2e assertions that referenced the "Painel" heading or Grais logo to the Zemana logo.
- [ ] **Step 4:** `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, build with test env values, `pnpm test:e2e` → all pass.
- [ ] **Step 5:** Commit: `feat: marca Zemana em todas as telas`.
