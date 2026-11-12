# Várias profissionais — Etapa 1: equipe e agenda por profissional

> Execução: nativa, nesta sessão (aprovada pelo usuário em 2026-11-12).

**Goal:** a clínica cadastra várias profissionais, e cada uma tem a própria agenda.
**Spec:** `docs/superpowers/specs/2026-11-12-varias-profissionais-design.md`

## Restrições globais

- Clínica com uma profissional só não vê mudança nenhuma na interface.
- A migração 0031 precisa ser compatível com o código que ainda está em produção:
  roda `db:migrate` em produção antes do merge.
- Textos em pt-BR, código e comentários em inglês, como no resto do repositório.

## Tarefas

1. **Migração 0031 e schema**: tabela `professionals` com RLS e grants
   (`app_panel` pela clínica; `app_platform` livre; `app_client` lê
   `id, clinic_id, name, is_active, sort_order` das ativas da própria clínica).
   Cria uma profissional por clínica, adiciona `appointments.professional_id`
   (preenche e passa a NOT NULL, com FK composta) e muda
   `appointments_no_overlap` para `professional_id WITH =`. Gatilhos SECURITY
   DEFINER: AFTER INSERT em `clinics` cria a profissional padrão, e BEFORE
   INSERT em `appointments` preenche `professional_id` vazio com a padrão.
   Cria também `client_busy_intervals(uuid, uuid, timestamptz, timestamptz)`;
   a versão de três argumentos fica.
   Testes de integração: backfill e NOT NULL; duas profissionais no mesmo
   horário passam e a mesma profissional é recusada (23P01); o gatilho de
   clínica nova; RLS entre clínicas; e a função nova ignora a ocupação da
   outra profissional.
2. **Módulo `src/modules/professionals`**: `fields.ts` (zod: nome de 1 a 60,
   registro até 40, ordem), `professionals.ts` (`listProfessionals`,
   `createProfessional`, `updateProfessional`, `defaultProfessionalId`).
   Não desativa a última ativa nem uma com atendimentos futuros. Testes
   unitários dos campos e testes de integração das regras.
3. **Agendamentos no painel**: `professionalId` no formulário e em
   `createAppointment`, `updateAppointment` e `rescheduleAppointment`;
   `overlapRefusal` passa a ser por profissional; `insertSessionAppointments`
   usa a padrão. A profissional precisa estar ativa e ser da clínica.
   Testes de integração.
4. **Online**: `bookOnline`, `listFreeSlots` e `listDaysWithSlots` usam a
   profissional padrão e a função de quatro argumentos. Teste de integração.
5. **Telas**: página `/admin/equipe` (lista com edição inline e criação), o
   item "Equipe" no menu, o seletor no formulário de atendimento e o nome da
   profissional no calendário, ambos só quando há mais de uma ativa.
6. **Verificação**: `test:unit`, `typecheck`, `lint`, `format:check`
   (`--end-of-line auto`) e os testes de integração afetados. Depois, o PR.
