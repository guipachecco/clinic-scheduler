# Painel novo (celular e computador) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner's panel opens on her day: a new Início (greeting, today's numbers, next client, today's list, alerts) on phone and computer, a phone bottom bar with a "Mais" sheet, a phone-only day-list agenda with free intervals, card polish, and cancelled appointments moved out of "Próximos horários" in the client area.

**Architecture:**
- **Pure logic:** day maths (free intervals, summary numbers, greeting, "em N min") lives in pure functions with unit tests.
- **Data:** one panel data module reads a day's appointments, prices, hours and blocks through `inClinic`.
- **Pages:** they compose these. The computer agenda calendar is untouched; the phone list is rendered next to it and shown with responsive classes.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before routing or Server Action code), Tailwind, Drizzle + node-postgres, Luxon, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-painel-celular-design.md` (including its section "Detalhes decididos"). Approved mockups: `.superpowers/brainstorm/1317-1794100315/content/painel-celular-v1.html` (screens A, B, C; they use placeholder data).

## Global Constraints

- **Copy:** UI copy in pt-BR; code comments in English.
- **Icons:** no emojis. Icons are inline stroke SVGs in the style of `src/app/admin/(painel)/panel-nav.tsx` (24×24, `fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`, `aria-hidden="true"`).
- **Theme and breakpoint:**
  - Zemana theme tokens only (`bg-brand`, `text-brand-foreground`, `bg-highlight`, `bg-card`, `status-*` colours…); light and dark themes must work.
  - Phone means below Tailwind `md` (768 px), computer means `md` and up. Touch targets are ≥ 44 px on phone.
- **Computer agenda:** `src/app/admin/(painel)/agenda/agenda-calendar.tsx` and the calendar's behaviour do not change.
- **Clinic time zone:**
  - **Rule:** all "today/now" logic uses the clinic time zone (`clinics.timezone`).
  - **Weekdays:** `DayHours.weekday` uses the same convention as `src/modules/booking/slots.ts` (`luxonWeekday % 7`, Sunday = 0).
- **Counting and price:**
  - **Excluded:** "Hoje", "pelo site" and "previsto" exclude statuses `cancelled` and `no_show`.
  - **"previsto":** sums the current `services.price_cents` of the remaining appointments, ignoring `price_display`. If at least one counted appointment has no price, the label is `R$ X+`; if none has a price, the number is hidden.
- **Free intervals:**
  - **Occupied:** every appointment except `cancelled` occupies time.
  - **Bounds:** each business-hours interval of the day is split separately; blocks are subtracted.
  - **Today:** for today, time before "now rounded up to the clinic's `slot_step_minutes`" is not free.
  - **Minimum size:** only gaps ≥ `slot_step_minutes` are shown.
  - **Link:** `/admin/agenda/novo?inicio=yyyy-MM-ddTHH:mm` (the format `novo/page.tsx` already accepts).
- **Avisos and anonymized patients:**
  - "N avisos" = pending links (`listPendingLinks`) + `countRequestedFrom(clinicId, now)`.
  - An anonymized patient shows as "Paciente anonimizada".
- **Shell:**
  - `pnpm` is not on PATH: use `npx` with `C:\Program Files\nodejs` first on PATH.
  - Playwright needs a pnpm shim on PATH (a scratch folder with `pnpm.cmd` = `@corepack pnpm %*`), and Docker PostgreSQL on 5432.
- **Commits:**
  - Use `git -c user.name="Guilherme" -c user.email="pachecaddass@gmail.com" commit`, with a pt-BR message and trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Never `git stash`. Commit only your task's files.

## Review Focus

1. **A day with lunch break, a block and appointments that overlap the break edges.** Free blocks must never cover the break, a block, or an appointment's time. Pinned in Task 1 unit tests.
2. **Today, late in the day.** Free blocks that already passed must not show, and "Próxima" must skip appointments already started, falling back to the next day's first appointment. Pinned in Tasks 1 and 4.
3. **An owner with no services priced.** "previsto" must disappear, not show "R$ 0". With some priced, it shows "+". Pinned in Task 1.
4. **The phone at 360 px.** The bottom bar shows all four items without horizontal scroll, the floating "Agendar" never covers the last list item, and every menu destination is reachable through "Mais". Pinned in Task 3's e2e.
5. **The computer at ≥ 768 px.** The sidebar and the agenda calendar look and behave as before, and the phone list is not visible. Pinned in Tasks 3 and 5's e2e.

---

### Task 1: Pure day logic

**Files:**
- Create: `src/modules/dashboard/day.ts`, `src/modules/dashboard/day.test.ts`

**Interfaces:**
- Produces:
  - **Types:**
    - `export type DayItem = { id: string; startsAt: Date; endsAt: Date; status: "requested" | "confirmed" | "cancelled" | "completed" | "no_show"; online: boolean; priceCents: number | null; patientId: string; patientName: string; patientPhone: string | null; serviceName: string; durationMinutes: number }`.
    - `export type FreeInterval = { start: Date; end: Date }`.
  - `export function freeIntervals(input: { date: string; zone: string; hours: DayHours[]; blocks: { startsAt: Date; endsAt: Date }[]; items: Pick<DayItem, "startsAt" | "endsAt" | "status">[]; stepMinutes: number; now: Date }): FreeInterval[]`, where `date` is `yyyy-mm-dd` local.
  - `export function daySummary(items: DayItem[]): { count: number; online: number; previsto: { cents: number; partial: boolean } | null }`.
  - `export function nextItem(items: DayItem[], now: Date): DayItem | null`: the first item with `startsAt > now` and status not in cancelled/no_show/completed.
  - `export function greeting(now: Date, zone: string): "Bom dia" | "Boa tarde" | "Boa noite"`, with boundaries 05:00–11:59 / 12:00–17:59 / otherwise.
  - `export function startsIn(start: Date, now: Date): string`: "em N min" below 60 min, else "em N h" (floor), and "agora" when ≤ 0.

- [ ] **Step 1: Write the failing tests** in `day.test.ts`, with zone `America/Sao_Paulo` and date `2026-11-09` (a Monday, weekday 1).
  - `freeIntervals`:
    - hours 09:00–12:00 and 13:00–18:00, a confirmed appointment 10:00–11:00, a `completed` 13:00–13:30, a `cancelled` 15:00–16:00, a block 17:00–18:00, step 30, `now` the day before → free = [09:00–10:00, 11:00–12:00, 13:30–17:00]. The cancelled one does not occupy, and lunch is not free.
    - same with `now` = 2026-11-09 11:10 local → [11:30–12:00, 13:30–17:00].
    - a 20-minute gap with step 30 is omitted.
    - no hours for that weekday → [].
  - `daySummary`:
    - items with prices 12000, 8000, null (confirmed), plus a no_show priced 5000 and a cancelled priced 5000 → `{ count: 3, online: <count of online among the 3>, previsto: { cents: 20000, partial: true } }`.
    - all counted items without price → `previsto: null`.
  - `nextItem`: skips a started item and a cancelled one, and returns null when none.
  - `greeting`: 04:59 → "Boa noite", 05:00 → "Bom dia", 12:00 → "Boa tarde", 18:00 → "Boa noite" (all local times).
  - `startsIn`: 25 min → "em 25 min", 59 → "em 59 min", 60 → "em 1 h", 150 → "em 2 h", −5 → "agora".
- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run src/modules/dashboard/day.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `day.ts`.** Use Luxon in the clinic zone. Pure: no imports from `@/db` except types.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Commit** — `feat: cálculos do dia para o painel`.

---

### Task 2: Panel day data

**Files:**
- Create: `src/modules/dashboard/dashboard.ts`, `tests/integration/dashboard.test.ts`

**Interfaces:**
- Consumes:
  - `DayItem`, `freeIntervals`, `daySummary`, `nextItem` (Task 1);
  - `inClinic` from `@/db/client`;
  - `findBlocksAndHours` and `getSlotStepMinutes` from `@/modules/schedule/schedule`;
  - `localDayRange` and `todayLocal` from `@/modules/schedule/time`;
  - `countRequestedFrom` from `@/modules/appointments/appointments`;
  - `listPendingLinks` from `@/modules/patients/links`.
- Produces:
  - `export async function getDayAgenda(clinicId: string, date: string, now?: Date): Promise<{ date: string; zone: string; items: DayItem[]; free: FreeInterval[]; closed: boolean; blocks: { title: string | null; allDay: boolean }[] }>`. `items` are all statuses ordered by `startsAt`; price comes from a join with `services` on (clinic_id, service_id); `patientName` is "Paciente anonimizada" when anonymized.
  - `export async function getWeekMarks(clinicId: string, from: string, days: number): Promise<string[]>`: local dates in [from, from+days) that have at least one non-cancelled appointment.
  - `export async function getPanelHome(clinicId: string, now?: Date): Promise<{ today: Awaited<ReturnType<typeof getDayAgenda>>; summary: ReturnType<typeof daySummary>; next: DayItem | null; nextDayFirst: DayItem | null; alerts: number }>`. `nextDayFirst` is the first non-cancelled appointment on the next day that has one, looking ahead at most 14 days, and only when `next` is null.
  - `export async function getClinicTimezoneForPanel(clinicId: string): Promise<string>`, if no equivalent helper exists; reuse one if it does.

- [ ] **Step 1: Write the failing integration test** `tests/integration/dashboard.test.ts`, in the fixture style of `tests/integration/appointments.test.ts`, with fictitious data under a dedicated tag and cleanup scoped to it. Cases:
  - `getDayAgenda` returns items in order with price from the service, includes the cancelled one, computes `free` that excludes appointments, lunch and a block, and reports `closed: true` on a weekday without hours.
  - another clinic's appointments never appear.
  - an anonymized patient's item has `patientName: "Paciente anonimizada"` and `patientPhone: null`.
  - `getWeekMarks` marks only days with non-cancelled appointments.
  - `getPanelHome` with `now` before the first appointment → `next` is it; with `now` after the last → `next` null and `nextDayFirst` is the next day's first; `alerts` equals pending links plus requested from now.
- [ ] **Step 2: Run it and see it fail.** Run `npx vitest run tests/integration/dashboard.test.ts`.
- [ ] **Step 3: Implement `dashboard.ts`.** Add `import "server-only"`. Use one `inClinic` transaction per call where practical.
- [ ] **Step 4: Run it and the related suites.** Run `npx vitest run tests/integration/dashboard.test.ts tests/integration/appointments.test.ts tests/integration/schedule.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat: dados do dia para o painel`.

---

### Task 3: Panel shell — phone bottom bar, "Mais" sheet, card polish

**Files:**
- Modify: `src/app/admin/(painel)/layout.tsx`, `src/app/admin/(painel)/panel-nav.tsx`, `src/components/ui/card.tsx` (rounded-2xl, soft border, `shadow-sm`)
- Create: `src/app/admin/(painel)/mobile-nav.tsx` (client component: bottom bar + "Mais" sheet)
- Test: `e2e/panel-mobile.spec.ts`

**Interfaces:**
- Consumes: the existing nav items in the layout (hrefs, labels, badge), `ThemeToggle` and `SignOutButton`.
- Produces: `MobileNav({ items, moreItems, agendaBadge }: { items: NavItem[]; moreItems: NavItem[]; agendaBadge?: number })`.
  - **items:** the bottom bar shows Início, Agenda, Pacientes and a "Mais" button.
  - **moreItems:** Serviços, Expediente, Financeiro and Minha página, plus theme and sign-out blocks.
  - **Export:** export `NavItem`/`NavIcon` from `panel-nav.tsx` and add an icon `more` (three dots).
- **Phone layout (< md):**
  - a compact top bar with the Zemana mark, the clinic name and, for root, "Trocar de clínica";
  - the horizontal top menu is hidden;
  - the bottom bar is fixed, with safe-area padding;
  - `main` gets enough bottom padding (≥ 112 px) for the bar and the floating button.
- **Computer (≥ md):** the sidebar is unchanged apart from card polish.
- **"Mais" sheet:** `role="dialog"` with `aria-modal`, labelled "Mais". It closes on Escape, a backdrop tap or navigation, and keeps focus inside while open.

- [ ] **Step 1: Write the e2e** `e2e/panel-mobile.spec.ts` (sign-in as in `e2e/branding.spec.ts`):
  - `test("phone shows the bottom bar with four items and no horizontal scroll")`: at 360×800, the bar has links Início, Agenda, Pacientes and a "Mais" button, each containing an `svg`, and `document.documentElement.scrollWidth <= 360`.
  - `test("Mais opens a sheet that reaches every other section")`: tap "Mais"; the dialog lists Serviços, Expediente, Financeiro and Minha página; tapping Minha página navigates there and the dialog is gone; Escape closes it when reopened.
  - `test("computer keeps the sidebar")`: at 1280×800, the sidebar nav (`aria-label="Menu principal"`) shows all items and the bottom bar is not visible.
- [ ] **Step 2: Run it and see it fail.** Run `npx playwright test e2e/panel-mobile.spec.ts`.
- [ ] **Step 3: Implement the layout, `MobileNav` and the card polish.**
- [ ] **Step 4: Run it plus the existing panel specs.** Run `npx playwright test e2e/panel-mobile.spec.ts e2e/branding.spec.ts e2e/agenda.spec.ts e2e/patients.spec.ts`. Expected: PASS; update only selectors that relied on the old phone top menu.
- [ ] **Step 5: Commit** — `feat: barra de navegação do painel no celular`.

---

### Task 4: New Início

**Files:**
- Modify: `src/app/admin/(painel)/page.tsx`
- Create: `src/app/admin/(painel)/home/home-header.tsx`, `home/next-card.tsx`, `home/day-list.tsx` (the list is shared with Task 5)
- Test: `e2e/panel-home.spec.ts`

**Interfaces:**
- Consumes:
  - `getPanelHome`, `greeting` and `startsIn` (Tasks 1 and 2);
  - `PendingLinkNotice`;
  - the owner photo, via the existing panel route `/admin/foto/<owner_photo_media_id>` when set, else initials. Read the id with the existing branding helper `getClinicBranding`.
- Produces: `DayList({ items, now, highlightId }: { items: DayItem[]; now: Date; highlightId?: string | null })`. It renders an ordered list:
  - each item shows "HH:mm", the patient name, the service and duration, and a status badge;
  - statuses read Confirmado, Pedido, Concluído, Faltou and Desmarcado; "Site" shows when `online`;
  - cancelled items are dimmed;
  - each item links to `/admin/agenda/<id>`.
- Page content:
  1. **Header:** `greeting` plus first name of the signed-in user, the date in full in the clinic zone, the photo or initials, and the "N avisos" pill when `alerts > 0`.
  2. **Three numbers:** "hoje", "pelo site" and "previsto". `previsto` uses BRL formatting plus "+" when partial, and is hidden when null.
  3. **"Próxima" card:**
     - shows the time, `startsIn`, name, service and duration;
     - **WhatsApp** links to `https://wa.me/<digits>` when there is a phone; **Ver ficha** links to `/admin/pacientes/<patientId>`;
     - without a next one, it shows "Sem mais atendimentos hoje", plus `nextDayFirst` when present.
  4. **"Hoje":** `DayList` and a link "Ver agenda".
  5. **Alerts:** the pending link notices.
  6. **"Agendar":** floating on phone and a normal button at the top on computer, linking to `/admin/agenda/novo`.
  7. The old paragraph "O conteúdo do site chega na próxima etapa" is removed.

