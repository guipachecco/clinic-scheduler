# Várias profissionais por clínica

## Por quê

Hoje a Zemana trata cada clínica como se tivesse uma profissional só: o nome,
o registro e a foto ficam em `clinics`, há uma agenda única e a restrição
`appointments_no_overlap` impede dois atendimentos ao mesmo tempo na clínica
inteira. Um salão com manicure e cabeleireira, ou uma clínica com duas
fisioterapeutas, não cabe nesse modelo.

## Objetivos

- Uma clínica pode cadastrar várias profissionais.
- Cada uma tem a própria agenda: duas profissionais podem atender no mesmo
  horário.
- Cada uma faz só os serviços marcados para ela e tem os próprios horários e
  bloqueios.
- Online, a cliente escolhe a profissional ou "Qualquer uma".

## Não objetivos (por ora)

- Profissional com login no painel. A dona gerencia a equipe e todas as
  agendas. A coluna do login (`user_id`) só entra na etapa 4. Criar agora um
  `user_id` vazio não serviria: os testes que fazem `truncate users cascade`
  apagariam a equipe junto.
- Comissão e relatórios por profissional no financeiro.

## Antiobjetivos

- Clínica com uma profissional só não pode ver mudança nenhuma: sem seletor,
  sem passo a mais no agendamento, sem campo novo obrigatório.
- A migração não pode deixar `/<slug>` fora do ar nem quebrar o código em
  produção entre `db:migrate` e o deploy.

## Decisões (do usuário)

| Ponto                         | Escolha                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Profissional entra no painel? | Não, por ora é só um cadastro                                                                                        |
| Serviços                      | Cada uma tem uma lista de serviços                                                                                   |
| Horários                      | Cada uma tem os próprios horários semanais e bloqueios; bloqueio sem profissional vale para a clínica toda (feriado) |
| Cliente                       | Escolhe a profissional ou "Qualquer uma"; com uma profissional só, o passo some                                      |

## Abordagens consideradas

1. **Tabela `professionals` e `appointments.professional_id` (escolhida).**
   Cada agenda é uma profissional e a restrição de sobreposição passa a ser
   por profissional. Exige mexer em quem grava agendamentos e nas funções
   SECURITY DEFINER, mas dá para fazer por etapas sem quebrar nada.
2. **"Agendas" ou recursos genéricos** (sala, aparelho, profissional).
   Mais flexível, mas ninguém pediu salas, e o vocabulário fica abstrato
   para as donas.
3. **Várias clínicas com a mesma dona.** Não exige mudar o modelo, mas
   duplica página, catálogo, pacientes e financeiro, e a cliente veria
   várias clínicas. Descartada.

## Modelo de dados

- `professionals`: `id`, `clinic_id`, `name` (1–60), `registration`
  (opcional), `photo_media_id` (FK composta com `media`, etapa 3),
  `is_active`, `sort_order`, datas.
  `unique (clinic_id, id)` é o alvo das FKs compostas.
- `appointments.professional_id` NOT NULL, com FK composta
  `(clinic_id, professional_id)`.
- `appointments_no_overlap`: `professional_id WITH =` mais sobreposição de
  `occupied_from`/`occupied_until`. `lockAgenda` continua travando a clínica
  inteira, o que é simples e suficiente.
- Etapa 2: `professional_services (professional_id, service_id)`,
  `professional_hours` (como `business_hours`) e `time_blocks.professional_id`
  opcional.

### Profissional padrão

É a primeira profissional ativa pela ordem (`sort_order`, `created_at`).
Durante a transição, a migração cria um gatilho BEFORE INSERT em
`appointments` que preenche `professional_id` com ela quando vier vazio.
Assim o código que ainda está em produção continua gravando enquanto o
deploy não sai. O código novo sempre manda o valor explícito.

### Decisões tomadas na implementação da etapa 1

- **O gatilho de `appointments` é permanente.** No Drizzle,
  `professional_id` é opcional na inserção (`$defaultFn` manda `DEFAULT`),
  então inserir sem profissional cai na padrão. O código do app sempre
  informa a profissional; os testes que inserem agendamentos direto no banco
  continuam funcionando sem mudança.
- **Toda clínica nasce com uma profissional**, criada pelo gatilho AFTER
  INSERT em `clinics`, por isso `createClinic` não muda. A FK de
  `professionals` para `clinics` é `ON DELETE CASCADE`: a profissional some
  junto com a clínica, e os agendamentos (restrict) continuam impedindo
  apagar uma clínica que tenha atendimentos.
- **A profissional não pode ser desativada** se for a última ativa, ou se
  tiver atendimentos ativos que ainda não terminaram. A verificação roda sob
  `lockAgenda`, a mesma trava de quem cria um atendimento.
- **O celular ainda não mostra a profissional.** A agenda do celular
  (`getDayAgenda`) e os intervalos livres que ela mostra continuam sendo da
  clínica inteira. Isso fica para a etapa 2.

## Migração das clínicas que já existem

Cada clínica ganha uma profissional, com o nome vindo de `professional_name`,
ou de `display_name`, ou de `name`, e o registro de
`professional_registration`. Todos os agendamentos são atribuídos a ela. Na
etapa 2 ela recebe todos os serviços e uma cópia de `business_hours`. As
colunas `clinics.professional_*` e `owner_photo_media_id` continuam até a
etapa 3, quando a página pública e o card passarem a ler a equipe.

## Etapas

1. **Equipe e agenda por profissional** (este PR)
   - Migração: `professionals` com RLS (`app_panel` pela clínica,
     `app_platform` livre, `app_client` só as ativas e só as colunas
     públicas), criação de uma profissional por clínica,
     `appointments.professional_id` preenchido e NOT NULL, o gatilho de
     transição, a restrição por profissional e a função
     `client_busy_intervals(p_clinic, p_professional, p_from, p_to)`. A
     versão de três argumentos fica, para o deploy em curso.
   - A clínica nova ganha a sua profissional pelo gatilho de `clinics`.
   - Painel: página "Equipe" para listar, criar e editar (nome, registro,
     ativa, ordem). Não pode desativar a última ativa nem uma que tenha
     atendimentos futuros. A agenda pede a profissional ao criar e ao editar
     um atendimento, mas só quando há mais de uma ativa. O conflito de
     horário passa a ser por profissional. Cada atendimento mostra o nome da
     profissional quando há mais de uma.
   - Online, até a etapa 3: os agendamentos vão para a profissional padrão,
     e os horários livres são os dela.
   - As sessões de pacote do financeiro vão para a profissional padrão até a
     etapa 2.
2. **Serviços e horários por profissional**: telas no painel, slots
   calculados para cada uma e bloqueios individuais.
3. **Cliente escolhe**: passo "Com quem?" no `/marcar`, com "Qualquer uma"
   (união dos horários livres, atribuída à primeira livre pela ordem). A
   equipe aparece na página pública e no card, com foto e registro por
   profissional, e as colunas `clinics.professional_*` são aposentadas.
4. **(Opcional) Login da profissional**, com RLS por profissional.

## Fica para quem implementar

Textos exatos da tela "Equipe", a ordenação por arrastar ou por número e a
cor ou etiqueta da profissional no calendário.
