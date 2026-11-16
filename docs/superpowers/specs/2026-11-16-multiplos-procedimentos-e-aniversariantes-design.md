# Vários procedimentos no agendamento e aniversariantes do dia

Data: 2026-11-16

São duas entregas independentes. Ordem: aniversariantes primeiro (pequena,
sem migração), depois os vários procedimentos.

Legenda: **(decidido)** foi escolha do Guilherme na conversa; **(proposta)**
é escolha minha, para ele conferir.

---

## Parte 1: Aniversariantes do dia

### Por quê

A dona quer saber, ao abrir o painel, quais clientes fazem aniversário hoje,
para dar os parabéns.

### O que é

- **(decidido)** Uma tela com as clientes que fazem aniversário no dia.
- **(proposta)** Rota `/admin/pacientes/aniversariantes`, com link na tela de
  Clientes.
- **(proposta)** Cada linha: nome (e apelido), idade que completa hoje,
  telefone e um botão de WhatsApp para a conversa com ela. O nome leva à
  ficha da cliente.
- **(proposta)** No Início, um aviso "N aniversariante(s) hoje" que leva à
  tela, só quando houver alguém.
- **(proposta)** Tela vazia: "Nenhuma aniversariante hoje."

### Regras

- "Hoje" é o dia no fuso da clínica (`clinics.timezone`), não o do servidor.
- Usa `patients.birth_date`, que já existe e é opcional. Quem não tem data
  não aparece.
- Ficam de fora: registros anonimizados e cadastros provisórios
  (`pending_link_patient_id` preenchido).
- Nascidas em 29/02 aparecem em 28/02 nos anos não bissextos.
- Ordem alfabética.

### Fora do escopo

- Envio automático de mensagem.
- Aniversariantes da semana ou do mês.
- Tornar a data de nascimento obrigatória.

### Para quem constrói

- Função nova em `src/modules/patients/` (ex.: `listBirthdays(clinicId, now)`),
  dentro de `inClinic`, filtrando por mês e dia. A regra de 29/02 fica em uma
  função pura com teste unitário.
- Sem migração e sem índice novo (a lista de clientes de uma clínica é
  pequena).
- O botão de WhatsApp segue o padrão de link que o painel já usa; nenhum
  dado pessoal além do telefone vai na URL.
- Testes: unitário da regra de data, integração da listagem (isolamento
  entre clínicas, anonimizada fora, 29/02).

---

## Parte 2: Vários procedimentos no mesmo agendamento

### Por quê

A dona atende a mesma cliente em mais de um procedimento seguido (ex.:
manicure + pedicure). Hoje ela precisa criar um agendamento para cada um.

### O que é

- **(decidido)** Um bloco só: um horário contínuo, um status, uma
  confirmação, um cancelamento, uma cobrança.
- **(proposta)** Só no painel. A cliente no site continua marcando um
  serviço por vez.
- **(proposta)** Todos os procedimentos do bloco são da mesma profissional.
- **(proposta)** Para a fidelidade, o bloco conta como uma visita.

### Formas consideradas

- **A. Procedimentos extras em tabela nova (escolhida).** O agendamento
  mantém seu serviço principal e ganha uma lista de adicionais. Migração só
  acrescenta; agendamento online, pacotes e fidelidade seguem intactos.
  Custo: assimetria entre "principal" e "extras".
- **B. Todos os procedimentos em uma tabela, sem serviço no agendamento.**
  Modelo mais limpo, mas o serviço do agendamento é lido em cerca de 40
  arquivos, regras do banco e no agendamento online. Risco alto com cliente
  em produção, para o mesmo resultado na tela.
- **C. Só texto no rótulo.** Descartada: não soma preço nem duração.

Guilherme escolheu a **A** pelo menor risco.

### Dados

Tabela nova `appointment_services`:

| coluna | observação |
|---|---|
| `id` | uuid |
| `clinic_id` | como nas outras tabelas da clínica |
| `appointment_id` | referência composta (clínica, agendamento), `ON DELETE CASCADE` |
| `service_id` | referência composta (clínica, serviço), `ON DELETE RESTRICT` |
| `service_name` | copiado na hora, como em `appointments` |
| `service_duration_minutes` | copiado na hora |
| `position` | ordem dentro do bloco, a partir de 1 |

- Único por (`appointment_id`, `service_id`) e por (`appointment_id`,
  `position`).
- RLS no mesmo padrão de `appointments`: o painel lê e escreve na sua
  clínica; a cliente lê apenas os dos seus próprios agendamentos.
- Migração `0035`, só acrescenta. Lembrar da regra do projeto: rodar a
  migração em produção **antes** do merge.

### Regras **(propostas)**

- O serviço principal é o primeiro; os extras vêm depois, na ordem escolhida.
- Até 9 extras. Um serviço não se repete no bloco (nem igual ao principal).
- Extra precisa ser um serviço ativo e não flexível (o "encaixe" exige
  rótulo, então só pode ser o principal). Na edição, um extra que já estava
  no agendamento continua permitido mesmo se foi desativado.
- Duração: ao adicionar ou remover um procedimento, o formulário preenche a
  duração com a soma; a dona pode ajustar à mão, como hoje.
- Intervalos: preparação do principal antes, e limpeza do último
  procedimento depois.
- Agendamento que é sessão de pacote (`sale_sessions`) não aceita extras; o
  formulário explica o motivo.
- Arrastar e redimensionar na agenda continuam como hoje e não mexem nos
  extras.
- Auditoria: `appointment.created` e `appointment.updated` passam a
  registrar os ids dos extras (nunca nomes).

### Onde aparece

O texto do serviço vira "Manicure + Pedicure" em:

- bloco da agenda e painel lateral;
- detalhe do agendamento (com a lista e a duração de cada um);
- lista do dia e cartão "próximo" no Início;
- histórico na ficha da cliente;
- "Meus horários" da cliente.

Valores:

- "Previsto" do Início soma os preços de todos os procedimentos; se algum
  não tem preço, mantém o "+" de parcial que já existe.
- O valor sugerido ao receber no agendamento passa a ser a soma dos preços
  conhecidos.

### Formulário

No formulário de agendamento do painel (criar e editar), abaixo de
"Serviço": botão "Adicionar procedimento", que abre mais um seletor de
serviço; cada extra tem um "Remover". Erros de um extra aparecem junto do
seu seletor.

### Fora do escopo

- Vários serviços no agendamento online.
- Profissionais diferentes dentro do mesmo bloco.
- Status ou cobrança separados por procedimento.
- Consumo de pacote por um procedimento extra.

### Para quem constrói

- `appointmentFormSchema` ganha `extraServiceIds` (lista de uuid, padrão
  vazio).
- `createAppointment` e `updateAppointment` validam e gravam os extras na
  mesma transação; a repetição por chave de idempotência continua
  comparando paciente, serviço principal e início.
- Uma função única monta o texto do serviço ("A + B"), usada em todas as
  telas acima.
- Testes: unitários do esquema e do texto; integração de criar, editar
  (adicionar, remover, reordenar), recusas (repetido, flexível, inativo,
  sessão de pacote), isolamento entre clínicas e soma do previsto; um e2e
  do fluxo de criar com dois procedimentos.
