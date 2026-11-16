# Vários procedimentos e aniversariantes: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dona vê as aniversariantes do dia no painel e agenda vários procedimentos para a mesma cliente em um bloco só.

**Architecture:** Aniversariantes é uma leitura nova sobre `patients.birth_date`, sem migração. Vários procedimentos mantém o serviço principal em `appointments` e acrescenta a tabela filha `appointment_services` (extras em ordem); as leituras montam o texto "A + B" e somam preços por subconsultas compartilhadas.

**Tech Stack:** Next.js (ler `node_modules/next/dist/docs/` antes de mexer em rotas, conforme `AGENTS.md`), Drizzle + Postgres com RLS, zod, react-hook-form, Vitest (unit e integration), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-16-multiplos-procedimentos-e-aniversariantes-design.md`

## Global Constraints

- Toda função de dados recebe `clinicId` da sessão e roda em `inClinic`; nunca lê outra clínica.
- `audit_logs.changes` leva só ids, instantes, durações e códigos. Nunca nomes.
- Dados pessoais não vão em URL (exceção já existente: telefone no link `https://wa.me/<dígitos>`).
- Migração só acrescenta (o código antigo ainda roda quando ela aplica). Número `0035`.
- Textos de interface em português, no tom das telas atuais.
- Até 9 extras por agendamento; separador do texto é `" + "`.
- Comandos de verificação: `npm run test:unit`, `npm run test:integration` (precisa do Postgres de teste local), `npm run typecheck`, `npm run lint`, `npm run test:e2e`.
- Um commit por tarefa, mensagens no padrão do repositório (`feat(agenda): ...`, `feat(pacientes): ...`).

## Review Focus

1. Remarcar por arrastar um bloco com extras: os extras ficam, e a limpeza continua sendo a do último procedimento (teste na Tarefa 5).
2. Editar um agendamento cujo extra foi desativado depois: salva sem recusar o extra (Tarefa 5).
3. Agendamentos antigos, sem extras: o texto do serviço não muda e não ganha `" + "` (Tarefa 6).
4. "Hoje" perto da meia-noite: às 01:00 UTC ainda é o dia anterior em São Paulo; a lista usa o fuso da clínica (Tarefa 1).
5. Reenvio do mesmo formulário (mesma chave de idempotência) com extras: não cria linhas repetidas nem outro agendamento (Tarefa 5).

---

## Parte 1: Aniversariantes

### Task 1: Regra de data e listagem

**Files:**
- Create: `src/modules/patients/birthdays.ts` (puro, seguro para o cliente)
- Create: `src/modules/patients/birthdays.test.ts`
- Modify: `src/modules/patients/patients.ts` (nova função de leitura)
- Test: `tests/integration/patients.test.ts`

**Interfaces:**
- Produces:
  - `birthdayKeys(today: string): string[]`: recebe `YYYY-MM-DD`, devolve as chaves `MM-DD` que contam como hoje.
  - `ageTurning(birthDate: string, today: string): number`: ano de hoje menos ano de nascimento.
  - `type BirthdayItem = { id: string; name: string; nickname: string | null; phone: string | null; age: number }`
  - `listBirthdays(clinicId: string, now?: Date): Promise<{ date: string; items: BirthdayItem[] }>`

- [ ] **Step 1: Testes unitários (falhando)** em `birthdays.test.ts`:

```ts
expect(birthdayKeys("2026-11-16")).toEqual(["11-16"]);
expect(birthdayKeys("2027-02-28")).toEqual(["02-28", "02-29"]); // não bissexto
expect(birthdayKeys("2028-02-28")).toEqual(["02-28"]); // bissexto
expect(birthdayKeys("2028-02-29")).toEqual(["02-29"]);
expect(ageTurning("1992-11-16", "2026-11-16")).toBe(34);
expect(ageTurning("2000-02-29", "2027-02-28")).toBe(27);
```

