# Expediente e bloqueios (Agenda, entrega 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the admin panel, the clinic sets its weekly business hours and manages time blocks: days off, vacations, holidays and other closures. National holidays can be added with one click.

**Architecture:**

- A domain module, `src/modules/schedule/`, holds:
  - `time.ts`: pure helpers in the clinic time zone, built on Luxon;
  - `holidays.ts`: a pure national-holiday calculator;
  - `fields.ts`: Zod schemas;
  - `schedule.ts`: server-only data functions with audit.
- Thin routes live under `src/app/admin/(painel)/expediente/`.
- No migration: the `business_hours` and `time_blocks` tables already exist.

**Tech Stack:** Next.js 16 with Server Actions, Drizzle with PostgreSQL 17, Zod 4, Luxon (new dependency, also needed by FullCalendar in delivery 3), Vitest and Playwright.

**Spec:** `docs/agenda.md`, section "Entrega 2: Expediente e bloqueios", plus "Detalhes definidos na revisão do design".

## Global Constraints

- **Clinic time zone:** `America/Sao_Paulo`. Read it from `clinic_settings.timezone`, which defaults to that value. Store every instant in UTC (`timestamptz`). Business hours are local wall-clock `time` values.
- **Business hours:**
  - Each weekday 0–6 (0 = domingo) has zero or more intervals.
  - Each interval satisfies `start < end`, in `HH:MM` with 5-minute granularity.
  - Intervals of the same day must not overlap; touching, like 12:00–12:00, is allowed.
  - A day with no intervals counts as closed.
  - Saving replaces the whole week in one transaction.
- **Blocks:**
  - type `day_off` "Folga" | `vacation` "Férias" | `holiday` "Feriado" | `other` "Outro";
  - title: optional, ≤ 80 characters, with the hint "Não registre dados de pacientes aqui";
  - `allDay`, or a start and end on the same or different days.
- **All-day blocks** cover local midnight to the next local midnight of each day in the range, from the first day to the last day inclusive.
- **Block list:** shows blocks ending after now, ordered by start.
- **Deleting:** only blocks that start in the future can be deleted. Past and ongoing blocks are kept as history.
- **Conflicts:** creating a block that covers active appointments (`requested` / `confirmed`, overlapping by `occupied_from`/`occupied_until`) still succeeds. The response lists those appointments' local start times, shown as dd/mm HH:MM without patient names, with the warning "Estes atendimentos continuam marcados; remarque ou cancele se precisar." Nothing is cancelled.
- **National holidays:** for a chosen year, the holidays are:
  - 1º/1 Confraternização Universal;
  - Sexta-feira Santa (Easter − 2 days);
  - 21/4 Tiradentes;
  - 1º/5 Dia do Trabalho;
  - 7/9 Independência;
  - 12/10 Nossa Senhora Aparecida;
  - 2/11 Finados;
  - 15/11 Proclamação da República;
  - 20/11 Dia Nacional de Zumbi e da Consciência Negra;
  - 25/12 Natal.

  They are created as all-day `holiday` blocks titled with the holiday name. A holiday is skipped when a `holiday` block already starts on that local date, so running the button twice creates nothing new. The response reports how many were created.

- **Audit:**
  - `business_hours.updated` with `changes: { weekdays: number[] }` (the days whose intervals changed);
  - `time_block.created`, `time_block.deleted`, `time_block.holidays_added` with `changes: { count }`;
  - all entries carry `actorType: "admin"` and `actorUserId`. Never put titles in `changes`.
- **Access:** every page and Server Action calls `requireAdmin()` first.
- **Errors:** unexpected errors become a generic Portuguese message. Actions return success values; they do not `redirect()`, and the client navigates or refreshes.
- **UI:**
  - Portuguese copy;
  - identity tokens only;
  - yellow only for active or attention states;
  - `h-11` controls;
  - works at 360 px and in the dark theme.
- **Process:**
  - run pnpm as `corepack pnpm`;
  - no commits without the user's authorization.

## Review Focus