- [ ] **Step 1: Write the e2e** `e2e/panel-home.spec.ts`, seeding today's appointments in the test clinic through the owner db (fixture style) and cleaning up only its rows:
  - `test("home shows today's numbers, next client and list")`:
    - at 360×800, sees "Bom dia" or "Boa tarde" or "Boa noite";
    - sees the "hoje" number equal to the seeded non-cancelled count;
    - the "Próxima" card names the seeded upcoming patient;
    - the list shows the cancelled one with "Desmarcado".
  - `test("Agendar does not cover the last list item")`: at 360×800, scrolls to the bottom and asserts that the last list item's bounding box does not intersect the floating button's.
  - `test("old placeholder text is gone")`: "O conteúdo do site chega na próxima etapa" has count 0.
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Implement the page and the components.**
- [ ] **Step 4: Run `npx playwright test e2e/panel-home.spec.ts e2e/panel-mobile.spec.ts`.** Expected: PASS.
- [ ] **Step 5: Commit** — `feat: início do painel com o dia da dona`.

---

### Task 5: Phone agenda list

**Files:**
- Modify: `src/app/admin/(painel)/agenda/page.tsx` (reads `searchParams.dia`; renders the new phone list inside `md:hidden` and wraps the existing calendar/side panel in `hidden md:block`)
- Create: `src/app/admin/(painel)/agenda/phone/day-strip.tsx`, `agenda/phone/phone-agenda.tsx`
- Test: `e2e/agenda-phone.spec.ts`