- [ ] **Step 2:** `npm run test:unit -- birthdays`. Esperado: falha (módulo não existe).
- [ ] **Step 3:** Implementar as duas funções com luxon (`DateTime.fromISO(today).isInLeapYear`).
- [ ] **Step 4:** `npm run test:unit -- birthdays`. Esperado: passa.
- [ ] **Step 5: Testes de integração (falhando)** em `patients.test.ts`, bloco `describe("listBirthdays")`. Com `now = new Date("2026-11-17T01:00:00Z")` (ainda 16/11 em São Paulo):
  - devolve `date: "2026-11-16"` e só as pacientes nascidas em 16/11, em ordem alfabética, com `age` correto;
  - não devolve paciente nascida em 17/11;
  - não devolve paciente anonimizada, nem cadastro provisório (`pendingLinkPatientId` preenchido), nem paciente sem data;
  - não devolve paciente de outra clínica nascida em 16/11.
- [ ] **Step 6:** `npm run test:integration -- patients.test`. Esperado: falha.
- [ ] **Step 7:** Implementar `listBirthdays` em `patients.ts`: fuso por `getClinicTimezone(clinicId)`; filtro `to_char(birth_date, 'MM-DD') in (...)`, `anonymized_at is null`, `pending_link_patient_id is null`; ordem por `name_normalized`, `id`.
- [ ] **Step 8:** `npm run test:integration -- patients.test`. Esperado: passa.
- [ ] **Step 9:** Commit `feat(pacientes): lista aniversariantes do dia`.

### Task 2: Tela e aviso no Início

**Files:**
- Create: `src/app/admin/(painel)/pacientes/aniversariantes/page.tsx`
- Modify: `src/app/admin/(painel)/pacientes/page.tsx` (link "Aniversariantes")
- Modify: `src/modules/dashboard/dashboard.ts` (`getPanelHome` devolve `birthdays: number`)
- Modify: `src/app/admin/(painel)/page.tsx` (aviso)
- Test: `tests/integration/dashboard.test.ts`, `e2e/patients.spec.ts`

**Interfaces:**
- Consumes: `listBirthdays`, `BirthdayItem` (Tarefa 1).
- Produces: rota `/admin/pacientes/aniversariantes`; campo `birthdays: number` em `getPanelHome`.

- [ ] **Step 1: Teste de integração (falhando)** em `dashboard.test.ts`: `getPanelHome` devolve `birthdays: 1` quando há uma paciente aniversariando no dia de `now` e `0` quando não há.
- [ ] **Step 2:** Rodar e ver falhar; implementar (chamar `listBirthdays` no `Promise.all` existente); rodar e ver passar.
- [ ] **Step 3:** Página, com `requireAdmin()` e `metadata = { title: "Aniversariantes" }`:
  - título "Aniversariantes de hoje" e a data por extenso;
  - lista com bordas (não cartões): nome com link para `/admin/pacientes/<id>`, apelido entre parênteses, "Faz N anos", telefone com `formatStoredPhone`, botão "WhatsApp" para `https://wa.me/<dígitos>` (mesmo padrão de `home/next-card.tsx`), só quando há telefone;
  - vazia: "Nenhuma aniversariante hoje.";
  - link "Voltar aos clientes".
- [ ] **Step 4:** No Início, acima da seção "Hoje", quando `birthdays > 0`: link para a tela com o texto `1 aniversariante hoje` / `N aniversariantes hoje` e `data-testid="aviso-aniversariantes"`.
- [ ] **Step 5: e2e** em `patients.spec.ts`: cadastrar paciente com nascimento no dia de hoje, abrir o Início, ver o aviso, clicar, ver o nome na tela. Rodar `npm run test:e2e -- patients`. Esperado: passa.
- [ ] **Step 6:** `npm run typecheck` e `npm run lint`. Esperado: sem erros.
- [ ] **Step 7:** Commit `feat(pacientes): tela de aniversariantes e aviso no início`.

---

## Parte 2: Vários procedimentos

### Task 3: Tabela `appointment_services`

**Files:**
- Modify: `src/db/schema/clinic.ts`
- Create: `drizzle/0035_appointment_services.sql` (gerado por `npm run db:generate`, depois renomeado e completado à mão, como as migrações anteriores)
- Create: `tests/integration/appointment-services-db.test.ts`

**Interfaces:**
- Produces: tabela Drizzle `appointmentServices` com `id`, `clinicId`, `appointmentId`, `serviceId`, `serviceName`, `serviceDurationMinutes`, `position`, `createdAt`.

