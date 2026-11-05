# Cadastro de pacientes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the clinic create, search, view, edit and anonymize patients in the admin panel, with the fields the clinic already uses.

**Architecture:** One additive migration extends `patients`. A domain module `src/modules/patients/` holds pure validation and helpers (shared by browser and server) and server-only data functions (`requireAdmin` is the caller's job). The routes under `src/app/admin/(painel)/pacientes/` are thin: each page and each Server Action calls `requireAdmin()`, validates with the shared Zod schema and calls the module.

**Tech Stack:** Next.js 16 App Router + Server Actions, Drizzle ORM + PostgreSQL 17, Zod 4, React Hook Form, Vitest (unit + integration with real PostgreSQL), Playwright.

**Spec:** `docs/cadastro-de-pacientes.md`

## Global Constraints

- Field rules, copied from the spec:
  - Nome: 2–120 chars.
  - Apelido: ≤ 40.
  - CPF: 11 digits with valid check digits, stored digits-only, unique.
  - RG: ≤ 20.
  - WhatsApp: required, Brazilian number with DDD, stored as E.164 `+55…`.
  - Telefone fixo: optional, same format.
  - E-mail: optional.
  - Nascimento: required in the panel. It must be in the past and at most 120 years ago, with dates computed in `America/Sao_Paulo`.
  - Gênero: `male | female | other | undisclosed`.
  - Como conheceu: `google | instagram | facebook | referral | school | outdoor | flyer | sign | insurance | radio | tv | magazine | other`.
  - Indicado por: ≤ 120, only with `referral`.
  - Observações: ≤ 1000, administrative only. The field shows the hint "Não registre informações de saúde aqui".
- The new columns are nullable in the DB. Only the panel form requires the birth date.
- No patient data in URLs, logs, audit `changes` or server error messages. The search term travels in a Server Action POST and is never logged.
- Every page and Server Action calls `requireAdmin()` from `src/modules/auth/session.ts`.
- Audit actions: `patient.created`, `patient.updated` (`changes: { fields: string[] }` with code field names), `patient.anonymized`. All three use `entityType: "patient"`, `actorType: "admin"` and `actorUserId`.
- Anonymize:
  - The person types `ANONIMIZAR` to confirm.
  - The name becomes `Paciente anonimizado`.
  - Every personal field is set to null.
  - It is refused while the patient has a future `requested` or `confirmed` appointment.
  - It runs in a transaction with `SELECT … FOR UPDATE` on the patient row.
- The migration only adds things. Do not edit existing migrations; use `pnpm db:generate` and review the SQL.
- UI copy is in Portuguese; code and DB names are in English. Follow the visual identity: `bg-primary`, `bg-highlight` only for the active or attention state, `h-11` controls.
- Run pnpm as `corepack pnpm`.
- No commits without the user's authorization.

## Review Focus

- **CPF typed with mask and with spaces** ("123.456.789-09 "): it is stored as `12345678909` and a duplicate is detected. Test: unit `parseCpf` cases plus an integration duplicate test.
- **WhatsApp typed in common Brazilian forms** (`(48) 99999-1234`, `48999991234`, `+55 48 99999-1234`, number without the 9th digit): all normalize to `+55…`, and a number without DDD is rejected. Test: unit `normalizeBrPhone` table.
- **Same person registered twice at the same time:** the second insert gets a field error, not a 500. Test: integration `Promise.all` of two `createPatient` calls with the same CPF; exactly one succeeds.
- **Born today 18 years ago vs. tomorrow** (minor edge), computed in São Paulo time: `isMinor` is false on the 18th birthday. Test: unit with a fixed `today`.
- **Search by partial phone or CPF digits vs. a name containing digits; anonymized patients never listed.** Test: integration `searchPatients` cases.

---

### Task 1: Patients table migration

**Files:**

- Modify: `src/db/schema/clinic.ts` (the `patients` table, plus two new enums near the other enums)
- Create: `drizzle/0003_*.sql` and its snapshot (generated)
- Test: `tests/integration/patients-rules.test.ts`

**Interfaces:**

- Produces:
  - Drizzle `patients` columns: `nickname`, `cpf`, `rg`, `landlinePhone`, `birthDate` (`date`, mode `"string"`, `YYYY-MM-DD`), `gender` (enum `patient_gender`), `referralSource` (enum `patient_referral_source`), `referredBy`, `notes`;
  - exported enums `patientGender` and `patientReferralSource`;
  - constraints:
    - `patients_cpf_idx` (unique, where cpf is not null);
    - `patients_cpf_check` (`^[0-9]{11}$`);
    - `patients_landline_check` (the same E.164 regex as phone);
    - `patients_referred_by_check` (`referred_by is null or referral_source = 'referral'`);
    - `patients_lengths_check` (nickname ≤ 40, rg ≤ 20, referred_by ≤ 120, notes ≤ 1000);
    - updated `patients_anonymized_check`, which also requires every new personal column to be null.

- [ ] **Step 1: Write failing tests** in `tests/integration/patients-rules.test.ts`, using `db` and the `failure()` helper pattern from `database-rules.test.ts`:
  - `it("rejects a CPF that is not 11 digits")`: an insert with `cpf: "123"` fails with an error containing `patients_cpf_check`.
  - `it("rejects two patients with the same CPF")`: the second insert fails with `patients_cpf_idx`.
  - `it("rejects referred_by without the referral source")`: fails with `patients_referred_by_check`.
  - `it("rejects an anonymized patient that keeps a birth date")`: fails with `patients_anonymized_check`.
  - `it("accepts a patient with only name, phone and normalized name")`: succeeds, and the new columns are null.
- [ ] **Step 2: Run** `corepack pnpm test:integration -- patients-rules`. Expected: FAIL (unknown columns).
- [ ] **Step 3: Implement.** Edit the schema, run `corepack pnpm db:generate`, read the generated SQL, and confirm it only adds things and drops or recreates nothing except `patients_anonymized_check`.
- [ ] **Step 4: Run** `corepack pnpm test:integration` and `corepack pnpm typecheck`. Expected: PASS.

### Task 2: Patients module (validation, helpers, data functions)

**Files:**

- Create: `src/modules/patients/fields.ts` (pure, importable by client components), with its test in `src/modules/patients/fields.test.ts`
- Create: `src/modules/patients/patients.ts` (`import "server-only"`), with its test in `tests/integration/patients.test.ts`

**Interfaces:**

- Consumes: the Task 1 schema; `db`, `isUniqueViolation`, `findPgError` from `src/db`.
- Produces (in `fields.ts`):
  - `normalizeName(name: string): string`: lowercase, accents removed (NFD), inner spaces collapsed, trimmed.
  - `parseCpf(input: string): string | null`: digits only when the check digits are valid, else `null`.
  - `normalizeBrPhone(input: string): string | null`: E.164 `+55` + DDD + 8 or 9 digits, else `null`.
  - `ageOn(birthDate: string, today: string): number`; `isMinor(birthDate: string, today: string): boolean`.
  - `todayInClinic(now?: Date): string`: a `YYYY-MM-DD` date in `America/Sao_Paulo`.
  - `GENDERS`, `REFERRAL_SOURCES`: readonly arrays of `{ value, label }` with the Portuguese labels from the spec.
  - `patientFormSchema`: a Zod object whose keys are `name, nickname, cpf, rg, phone, landlinePhone, email, birthDate, gender, referralSource, referredBy, notes`. Inputs are raw strings, with empty string = absent. The schema transforms CPF and phones with the helpers above and gives messages in Portuguese.
  - `type PatientFormInput = z.input<typeof patientFormSchema>`; `type PatientFormValues = z.output<…>`.
- Produces (in `patients.ts`):
  - `type ActionResult = { ok: true; id: string } | { ok: false; fieldErrors: Partial<Record<keyof PatientFormInput, string>>; existingPatientId?: string }`.
  - `createPatient(values: PatientFormValues, actorUserId: string): Promise<ActionResult>`.
  - `updatePatient(id: string, values: PatientFormValues, actorUserId: string): Promise<ActionResult>`.
  - `getPatient(id: string): Promise<PatientRecord | null>`. It returns `null` for anonymized patients and for an id that is not a UUID.
  - `searchPatients(input: { term: string; after?: { nameNormalized: string; id: string } }): Promise<{ items: PatientListItem[]; next?: { nameNormalized: string; id: string } }>`. Pages hold 50 items. The digit rule comes from the spec ("Detalhes definidos na revisão do design").
  - `anonymizePatient(id: string, actorUserId: string): Promise<{ ok: true } | { ok: false; reason: "not_found" | "has_future_appointments" }>`.
  - `PatientRecord` and `PatientListItem`: the types the screens need, where the list item is `{ id, name, nickname, phone, birthDate }`.

- [ ] **Step 1: Write failing unit tests** in `fields.test.ts`:
  - `parseCpf`: `"529.982.247-25"` gives `"52998224725"`; `"111.111.111-11"`, `"123"` and `""` give `null`.
  - `normalizeBrPhone`:
    - `"(48) 99999-1234"`, `"48999991234"` and `"+55 48 99999-1234"` give `"+5548999991234"`;
    - `"(48) 3333-1234"` gives `"+554833331234"`;
    - `"99999-1234"` gives `null`.
  - `normalizeName("  Márcia   da  Silva ")` gives `"marcia da silva"`.
  - `isMinor("2008-10-30", "2026-10-30")` is `false`; `isMinor("2008-10-31", "2026-10-30")` is `true`.
  - `patientFormSchema` rejects:
    - a birth date in the future;
    - a birth date more than 120 years ago;
    - a missing birth date;
    - `referredBy` without `referral`;
    - notes over 1000 chars.
- [ ] **Step 2: Write failing integration tests** in `tests/integration/patients.test.ts`:
  - create then get round-trips every field;
  - create writes one `patient.created` audit row whose `changes` holds no value from the input;
  - update writes `patient.updated` with `changes.fields` equal to exactly the changed keys;
  - a duplicate CPF returns `{ ok: false, fieldErrors: { cpf }, existingPatientId }`;
  - a duplicate phone + name returns a `phone` error with `existingPatientId`;
  - of two concurrent creates with the same CPF, exactly one is `ok`;
  - search cases:
    - by an accent-insensitive name substring;
    - by the last 4 phone digits;
    - by a CPF prefix;
    - anonymized patients are never returned;
    - the pagination cursor returns the next page with no overlap;
  - anonymize:
    - clears every personal field and sets the label;
    - is refused with a future confirmed appointment;
    - is allowed with a past or cancelled one.
- [ ] **Step 3: Run** `corepack pnpm test:unit` and `corepack pnpm test:integration`. Expected: FAIL (module missing).
- [ ] **Step 4: Implement** both files. Each write runs in `db.transaction`. Duplicates use a pre-check plus a catch of `isUniqueViolation(error, "patients_cpf_idx" | "patients_phone_name_idx")`. Anonymize uses `.for("update")` on the patient row.
- [ ] **Step 5: Run** the unit and integration suites, then `typecheck` and `lint`. Expected: PASS.

### Task 3: Patient screens, navigation and docs

**Files:**

- Create in `src/app/admin/(painel)/pacientes/`:
  - `page.tsx` (list);
  - `patient-search.tsx` (client: search form + "Carregar mais");
  - `actions.ts` (`"use server"`: `searchPatientsAction`, `createPatientAction`, `updatePatientAction`, `anonymizePatientAction`);
  - `patient-form.tsx` (client, React Hook Form + `patientFormSchema`, shared by create and edit);
  - `novo/page.tsx`;
  - `[id]/page.tsx` (record + edit form);
  - `[id]/anonymize-form.tsx`.
- Modify: `src/app/admin/(painel)/layout.tsx` (nav items gain `{ href: "/admin/pacientes", label: "Pacientes" }`).
- Modify: `README.md` (what works), `docs/decisoes-tecnicas.md` (a short "Pacientes" section on the search outside the URL and the audit fields).
- Test: `e2e/patients.spec.ts`. It reuses the 2FA login helpers; extract them from `e2e/admin-auth.spec.ts` into `e2e/helpers.ts` if needed, without changing that spec's behavior.

**Interfaces:**

- Consumes: everything Task 2 produces; `requireAdmin()`; `PanelNav` items.
- Server Actions:
  - each calls `requireAdmin()` first;
  - each parses its `FormData` or object input with `patientFormSchema.safeParse`;
  - each returns `ActionResult`, or redirects to `/admin/pacientes/<id>` on success.
- Search action signature: `searchPatientsAction(input: { term: string; after?: … }) → same shape as searchPatients`.

- [ ] **Step 1: Write the failing e2e test** `e2e/patients.spec.ts`, signed in as the test admin:
  - the "Pacientes" nav link has `aria-current="page"` on `/admin/pacientes`;
  - create a fictitious patient. Fill name "Paciente Teste Um", WhatsApp `(48) 99999-0001`, birth `1990-05-10`, how they heard "Indicação" with "Indicado por" visible and filled, and notes with the hint text visible. The page redirects to `/admin/pacientes/<uuid>` and shows the name and the age;
  - search "teste um" and see the patient; check that the URL is still `/admin/pacientes`, without the term;
  - edit the nickname and see it saved;
  - creating a second patient with the same WhatsApp and name shows the duplicate error with a link to the first record;
  - anonymize: typing anything other than `ANONIMIZAR` keeps the button disabled; after confirming, the patient no longer appears in search.
- [ ] **Step 2: Run** `corepack pnpm test:e2e -g pacientes` (put the PATH shim for pnpm first). Expected: FAIL (route 404).
- [ ] **Step 3: Implement** the screens. Requirements:
  - **Responsive:** the list shows as cards on a phone and as a table from `md`.
  - **Mobile form:** one column; two from `md`.
  - **Labels and errors:** each field has a label, and its error is linked through `aria-describedby`, as in the existing forms.
  - **Ficha:** the "Cadastro incompleto" notice shows when the birth date is missing; the "Menor de idade" badge shows when the patient is a minor.
  - **States:**
    - loading: the submit button text changes;
    - empty list: "Nenhum paciente cadastrado ainda";
    - no search result: "Nenhum paciente encontrado".
- [ ] **Step 4: Update docs.** In the README, under "O que já funciona", add the patients registry. In `docs/decisoes-tecnicas.md`, add the "Pacientes" section.
- [ ] **Step 5: Run the full suite:** `lint`, `typecheck`, `test:unit`, `test:integration`, `test:e2e` and `build`. Then check formatting by piping each changed file's content through `prettier --check --stdin-filepath`. Expected: all pass.