- **Daylight saving time, if Brazil brings it back.** A local 08:00–12:00 interval or an all-day block on a transition date converts with the correct offset, and an all-day block lasts 23 or 25 hours. Test: a unit test with a historical DST date (2018-11-04 in `America/Sao_Paulo`).
- **Easter-based holidays across years.** Good Friday is 2026-04-03, 2027-03-26 and 2030-04-19. Test: unit.
- **Overlapping intervals typed out of order.** Two intervals like 13:30–18:00 and 08:00–12:00 save in sorted order; 08:00–12:00 with 11:00–14:00 gives a field error. Test: unit schema plus integration.
- **A block ending before it starts, or a timed block with an empty end:** field error, not a 500. Test: unit.
- **A block covering an appointment that runs past midnight.** The overlap uses `occupied_*`, not `starts_at`. Test: integration.

---

### Task 1: Schedule module

**Files:**

- Modify: `package.json` and `pnpm-lock.yaml` (`corepack pnpm add luxon` and `corepack pnpm add -D @types/luxon`)
- Create:
  - `src/modules/schedule/time.ts`
  - `src/modules/schedule/holidays.ts`
  - `src/modules/schedule/fields.ts`
  - `src/modules/schedule/schedule.ts`
- Test:
  - `src/modules/schedule/time.test.ts`
  - `src/modules/schedule/holidays.test.ts`
  - `src/modules/schedule/fields.test.ts`
  - `tests/integration/schedule.test.ts`

**Interfaces (Produces):**

- `time.ts`:
  - `CLINIC_TIME_ZONE = "America/Sao_Paulo"`;
  - `localToUtc(date: string /* YYYY-MM-DD */, time: string /* HH:MM */, zone?): Date`;
  - `localDayRange(firstDate: string, lastDate: string, zone?): { startsAt: Date; endsAt: Date }`, from the first day's 00:00 to the day after the last day at 00:00;
  - `formatLocal(date: Date, pattern: "dd/MM HH:mm" | "dd/MM/yyyy" | "HH:mm", zone?): string`;
  - `todayLocal(zone?): string`.
- `holidays.ts`:
  - `easterSunday(year: number): string` (`YYYY-MM-DD`);
  - `nationalHolidays(year: number): { date: string; name: string }[]`, ten items in date order.
- `fields.ts`:
  - `WEEKDAYS` (labels "Domingo" … "Sábado");
  - `TIME_BLOCK_TYPES` (value/label pairs);
  - `businessHoursSchema`: input `{ days: { weekday: number; intervals: { start: string; end: string }[] }[] }`; output is the same, with each day's intervals sorted;
  - `timeBlockSchema`, with input:
    - `type`;
    - `title` (string);
    - `allDay` (boolean / `"on"`);
    - `startDate`, `endDate` (`YYYY-MM-DD`);
    - `startTime`, `endTime` (`HH:MM`, required when not all-day).

    Its output is `{ type, title: string | null, startsAt: Date, endsAt: Date, allDay }`, computed with `time.ts`.

  - The input and output types for both schemas.
- `schedule.ts`, which starts with `import "server-only"`:
  - `getBusinessHours(): Promise<{ weekday; intervals: { start; end }[] }[]>`, always seven days;
  - `saveBusinessHours(values, actorUserId): Promise<{ ok: true }>`;
  - `listUpcomingBlocks(now?: Date): Promise<TimeBlockItem[]>`, where `TimeBlockItem` is `{ id, type, title, startsAt, endsAt, allDay, deletable }`;
  - `createTimeBlock(values, actorUserId): Promise<{ ok: true; id; conflicts: string[] }>`, with conflicts formatted `dd/MM HH:mm`;
  - `deleteTimeBlock(id, actorUserId, now?): Promise<{ ok: true } | { ok: false; reason: "not_found" | "not_deletable" }>`;
  - `addNationalHolidays(year, actorUserId): Promise<{ ok: true; created: number }>`;
  - `findBlocksAndHours(range: { from: Date; to: Date })`, for delivery 3. It returns the blocks and the business hours that intersect the range.

Steps:

- [ ] **Step 1: Write failing unit tests:**
  - **Conversions:** `localToUtc("2026-11-03","08:00")` → `2026-11-03T11:00:00Z`.
  - **Day ranges:** `localDayRange("2026-12-24","2026-12-25")` → from `2026-12-24T03:00Z` to `2026-12-26T03:00Z`.
  - **DST:** a range over 2018-11-04 (Brazilian DST start) has a 23-hour first day.
  - **Easter:** `easterSunday` 2026 → 2026-04-05, 2027 → 2027-03-28, 2030 → 2030-04-21.
  - **Holiday list:** `nationalHolidays(2026)` has 10 items, including 2026-04-03 "Sexta-feira Santa" and 2026-11-20.
  - **Schema rejections:** overlapping intervals, `start >= end`, a non-5-minute time, an end date before the start date, and a timed block missing `endTime`.
  - **Sorting:** the schema sorts intervals.