- [ ] **Step 1: Testes de banco (falhando)**, no estilo de `stock-db.test.ts`:
  - `app_panel` de uma clínica não lê nem insere linhas de outra;
  - `app_client` lê os extras dos seus agendamentos e nenhum de outra paciente da mesma clínica; não insere nem apaga;
  - recusa repetir `(appointment_id, service_id)` e `(appointment_id, position)`;
  - recusa `position` fora de 1 a 9;
  - recusa serviço de outra clínica (chave composta);
  - apagar o agendamento apaga os extras.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Schema e migração:
  - FKs compostas `(clinic_id, appointment_id)` → `appointments(clinic_id, id)` `ON DELETE CASCADE` e `(clinic_id, service_id)` → `services(clinic_id, id)` `ON DELETE RESTRICT`;
  - `UNIQUE (appointment_id, service_id)`, `UNIQUE (appointment_id, position)`, `CHECK (position between 1 and 9)`, índice em `service_id`;
  - `GRANT SELECT, INSERT, DELETE ON appointment_services TO app_panel`; `GRANT SELECT ON appointment_services TO app_client`; `ENABLE ROW LEVEL SECURITY`;
  - política `appointment_services_panel` (`FOR ALL`, por `app.clinic_id`, como em 0029);
  - política `appointment_services_client_select`: mesma clínica e `appointment_id in (select id from appointments)` (a RLS de `appointments` já limita à própria paciente).
  - Cabeçalho da migração explicando que é só acréscimo.
- [ ] **Step 4:** `npm run test:integration`. Esperado: os novos passam. Se algum teste que enumera tabelas (`clinic-isolation`, `db-roles`, `database-rules`) falhar, incluir a tabela nova na lista dele.
- [ ] **Step 5:** Commit `feat(db): tabela de procedimentos extras do agendamento`.

### Task 4: Esquema do formulário e texto do serviço

**Files:**
- Modify: `src/modules/appointments/fields.ts`
- Test: `src/modules/appointments/fields.test.ts`

**Interfaces:**
- Produces:
  - `MAX_EXTRA_SERVICES = 9`
  - `serviceLabel(main: string, extras: readonly string[]): string`
  - `appointmentFormSchema` aceita `extraServiceIds?: string[]`; `AppointmentFormValues` ganha `extraServiceIds: string[]` (sempre presente).

- [ ] **Step 1: Testes (falhando):**

```ts
expect(serviceLabel("Manicure", [])).toBe("Manicure");
expect(serviceLabel("Manicure", ["Pedicure", "Spa"])).toBe("Manicure + Pedicure + Spa");
// esquema
parse({ ...valid }).extraServiceIds                       // []
parse({ ...valid, extraServiceIds: [A, B] }).extraServiceIds // [A, B] na ordem
safeParse({ ...valid, extraServiceIds: [A, A] })          // erro em extraServiceIds: "Não repita o mesmo procedimento."
safeParse({ ...valid, extraServiceIds: [valid.serviceId] })// mesmo erro
safeParse({ ...valid, extraServiceIds: dez uuids })       // erro: "No máximo 9 procedimentos extras."
safeParse({ ...valid, extraServiceIds: ["x"] })           // erro: "Escolha o serviço."
```

- [ ] **Step 2:** `npm run test:unit -- appointments/fields`. Esperado: falha.
- [ ] **Step 3:** Implementar. A checagem de repetição fica em `superRefine` antes do `transform` final.
- [ ] **Step 4:** Rodar de novo (passa) e `npm run typecheck`; onde algum chamador monta `AppointmentFormValues` à mão, acrescentar `extraServiceIds: []`.
- [ ] **Step 5:** Commit `feat(agenda): formulário aceita procedimentos extras`.

### Task 5: Gravar extras ao criar, editar e remarcar

**Files:**
- Modify: `src/modules/appointments/appointments.ts`
- Test: `tests/integration/appointments.test.ts`

**Interfaces:**
- Consumes: `appointmentServices` (Tarefa 3), `extraServiceIds` (Tarefa 4).
- Produces: `createAppointment` e `updateAppointment` gravam os extras; assinaturas inalteradas. Erros de extra vêm em `fieldErrors.extraServiceIds`.