**Interfaces:**
- Consumes: `getDayAgenda` and `getWeekMarks` (Task 2), `DayList` (Task 4), `requestedList` data already loaded by the page.
- Produces: `/admin/agenda?dia=yyyy-mm-dd`, defaulting to today in the clinic zone. An invalid value falls back to today.
- **Day strip:**
  - shows 7 days starting at the Monday of the chosen day's week, with "mês de ano" above;
  - the chosen day is purple and days in `getWeekMarks` get a yellow dot;
  - the arrows link to `?dia=` ±7 days;
  - each day is a link to `?dia=`.
- **List:**
  - shows `DayList` interleaved with free blocks in time order;
  - each free block is dashed, reads "Livre das HH:mm às HH:mm · tocar para agendar" and links to `/admin/agenda/novo?inicio=<date>T<HH:mm>`;
  - the next item gets a purple border.
- **Closed or blocked day:**
  - `closed` → "Fechado";
  - an all-day block → "Bloqueado: <title or 'dia bloqueado'>".
- **Pedidos:** when there are requested ones, a top notice "N pedidos para confirmar" links to the existing requested list.
- **Floating "Agendar":** as in Task 4.

- [ ] **Step 1: Write the e2e** `e2e/agenda-phone.spec.ts`:
  - `test("phone agenda lists the chosen day with free intervals")`:
    - seed hours 09–12/13–18 and two appointments on a future weekday;
    - at 360×800 open `?dia=<that date>`;
    - see both patients in order, a "Livre das 09:00 às …" link whose href has `novo?inicio=<date>T09:00`, and no free block covering 12:00–13:00.
  - `test("day strip moves by week and marks days")`: the right arrow goes to +7 days; a day with an appointment has the dot (an element with `data-has-appointments="true"`).
  - `test("computer still shows the calendar")`: at 1280×800 the existing calendar container is visible and the phone list is not.
  - `test("invalid dia falls back to today")`.
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npx playwright test e2e/agenda-phone.spec.ts e2e/agenda.spec.ts`.** Expected: PASS, with the computer agenda specs untouched.
- [ ] **Step 5: Commit** — `feat: agenda do dia em lista no celular`.

---

### Task 6: Client area — cancelled ones leave "Próximos horários"

**Files:**
- Modify: `src/app/[slug]/meus-horarios/page.tsx`
- Test: `e2e/client-area.spec.ts` (extend)

**Interfaces:**
- Consumes: `listMyAppointments` (unchanged).
- Produces:
  - "Próximos horários" lists upcoming appointments that are not `cancelled`;
  - a new section "Desmarcados" after the past ones lists cancelled ones (upcoming and past), showing date, time and service on a muted card;
  - the section is hidden when empty.

- [ ] **Step 1: Extend the e2e:** `test("a cancelled appointment shows under Desmarcados, not Próximos horários")`. Seed an online appointment for the test client, set it `cancelled` through the owner db, open `/<slug>/meus-horarios` and assert it sits inside the "Desmarcados" region and not inside "Próximos horários".
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npx playwright test e2e/client-area.spec.ts`.** Expected: PASS.
- [ ] **Step 5: Commit** — `fix: desmarcados saem de próximos horários`.

---

### Task 7: Full verification

- [ ] **Step 1:** Run `npx eslint . --max-warnings=0`, `npx tsc --noEmit`, `npx vitest run` and the full `npx playwright test`. Expected: all pass.
- [ ] **Step 2:** Update `README.md` with one short sentence on the new Início and the phone agenda, in the repo's style. Commit — `docs: painel novo`.
