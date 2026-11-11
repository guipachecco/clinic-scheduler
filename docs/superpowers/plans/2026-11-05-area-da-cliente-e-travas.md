# Área da cliente e travas no banco — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clients of each clinic sign up, sign in, reset their password by e-mail and book a free slot that lands confirmed in the owner's agenda. PostgreSQL itself (separate login roles and row-level security) keeps every clinic, and every client, inside their own rows.

**Architecture:**

- **Login roles:** migration 0011 creates four NOLOGIN roles (`app_auth`, `app_panel`, `app_client`, `app_platform`), with grants and RLS policies keyed on `current_setting('app.clinic_id', true)` / `app.patient_id` / `app.user_id`. `runMigrations` then turns each role into a LOGIN role with the password from its `DATABASE_URL_*`.
- **Scoped access:** `src/db/client.ts` exposes one pool per role plus `inClinic(clinicId, fn)` and `asClient(ctx, fn)`. Each opens a transaction and sets the settings with `set_config(..., true)`. Every panel module moves from the owner `db` to `inClinic`.
- **Client data paths:** clients never read other people's rows; the slug lookup, client signup and busy intervals go through `SECURITY DEFINER` functions.
- **Booking:** a pure slot calculator plus a booking module drive the new `/<slug>` pages.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before routing/Server Action code), Better Auth 1.7, Drizzle + node-postgres, PostgreSQL 17, Luxon, Zod, Vitest, Playwright, Resend (HTTP API via `fetch`, no SDK).

**Spec:** `docs/superpowers/specs/2026-11-05-area-da-cliente-e-travas-design.md`

## Global Constraints

- **Roles and URLs:**
  - Role names are exactly `app_auth`, `app_panel`, `app_client`, `app_platform`; the owner `DATABASE_URL` is for migrations and test fixtures only.
  - Env vars: `DATABASE_URL_AUTH`, `DATABASE_URL_PANEL`, `DATABASE_URL_CLIENT`, `DATABASE_URL_PLATFORM`; dev/test passwords `<role>_dev` (e.g. `postgres://app_panel:app_panel_dev@localhost:5432/clinic_scheduler`).
- **RLS:**
  - App roles are never table owners and never `BYPASSRLS`.
  - Missing `app.clinic_id` → zero rows (`current_setting(..., true)` returns null, so the comparison is null).
  - Every table with a `clinic_id` column has RLS enabled and a policy for `app_panel`.
  - `app_client` has no privilege on finance tables (`quotes`, `sales`, `sale_*`, `installments`, `payments`, `expenses`, `expense_categories`, `payment_methods`), `audit_logs` SELECT, `media`, `users`, `sessions`, `accounts`, `verifications`, `two_factors`.
- **Clients:**
  - Role `client` added to `user_role`. Check: `root` ⇒ `clinic_id` null; `admin` ⇒ `clinic_id` not null; `client` ⇒ `clinic_id` null.
  - Sessions: client 30 days (`60*60*24*30`), admin/root 12 h (unchanged). Clients have no 2FA.
  - Online bookings: `status='confirmed'`, `source='online'`, audit actor `patient`. `services.requiresApproval` is ignored online and leaves the services form.
  - Only the owner cancels or reschedules. The client area has no cancel/reschedule control.
- **Booking rules:** online booking respects `clinics.onlineBookingEnabled`, `services.onlineBookingEnabled` (active, non-flexible only), `minAdvanceMinutes`, `maxAdvanceDays`, `slotStepMinutes` and `maxActiveAppointmentsPerPhone` (counted per patient record). Time zone `America/Sao_Paulo` (clinic `timezone`).
- **Reserved slugs:** `admin`, `api`, `entrar`, `marca`, `_next`, `icon.png`, `apple-icon.png`, `favicon.ico`, `robots.txt`, `sitemap.xml`. Creating a clinic with one returns the field error "Esse endereço é reservado pelo sistema".
- **Existing-patient rule:**
  - A signup whose E.164 phone matches a non-anonymized patient of that clinic gets a provisional record (`pending_link_patient_id` = matched id) until the owner decides.
  - The client never sees the matched record's data before confirmation.