Regras a implementar:
- Cada extra passa por `readService`; recusas, nesta ordem: inexistente → "Escolha um serviço cadastrado."; flexível → "O encaixe só pode ser o serviço principal."; não agendável → "Serviço inativo." (na edição, um extra que já estava no agendamento continua aceito).
- Agendamento com linha em `sale_sessions` e `extraServiceIds` não vazio → `formError` "Sessão de pacote não aceita outros procedimentos."
- Faixa ocupada: preparação do principal antes; limpeza do **último** procedimento depois (o principal quando não há extras). Vale também em `rescheduleAppointment`, que hoje usa só o principal.
- Edição: se a lista (com ordem) mudou, apagar os extras do agendamento e inserir de novo com `position` 1..n, copiando `service_name` e `service_duration_minutes`. Mudança de extras recalcula a faixa ocupada e checa conflito.
- Auditoria: `appointment.created` leva `extraServiceIds` quando não vazio; na edição, `extrasChanged: true` e `extraServiceIds`.
- A repetição por chave de idempotência continua comparando paciente, serviço principal e início.

- [ ] **Step 1: Testes de integração (falhando):**
  - criar com dois extras grava duas linhas, posições 1 e 2, nomes e durações copiados, e auditoria com os ids;
  - criar com extra flexível, inativo ou de outra clínica é recusado com a mensagem acima e nada é gravado;
  - limpeza: principal com `bufferAfter` 0 e último extra com 15 → `occupiedUntil = endsAt + 15 min`;
  - editar: acrescentar, remover e inverter a ordem refletem na tabela; salvar sem mudar nada não escreve auditoria;
  - editar mantendo um extra que foi desativado depois: aceito;
  - editar uma sessão de pacote acrescentando extra: recusado;
  - `rescheduleAppointment` em bloco com extras: extras intactos e `occupiedUntil` com a limpeza do último;
  - mesma chave de idempotência enviada duas vezes com extras: um agendamento, duas linhas de extra.
- [ ] **Step 2:** `npm run test:integration -- appointments.test`. Esperado: falha.
- [ ] **Step 3:** Implementar conforme as regras.
- [ ] **Step 4:** `npm run test:integration -- appointments`. Esperado: passa, inclusive `appointments-overlap` e `appointments-rules`.
- [ ] **Step 5:** Commit `feat(agenda): grava vários procedimentos no agendamento`.

### Task 6: Leituras (texto e valores)

**Files:**
- Create: `src/modules/appointments/extras.ts` (server-only: subconsultas compartilhadas)
- Modify: `src/modules/appointments/appointments.ts`, `src/modules/dashboard/dashboard.ts`, `src/modules/dashboard/day.ts`, `src/modules/finance/receipts.ts`, `src/modules/booking/booking.ts`
- Test: `tests/integration/appointments.test.ts`, `dashboard.test.ts`, `receipts.test.ts`, `booking.test.ts`; `src/modules/dashboard/day.test.ts` se existir

**Interfaces:**
- Consumes: `serviceLabel` (Tarefa 4).
- Produces:
  - em `extras.ts`: `extraNamesSql` (`sql<string[]>`, nomes por `position`, `{}` quando não há) e `extraPricesSql` (`sql<{ cents: number; missing: boolean }>`: soma dos preços conhecidos dos extras e se algum não tem preço), ambos correlacionados com `appointments.id`;
  - `AppointmentRecord.extras: { serviceId: string; name: string; durationMinutes: number; active: boolean }[]` e `AppointmentRecord.inPackage: boolean`;
  - `CalendarEvent.serviceLabel`, `PatientAppointmentItem.serviceName`, `DayItem.serviceName` e o `serviceName` de `listMyAppointments` passam a ser `serviceLabel(customLabel ?? serviceName, extras)`;
  - `DayItem.pricePartial: boolean`; `DayItem.priceCents` é a soma dos preços conhecidos (`null` só quando nenhum procedimento tem preço);
  - `daySummary`: `partial` também quando algum item contado tem `pricePartial`;
  - `servicePriceCents` de `receipts.ts`: soma dos preços conhecidos do principal e dos extras.