- [ ] **Step 2: Write failing integration tests:**
  - save and get the week round-trip; a second save replaces the first;
  - the audit lists only the changed weekdays;
  - `createTimeBlock` returns conflicts for a confirmed appointment inside the range, and none for a cancelled one;
  - an appointment whose `occupied_until` crosses into the block counts as a conflict;
  - deleting a future block works; deleting an ongoing block returns `not_deletable`;
  - `addNationalHolidays(2026)` creates 10, and running it again creates 0;
  - a manually created holiday on 2026-12-25 is skipped;
  - `listUpcomingBlocks` hides ended blocks.

  For appointment fixtures, copy the style of `tests/integration/appointments-overlap.test.ts`.

- [ ] **Step 3: Run** `corepack pnpm test:unit` and `corepack pnpm test:integration`. Expected: FAIL.
- [ ] **Step 4: Implement.** Use Luxon `DateTime.fromISO(..., { zone })`.
- [ ] **Step 5: Run** unit, integration, `typecheck` and `lint`. Expected: PASS.

### Task 2: Expediente and bloqueios screens, navigation, docs

**Files:**

- Create under `src/app/admin/(painel)/expediente/`:
  - `page.tsx`: the weekly hours editor plus a link to the blocks;
  - `business-hours-form.tsx`: client; a row per weekday with intervals added and removed by buttons, and the time inputs `type="time"` `step=300`;
  - `actions.ts`;
  - `bloqueios/page.tsx`: the upcoming blocks list, the "Novo bloqueio" form and the holidays button;
  - `bloqueios/time-block-form.tsx`;
  - `bloqueios/holidays-button.tsx`, with a year select (current and next year).
- Modify: `src/app/admin/(painel)/layout.tsx`. Add the nav item `{ href: "/admin/expediente", label: "Expediente" }` after "Serviços". Its active state covers `/admin/expediente/bloqueios`, because prefix matching already exists.
- Modify: `README.md` ("O que já funciona") and `docs/decisoes-tecnicas.md` (a short "Expediente e bloqueios" section: time zone, all-day definition, holiday list, conflicts only warned).
- Test: `e2e/schedule.spec.ts`, with a fourth fictitious account created in `e2e/global-setup.ts`, the same way as the others.

**Interfaces:** consumes Task 1. Each action:

- calls `requireAdmin()`;
- parses with the schema;
- returns `{ ok: true, … }` or `{ ok: false, fieldErrors, formError }`;
- uses no `redirect`.

The client calls `router.refresh()` on success and shows a `role="status"` message:

- "Expediente salvo.";
- "Bloqueio criado." (followed by the conflict warning and list, when there are conflicts);
- "Bloqueio excluído.";
- "N feriados adicionados." / "Nenhum feriado novo.".

Steps:

- [ ] **Step 1: Write the failing e2e test** `test.describe("expediente")`:
  - The nav link "Expediente" is current.
  - Set Monday 08:00–12:00 and 13:30–18:00, save, and see "Expediente salvo.". After a reload the values persist.
  - Overlapping Monday intervals show a field error.
  - Open "Bloqueios" and create an all-day "Folga" for a date 30 days ahead. It is listed with dd/mm/aaaa and "Dia inteiro".
  - Delete it with a confirmation; it disappears and "Bloqueio excluído." is shown.
  - Click "Adicionar feriados nacionais" for the next year: it reports "10 feriados adicionados.". A second click reports "Nenhum feriado novo.".
- [ ] **Step 2: Run** `test:e2e -g expediente` (with the PATH shim). Expected: FAIL (404).
- [ ] **Step 3: Implement.** Delete asks for confirmation through a small inline confirm step (two buttons), not `window.confirm`. Weekday rows stack on mobile.
- [ ] **Step 4: Update the docs.**
- [ ] **Step 5: Run the full suite:** `lint`, `typecheck`, `test:unit`, `test:integration`, `test:e2e`, `build`, plus a Prettier check (stdin) on every changed file. Expected: all pass.