- **E-mail:**
  - `sendEmail({ to, subject, html, text })`. Production: Resend with `RESEND_API_KEY` and `EMAIL_FROM`, required when `NODE_ENV=production`.
  - Otherwise each message is written as JSON to `EMAIL_OUTBOX_DIR` (default `.emails/`, git-ignored).
  - Texts in Portuguese, Zemana logo, clinic name.
- **Copy:**
  - UI copy in Portuguese; code in English; `corepack pnpm`.
  - No patient data in logs or error messages.
  - Exact strings: "Esse horário acabou de ser preenchido", "Agendamento online indisponível", "Confirme seu e-mail", "Para desmarcar ou mudar, fale com <nome da clínica>", "<nome> se cadastrou online. É a mesma pessoa desta ficha?".
- **Visual:** Zemana (header `BrandImage kind="horizontal"` + clinic name), one column, no sideways scroll at 360 px, dark mode works.
- **Commits:** `git -c user.name="Guilherme" -c user.email="pachecaddass@gmail.com" commit`, message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push.

**Ruling (planner):** the spec asks for `FORCE ROW LEVEL SECURITY`. FORCE also binds the table owner, which runs migrations and test fixtures (and is not superuser on Neon), so data migrations would see nothing. The plan does **not** force. Instead, the catalog test asserts that no app role owns a table or has `BYPASSRLS`, which gives the same guarantee for every role the app uses.

## Review Focus

- **The root in two clinics:** the root user opens clinic A, then switches to B in the same browser. Every read must use B's `app.clinic_id` and never a pooled connection still carrying A. (`set_config` local to the transaction; Task 2 test runs two `inClinic` calls on a 1-connection pool.)
- **A query outside `inClinic`:** a panel query that runs outside `inClinic` must return nothing or fail, not everything. (Task 1 test: `app_panel` without a setting sees 0 rows.)
- **Two bookings for one slot:** two clients book the same slot at the same moment; one wins, and the other sees "Esse horário acabou de ser preenchido", never a 500. (Task 5 test.)
- **A client reaching panel or finance data:** a client calling panel Server Actions or the `/admin/foto/[id]` route gets not-found, never data. (Task 6 e2e.)
- **A clinic sliding toward its limits:** the owner shortens business hours or adds a block after a client has viewed the slot list. The confirm step re-checks under the lock and refuses. (Task 5 test.)

---

### Task 1: Database roles, grants and panel RLS

**Files:**

- Create: `drizzle/0011_db_roles.sql` (hand-written; add to `drizzle/meta/_journal.json` like 0007), `tests/integration/db-roles.test.ts`, `tests/helpers/roles.ts`
- Modify: `src/db/migrate.ts`, `src/lib/env.ts`, `.env.example`, `docker-compose.yml` (comment only), `vitest.config.ts`, `playwright.config.ts`, `src/db/client.ts`

**Interfaces:**

- Produces:
  - `src/db/client.ts`: `db` (owner pool, unchanged), `authDb`, `panelDb`, `clientDb`, `platformDb` (Drizzle instances over separate pools);
  - `inClinic<T>(clinicId: string, fn: (tx: Tx) => Promise<T>): Promise<T>`;
  - `type Tx`;
  - `tests/helpers/roles.ts`: `ROLE_URLS` for tests.
- `runMigrations(ownerUrl, roleUrls?: Record<RoleName, string>)`: after migrating, `ALTER ROLE <name> LOGIN PASSWORD <from URL>` for each given URL. The URL's user must equal the role name, otherwise it throws "DATABASE_URL_PANEL deve usar o usuário app_panel".

Steps:

- [ ] **Step 1: Write `tests/integration/db-roles.test.ts`:**
  - `"no app role owns a table or bypasses RLS"`: from `pg_class`/`pg_roles`, no table owned by the 4 roles; `rolbypassrls` false for all.
  - `"every clinic table has RLS and a panel policy"`: every `public` table with a `clinic_id` column has `relrowsecurity` and at least one `pg_policies` row with `app_panel` in `roles`.
  - `"panel sees only the clinic it set"`: insert a patient in `CLINIC` and in `otherClinic()` as owner. Then with `panelDb`:
    - `inClinic(CLINIC, …)` selects only the first;
    - an insert with the other clinic's id fails with RLS error code `42501`.
  - `"panel without a clinic sees nothing"`: raw `panelDb.select().from(patients)` outside `inClinic` → `[]`.
  - `"panel cannot touch auth tables"`: `select from users` as `app_panel` → error `42501`.
  - `"settings do not leak between transactions"`: pool size 1, `inClinic(A)` then `inClinic(B)` → each sees only its clinic.
- [ ] **Step 2:** `corepack pnpm exec vitest run --project integration tests/integration/db-roles.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
  - **0011 migration:**
    - create the roles if missing (`DO $$ … IF NOT EXISTS (select from pg_roles …)`), NOLOGIN, NOBYPASSRLS;
    - `GRANT USAGE ON SCHEMA public` and sequences as needed;
    - `app_auth`: CRUD on the six auth tables plus SELECT on `clinics(id, is_active)`, if Better Auth hooks need it;
    - `app_panel`: CRUD on every clinic table, SELECT on `clinics` (policy `id = setting`);
    - `app_platform`: CRUD on `clinics` plus the tables `createClinic` seeds, and CRUD on `users`/`accounts`/`two_factors` for `admin-accounts.ts`, with permissive policies `to app_platform using (true)`;
    - `ENABLE ROW LEVEL SECURITY` on every clinic table and on `clinics`;
    - panel policy `for all to app_panel using (clinic_id = nullif(current_setting('app.clinic_id', true), '')::uuid) with check (same)`.
  - **Env:** add the four URLs to `serverEnvSchema` (required). Vitest and Playwright envs get the dev URLs pointing at their test databases.
- [ ] **Step 4:** the same command → PASS. `corepack pnpm test` still passes: modules still use the owner `db`.
- [ ] **Step 5:** Commit `feat: usuários do banco e travas por clínica`.

### Task 2: Panel, auth and platform run on their own roles

**Files:**

- Modify: every file under `src/modules/**` that imports `db` (appointments, patients, schedule, services, finance/_, branding/_, clinics, auth/admin-accounts), `src/lib/auth.ts` (adapter → `authDb`), `src/modules/auth/session.ts`, `scripts/admin.ts`
- Test: `tests/integration/clinic-isolation.test.ts` (extend), the existing integration suites

**Interfaces:**

- Consumes: Task 1 `inClinic`, `panelDb`, `platformDb`, `authDb`.
- Produces:
  - every clinic-module function keeps its signature (`clinicId` first), and its body runs in `inClinic(clinicId, tx => …)`;
  - functions that already take a `tx` (`lockAgenda`, `insertSessionAppointments`, `syncSessionInstallment`) keep taking it;
  - `clinics.ts`: `listClinics`, `createClinic` and `setClinicActive` use `platformDb`, while `getClinic(id)` and `getClinicBySlug` use `inClinic(id)` / `platformDb` respectively;
  - `admin-accounts.ts` uses `platformDb`.

Steps:

- [ ] **Step 1: Extend `clinic-isolation.test.ts`:**
  - `"module calls run as app_panel"`: inside a patched module call, `select current_user` → `app_panel`. Expose `currentDbUser(clinicId)` from `src/db/client.ts` for this.
  - `"a module cannot read another clinic even with a forged id filter"`: build a raw query in `inClinic(A)` with `where clinic_id = B` → `[]`.
- [ ] **Step 2:** run it → FAIL.
- [ ] **Step 3: Implement** module by module. Replace `db.transaction(async (tx) => …)` with `inClinic(clinicId, async (tx) => …)` and bare `db.select…` with `inClinic(clinicId, (tx) => tx.select…)`. Keep advisory locks inside the same transaction. Test fixtures keep using the owner `db`.
- [ ] **Step 4:** `corepack pnpm test`, `corepack pnpm typecheck`, `corepack pnpm lint` → all pass; `grep -rn "from \"@/db/client\"" src/modules` shows no bare `db` import.
- [ ] **Step 5:** `pnpm test:e2e` (pnpm shim on PATH) → all pass.
- [ ] **Step 6:** Commit `refactor: painel usa o usuário app_panel`.

### Task 3: Client accounts, e-mail and Better Auth flows

**Files:**

- Create: `drizzle/0012_client_accounts.sql` (via `db:generate` + hand edits), `src/modules/email/send.ts`, `src/modules/email/templates.ts`, `src/modules/email/send.test.ts`, `src/modules/clients/accounts.ts`, `tests/integration/client-accounts.test.ts`
- Modify: `src/db/schema/auth.ts` (`userRole` + check), `src/db/schema/clinic.ts`:
  - `patients.userId` uuid null → `users.id` on delete set null;
  - `patients.pendingLinkPatientId` uuid null, composite FK (clinic_id, pending_link_patient_id) → patients;
  - unique `(clinic_id, user_id)` where `user_id is not null`;
  - `patients_phone_name_idx` gets `where pending_link_patient_id is null`.
- Also modify: `src/lib/auth.ts`, `src/lib/env.ts`, `.env.example`, `.gitignore` (`.emails/`), `src/modules/clinics/fields.ts` (reserved slugs)

**Interfaces:**

- Produces:
  - `sendEmail(msg: { to: string; subject: string; html: string; text: string }): Promise<void>`;
  - `readOutbox(dir?: string): Promise<Array<{ to: string; subject: string; text: string; html: string; sentAt: string }>>` (tests and e2e);
  - `createClientAccount(input: { name: string; email: string; password: string; clinicSlug: string }): Promise<{ ok: true; userId: string } | { ok: false; fieldErrors: Record<string, string> }>`, which uses `platformDb` and the same password hashing as `createAdmin`, and sets `role='client'`, `clinicId=null`, `emailVerified=false`;
  - `RESERVED_SLUGS`.
- Better Auth:
  - `emailVerification.sendVerificationEmail` and `emailAndPassword.sendResetPassword` call `sendEmail` with links to `/<slug>/confirmar-email` and `/<slug>/nova-senha`. The slug comes from the callback URL the client page passes. Reset sends nothing for non-`client` users.
  - Remove `/request-password-reset`, `/reset-password`, `/verify-email` and `/send-verification-email` from `disabledPaths`. `/sign-up/email` stays disabled.
  - Add rate-limit rules: those paths `{ window: 60, max: 3 }`.
  - `databaseHooks.session.create.before` sets `expiresAt` by role.
- **Signup rate limit:** the signup Server Action (Task 6) calls `createClientAccount`, which is not a Better Auth path. It is rate-limited by IP: 5 per 10 minutes. The limit lives in a `rateLimits` row keyed `signup:<ip>` through `platformDb`; when it is hit, the action returns "Muitas tentativas. Tente de novo em alguns minutos". Test in `client-accounts.test.ts`: `"sixth signup from one IP is refused"`.

Steps:

- [ ] **Step 1: Write the tests:**
  - **`send.test.ts`:** without `RESEND_API_KEY` the message lands in a temp `EMAIL_OUTBOX_DIR`; with `NODE_ENV=production` and no key, env parsing fails with `RESEND_API_KEY`.
  - **`client-accounts.test.ts`:**
    - `"creates a client with role client and no clinic"`;
    - `"refuses a duplicate e-mail"` → `fieldErrors.email`;
    - `"client sessions last 30 days, admin 12 hours"` (sign in through `auth.api.signInEmail`, read `sessions.expires_at`);
    - `"reset e-mail goes only to clients"`: `auth.api.requestPasswordReset` for an admin → outbox empty, for a client → one message whose text contains `/nova-senha`;
    - `"users check rejects client with clinic"` (raw insert → `23514`);
    - `"reserved slug is refused"`: `createClinic` with slug `admin` → field error.
- [ ] **Step 2:** run them → FAIL.
- [ ] **Step 3:** Implement; regenerate the migration; make sure the `requireAdmin` path for `client` still ends in `notFound()`.
- [ ] **Step 4:** run them → PASS; `corepack pnpm test` → all pass.
- [ ] **Step 5:** Commit `feat: contas de cliente e e-mails de confirmação e senha`.

### Task 4: Client RLS and definer functions

**Files:**

- Create: `drizzle/0013_client_access.sql` (hand-written), `src/modules/clients/context.ts`, `tests/integration/client-access.test.ts`
- Modify: `src/db/client.ts` (add `asClient`)

**Interfaces:**

- Produces, all definer functions are `SECURITY DEFINER`, `set search_path = public`, with `EXECUTE` granted only to `app_client`:
  - **SQL `client_context(p_slug text, p_user uuid)`** returns `(clinic_id uuid, patient_id uuid, pending boolean)`. It returns the active clinic for the slug and that user's patient row in it (`patient_id` null if none).
  - **SQL `register_client_patient(p_clinic uuid, p_user uuid, p_name text, p_phone text, p_email text)`** returns `uuid`:
    - inserts the patient with `user_id`;
    - if a non-anonymized patient of that clinic has the same phone, it also sets `pending_link_patient_id` to it;
    - it refuses (raises `P0001`) if the user already has a row in that clinic.
  - **SQL `client_busy_intervals(p_clinic uuid, p_from timestamptz, p_to timestamptz)`** returns `(starts_at timestamptz, ends_at timestamptz)`. It covers active appointments, with service buffers applied, and time blocks; no other columns.
  - **SQL `client_business_hours(p_clinic uuid)`** returns the weekly hours rows (weekday, opens, closes).
  - **TS `asClient<T>(ctx: { clinicId: string; patientId: string; userId: string }, fn: (tx: Tx) => Promise<T>): Promise<T>`** sets `app.clinic_id`, `app.patient_id` and `app.user_id`.
  - **TS `getClientContext(slug: string, userId: string)`** returns `Promise<{ clinic: PublicClinic; patientId: string | null; pending: boolean } | null>`.
  - **TS `registerClientPatient(input)`** returns `Promise<string>`.
  - **TS `type PublicClinic`**: `{ id, slug, name, displayName, whatsappPhone, contactEmail, address fields present today, onlineBookingEnabled, minAdvanceMinutes, maxAdvanceDays, slotStepMinutes, maxActiveAppointmentsPerPhone, timezone }`.
- Policies and grants for `app_client`:
  - SELECT on `clinics` public columns only (column grants) with `id = app.clinic_id`;
  - SELECT on `services` public columns with clinic plus `is_active and online_booking_enabled and not is_flexible`;
  - SELECT on `patients` with `id = app.patient_id`;
  - SELECT and INSERT on `appointments`, with `patient_id = app.patient_id and clinic_id = app.clinic_id`, insert check also `source='online' and status='confirmed'`;
  - INSERT on `audit_logs` with check `actor_type='patient' and clinic_id = setting`;
  - nothing else.

Steps:

- [ ] **Step 1: Write `client-access.test.ts`.** Set up two clients in one clinic and one in another.
  - `"client reads only her own patient row"`;
  - `"client reads only her own appointments"`;
  - `"client is denied finance tables"`: select `sales`, `payments`, `expenses` → `42501`;
  - `"client cannot update or delete appointments"` → `42501`;
  - `"client cannot insert for another patient or as requested"` → `42501`;
  - `"busy intervals carry no names"`: column list of the function result is exactly `starts_at, ends_at`, and it includes another client's appointment;
  - `"context for another clinic's slug has no patient"`;
  - `"same phone creates a pending provisional record"`; register twice in the same clinic → `P0001`;
  - `"catalog: app_client privileges"`: `has_table_privilege('app_client', t, 'SELECT')` is false for every finance and auth table.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS; `corepack pnpm test` → all pass.
- [ ] **Step 5:** Commit `feat: travas da cliente no banco`.

### Task 5: Free slots and online booking

**Files:**

- Create: `src/modules/booking/slots.ts`, `src/modules/booking/slots.test.ts`, `src/modules/booking/booking.ts`, `tests/integration/booking.test.ts`

**Interfaces:**

- Consumes: Task 4 `asClient`, the definer functions, `lockAgenda` and the `appointments_no_overlap` constraint.
- Produces:
  - **`freeSlots(input)`** returns `string[]` (slot start ISO, in the clinic zone). Input: `{ date: string /* yyyy-mm-dd */; zone: string; hours: DayHours[]; busy: Array<{ startsAt: Date; endsAt: Date }>; durationMinutes: number; bufferBeforeMinutes: number; bufferAfterMinutes: number; stepMinutes: number; now: Date; minAdvanceMinutes: number; maxAdvanceDays: number }`. Pure.
  - **`listBookableServices(ctx)`**.
  - **`listFreeSlots(ctx, serviceId, date)`** returns `Promise<string[]>`.
  - **`listDaysWithSlots(ctx, serviceId, month: string /* yyyy-mm */)`** returns `Promise<string[]>`.
  - **`bookOnline(ctx, { serviceId, startsAt })`** returns `Promise<{ ok: true; appointmentId: string } | { ok: false; reason: "taken" | "limit" | "unavailable" | "unverified" }>`:
    - it runs in `asClient` with `lockAgenda`;
    - it re-checks the slot with `freeSlots` inside the lock;
    - it maps exclusion violation `23P01` to `taken`;
    - it inserts the audit row with actor `patient`.
  - **`listMyAppointments(ctx)`**.
  - `ctx` = `{ clinicId, patientId, userId, emailVerified }`.

Steps:

- [ ] **Step 1: Write `slots.test.ts`:**
  - `"slots step through business hours"`: 09:00–12:00, 60-min service, step 30 → `09:00 … 11:00` (5 slots).
  - `"busy interval and buffers remove slots"`: busy 10:00–11:00, buffer after 15 → 09:00 is free; 09:30 and 10:00 are gone; 11:00 is free only if the buffer before is 0.
  - `"min advance hides near slots"`: now 08:30, min 120 → first slot 10:30.
  - `"beyond max advance days is empty"`.
  - `"closed weekday is empty"`.
  - `"DST-free São Paulo times are rendered in -03:00"`.
- [ ] **Step 2: Write `booking.test.ts`:**
  - `"booking lands confirmed and online"` (owner `listAppointmentsInRange` sees it with `source='online'`);
  - `"two simultaneous bookings: one taken"` (`Promise.all`);
  - `"limit of active appointments"` → `limit`;
  - `"online off for clinic or service"` → `unavailable`;
  - `"unverified e-mail"` → `unverified`;
  - `"block added after listing makes confirm fail"` → `taken`;
  - `"requiresApproval true still books confirmed"`.
- [ ] **Step 3:** run both → FAIL. **Step 4:** implement. **Step 5:** run → PASS; `corepack pnpm test` → all pass.
- [ ] **Step 6:** Commit `feat: horários livres e agendamento online`.

### Task 6: Client pages

**Files:**

- Create under `src/app/[slug]/`:
  - `layout.tsx` (Zemana header + clinic name, `notFound()` for unknown slug or reserved name);
  - `page.tsx` (entry: Marcar / Entrar / Criar conta; "Agendamento online indisponível" + contacts when the clinic is off);
  - `cadastro/`, `entrar/`, `esqueci-senha/`, `nova-senha/`, `confirmar-email/`, `marcar/` (service → day → time → confirm, then the confirmation screen with date, time, service, address and preparation instructions);
  - `meus-horarios/` (upcoming, then past; "Desmarcado" label; the "Para desmarcar…" text with the clinic WhatsApp link).
  - Each page has Server Actions in `actions.ts` and forms in client components, following the panel's existing form pattern.
- Create: `src/modules/clients/session.ts`, `e2e/client-area.spec.ts`; Modify: `e2e/helpers.ts` (outbox reader), `e2e/global-setup.ts`

**Interfaces:**

- Consumes: Tasks 3–5.
- Produces: `requireClient(slug)` returns `{ ctx, clinic, user }`:
  - without a session → redirect to `/<slug>/entrar?next=…`;
  - with a non-client role → `notFound()`;
  - with no patient row in this clinic → redirect to `/<slug>/cadastro?completar=1`, which asks for name and phone only and calls `registerClientPatient`.

Steps:

- [ ] **Step 1: Write `e2e/client-area.spec.ts`** (serial; the setup enables online booking and business hours for a test clinic):
  - `"sign up, confirm e-mail, book a slot that shows in the owner's agenda"`;
  - `"unconfirmed client sees Confirme seu e-mail and cannot book"`;
  - `"forgot password e-mail resets the password"`;
  - `"client of clinic A opening clinic B's link sees none of A's appointments"`;
  - `"client session cannot open /admin or /admin/foto/<id>"` → "Página não encontrada";
  - `"my appointments has no cancel button"`;
  - `"no sideways scroll at 360 px"` on `/<slug>` and `/<slug>/marcar`;
  - `"dark theme shows the dark-background logo"`.
- [ ] **Step 2:** `pnpm exec playwright test e2e/client-area.spec.ts` → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 5:** Commit `feat: área da cliente`.

### Task 7: Owner side and docs

**Files:**

- Create: `src/modules/patients/links.ts`, `tests/integration/patient-links.test.ts`, `e2e/patient-links.spec.ts`
- Modify:
  - `src/app/admin/(painel)/page.tsx` (pending-link notices);
  - `src/app/admin/(painel)/pacientes/[id]/` (notice + "É a mesma" / "Não é");
  - agenda event label shows "Online" for `source='online'`;
  - services form (remove the "precisa de aprovação" field from the UI; the column stays);
  - `docs/multiclinica.md`, `docs/decisoes-tecnicas.md`, README (env vars, roles, Resend, publishing steps for roles on Neon), `.env.example`.

**Interfaces:**

- Produces:
  - **`listPendingLinks(clinicId)`** returns `Promise<Array<{ provisionalId; provisionalName; existingId; existingName; existingHasAccount: boolean; createdAt }>>`.
  - **`confirmLink(clinicId, provisionalId)`** returns `Promise<{ ok: true } | { ok: false; reason: "existing_has_account" }>`. In one `inClinic` transaction it:
    - moves the provisional's appointments and `audit_logs.entity_id` refs to the existing record;
    - sets `existing.user_id`;
    - deletes the provisional.
  - **`rejectLink(clinicId, provisionalId)`** returns `Promise<{ ok: true } | { ok: false; reason: "same_name_and_phone" }>`. It clears `pending_link_patient_id`, and returns the error when the unique index would clash (the UI asks the owner to adjust the name first).

Steps:

- [ ] **Step 1: Write `patient-links.test.ts`:**
  - `"confirm merges appointments and links the account"` (afterwards the client sees the old appointments through `listMyAppointments`);
  - `"reject keeps both records"`;
  - `"reject with same name and phone asks for a new name"`;
  - `"confirm onto a record that already has an account is refused"`;
  - `"another clinic cannot confirm"`: `confirmLink(otherClinic, id)` → not found / no change.
- [ ] **Step 2: Write `e2e/patient-links.spec.ts`:** the owner sees the notice on `/admin`, clicks "É a mesma", and the notice is gone.
- [ ] **Step 3:** run → FAIL. **Step 4:** implement and update the docs. **Step 5:** `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, the build with test env, and `pnpm test:e2e` → all pass.
- [ ] **Step 6:** Commit `feat: dona confirma a ficha da cliente online`.