- [ ] **Step 1: Testes (falhando):**
  - agendamento sem extras: `serviceLabel`/`serviceName` idênticos aos de hoje em `listAppointmentsInRange`, `getDayAgenda`, `listPatientAppointments`, `listMyAppointments`;
  - com extras "Pedicure" e "Spa" sobre "Manicure": texto `"Manicure + Pedicure + Spa"` nas quatro leituras; com rótulo de encaixe: `"<rótulo> + Pedicure"`;
  - `getAppointment` devolve `extras` em ordem e `inPackage`;
  - previsto: principal R$ 50 + extra R$ 30 → `cents: 8000`, `partial: false`; extra sem preço → `cents: 5000`, `partial: true`;
  - `servicePriceCents`: 8000 no primeiro caso;
  - a cliente (`app_client`) vê o texto completo em `listMyAppointments`.
- [ ] **Step 2:** Rodar e ver falhar.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm run test:unit` e `npm run test:integration`. Esperado: tudo passa.
- [ ] **Step 5:** Commit `feat(agenda): mostra e soma todos os procedimentos`.

### Task 7: Formulário e detalhe no painel

**Files:**
- Modify: `src/app/admin/(painel)/agenda/appointment-form.tsx`
- Modify: `src/app/admin/(painel)/agenda/[id]/page.tsx`
- Modify: `src/app/admin/(painel)/agenda/novo/page.tsx` (só se precisar repassar props)
- Modify: `src/app/admin/(painel)/pacientes/[id]/appointment-history.tsx` (usar o `serviceName` já montado, sem `customLabel ??`)
- Test: `e2e/agenda.spec.ts`

**Interfaces:**
- Consumes: `extraServiceIds`, `MAX_EXTRA_SERVICES`, `AppointmentRecord.extras`, `AppointmentRecord.inPackage`.
- Produces: `ServiceOption` ganha nada novo; `AppointmentForm` ganha a prop `allowExtras: boolean` (falso para sessão de pacote).

Comportamento:
- Abaixo de "Serviço": um seletor por extra, rotulado "Procedimento 2", "Procedimento 3"..., com as mesmas opções menos os flexíveis e menos os já escolhidos, e um botão "Remover" (com nome acessível "Remover procedimento N").
- Botão "Adicionar procedimento": visível quando há serviço principal escolhido, `allowExtras` e menos de 9 extras. Com `allowExtras` falso, no lugar do botão: "Sessão de pacote: só um procedimento."
- Ao escolher, trocar ou remover qualquer serviço: `durationMinutes` vira a soma das durações dos escolhidos, e os avisos pendentes caem (`dropWarnings`).
- Trocar o principal para um serviço que já é extra remove esse extra.
- Extra inativo de um agendamento antigo aparece na edição como "<nome> (inativo)".
- Erro de `extraServiceIds` aparece abaixo dos seletores; incluir o campo em `SHOWN_FIELDS`.
- Detalhe do agendamento: o texto do serviço usa o rótulo completo e, quando há extras, uma lista "Procedimentos" com nome e duração de cada um.

- [ ] **Step 1: e2e (falhando)** em `agenda.spec.ts`: criar agendamento com serviço principal e um extra; a duração é preenchida com a soma; depois de salvar, o detalhe mostra "A + B"; na agenda o bloco mostra "A + B"; editar removendo o extra volta a "A".
- [ ] **Step 2:** `npm run test:e2e -- agenda`. Esperado: falha.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm run test:e2e -- agenda`. Esperado: passa.
- [ ] **Step 5:** Commit `feat(agenda): adicionar procedimentos no formulário`.

### Task 8: Verificação final

- [ ] **Step 1:** `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:e2e`. Esperado: tudo passa.
- [ ] **Step 2:** Abrir o app local e conferir à mão, no celular (375 px) e no computador: Início com aviso, tela de aniversariantes, criar e editar bloco com dois procedimentos, "Meus horários" da cliente.
- [ ] **Step 3:** Atualizar `docs/agenda.md` e `docs/cadastro-de-pacientes.md` com um parágrafo cada sobre o que mudou.
- [ ] **Step 4:** Commit `docs: vários procedimentos e aniversariantes`.
- [ ] **Step 5:** Antes do merge: rodar a migração `0035` em produção (regra do projeto).
