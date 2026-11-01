# Agenda do painel

Rascunho para aprovação, 30/10/2026. Cobre três entregas, nesta ordem: serviços, expediente e bloqueios, agenda. Cada entrega tem seu plano, revisão e commit.

## Intenção

A profissional precisa enxergar e organizar os atendimentos da clínica num só lugar, sem nunca marcar dois pacientes no mesmo horário. A clínica tem poucos pacientes e trabalha com flexibilidade: encaixes, durações que variam e horários fora do padrão quando necessário. A agenda deve ajudar sem engessar.

## Objetivos

- Cadastrar os serviços da clínica com duração, preparo, intervalo e preço.
- Configurar o expediente semanal e registrar folgas, férias e feriados.
- Ver a agenda por dia, semana, mês e lista, no computador e no celular.
- Criar, remarcar (inclusive arrastando), mudar a duração, confirmar, cancelar e marcar como concluído ou como falta.
- Mostrar os próximos e os últimos atendimentos na ficha do paciente.

## Fora do escopo

- Agendamento online pelo site (Etapa 3, entrega seguinte), janelas de horário por serviço e regras de antecedência, que só valem para ele.
- Lembretes e confirmações por WhatsApp, recorrência, lista de espera, vários profissionais ou salas, pagamentos.
- Observações clínicas no agendamento.
- Quando o agendamento online for construído, ele deve ignorar serviços flexíveis (`is_flexible`), mesmo que alguém marque "Aceita agendamento online" neles. A agenda do painel não pode supor que o serviço "Avaliação / encaixe" esteja ativo: ele pode ser desativado como qualquer outro.

## O que seria um fracasso mesmo funcionando

- Dois atendimentos ativos no mesmo horário, incluindo preparo e intervalo.
- Horário exibido errado por causa do fuso do navegador ou do horário de verão.
- Agendamento para paciente anonimizado.
- Nome de paciente em URL, log, histórico de ações ou mensagem de erro do servidor.
- Uma agenda tão rígida que a profissional volte a anotar no papel.

## Abordagens consideradas para o calendário

| Abordagem                                                            | A favor                                                            | Contra                                                                      | Escolha       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------- |
| FullCalendar (módulos gratuitos: dia, semana, mês, lista, interação) | Visões prontas e testadas, arrastar e redimensionar, fuso, teclado | Dependência grande; visual ajustado por CSS; arrastar no celular é ruim     | **Escolhida** |
| Calendário próprio                                                   | Controle total do visual, sem dependência                          | Semanas de trabalho para chegar ao mesmo nível; mais risco na parte central | —             |
| Só lista e semana próprias, sem arrastar                             | Rápido                                                             | Sem mês e sem arrastar; seria refeito depois                                | —             |

## Decisões tomadas com o usuário

- **Flexibilidade de serviço e duração:**
  - Todo agendamento escolhe um serviço.
  - A duração do serviço é só uma sugestão e pode ser mudada em cada agendamento.
  - Um serviço "Avaliação / encaixe" já vem cadastrado para atendimentos sem procedimento definido. Nele, um rótulo curto descreve o atendimento.
- **Fora do expediente, em folga ou feriado:**
  - no painel, um aviso e uma confirmação ("Agendar mesmo assim");
  - no agendamento online futuro, bloqueio.
- **Sobreposição de atendimentos ativos:** sempre recusada, inclusive no painel. Quem garante é a constraint do banco.

## Entrega 1: Serviços

- **Telas:**
  - `/admin/servicos` lista os serviços agrupados por categoria, com o status ativo ou inativo.
  - `/admin/servicos/novo` cria um serviço.
  - `/admin/servicos/<id>` edita um serviço.
  - As categorias são criadas, renomeadas, ordenadas e desativadas na própria lista.
- **Campos do serviço:**
  - categoria;
  - nome (2 a 80 caracteres; o slug é gerado do nome e precisa ser único);
  - descrição (até 500);
  - duração padrão (5 a 720 min);
  - preparo antes e intervalo depois (0 a 240 min cada);
  - preço e forma de exibir (fixo, "a partir de", "sob consulta", oculto);
  - exige confirmação;
  - aceita agendamento online;
  - orientações de preparo (até 1.000);
  - ativo;
  - ordem.

  Duração, preparo, intervalo e preço também são conferidos por constraints do banco; os demais limites (tamanhos de texto e ordem) são conferidos pela aplicação.

- **Sem exclusão:** um serviço com agendamentos é só desativado. Um serviço inativo não aparece para novos agendamentos, mas continua nos antigos.
- **Serviço flexível:** uma migração cria a categoria "Outros" e o serviço "Avaliação / encaixe". Ele vem ativo, com 30 min, preço oculto, sem agendamento online e com a coluna nova `services.is_flexible = true`. Só serviços flexíveis pedem o rótulo do agendamento.
- **Itens de saída:** os nove serviços da clínica não são criados pelo sistema. A profissional os cadastra, porque durações e preços não podem ser inventados.
- **Menu:** um item "Serviços".

## Entrega 2: Expediente e bloqueios

- **Expediente:** a tela `/admin/expediente` mostra os sete dias da semana, cada um com zero ou mais intervalos (início e fim, em hora local). Regras:
  - os intervalos de um mesmo dia não podem se sobrepor;
  - um dia sem intervalo conta como fechado.
- **Bloqueios:**
  - **Lista:** `/admin/bloqueios` mostra os bloqueios a partir de hoje. Cada um tem tipo (folga, férias, feriado, outro), dia inteiro ou intervalo de horas e um título interno (até 80 caracteres, sem dados de paciente).
  - **Criar e excluir:** é possível criar bloqueios e excluir os futuros.
  - **Conflitos:** quando o bloqueio novo cobre atendimentos já marcados, a tela lista esses horários e avisa. Nada é cancelado automaticamente.
- **Feriados nacionais:** o botão "Adicionar feriados nacionais de AAAA" cria os bloqueios do ano, calculados no código, sem consulta externa:
  - 1º/1;
  - Sexta-feira Santa;
  - 21/4;
  - 1º/5;
  - 7/9;
  - 12/10;
  - 2/11;
  - 15/11;
  - 20/11;
  - 25/12.

  Rodar o botão de novo não duplica. Feriados municipais e pontos facultativos (Carnaval, Corpus Christi) são cadastrados à mão.

- **Menu:** um item "Expediente", com os bloqueios acessíveis a partir dele.

## Entrega 3: Agenda

### Visões

- `/admin/agenda` usa o FullCalendar com as visões dia, semana, mês e lista. O padrão é semana no computador e lista no celular. Os botões Hoje, anterior e próximo trocam o período.
- **Fuso:** os horários são sempre os da clínica (`America/Sao_Paulo`), seja qual for o fuso do navegador. Isso vale também para o horário de verão, se voltar.
- **Grade:**
  - mostra do início do expediente mais cedo ao fim do mais tarde da semana (sem expediente cadastrado, das 7h às 20h);
  - o expediente aparece em destaque, e os bloqueios aparecem como faixas de fundo com o título;
  - a coluna de hoje usa o destaque da identidade visual.
- **Cartão de cada atendimento:**
  - mostra o apelido ou o primeiro nome do paciente e o serviço (ou o rótulo, no serviço flexível);
  - a cor indica o status: solicitado em amarelo claro com borda tracejada, confirmado em marinho, concluído em verde, falta em bordô;
  - cancelados ficam ocultos, com a opção "Mostrar cancelados", e aparecem riscados;
  - as cores entram como tokens no tema claro e no escuro.
- **Dados:** os eventos do período chegam do servidor por Server Action, nunca pela URL.

### Criar

- O botão "Novo agendamento", ou um clique num horário vazio, abre `/admin/agenda/novo`. A data e a hora clicadas vão como parâmetros da URL, o que é permitido porque não identificam ninguém.
- **Formulário:**
  - paciente: busca pelo mesmo critério da tela de pacientes, com o atalho "Cadastrar paciente", que volta para cá depois de salvar;
  - serviço: só os ativos;
  - rótulo: só para o serviço flexível, até 60 caracteres, com o aviso "Não registre informações de saúde aqui";
  - data e hora de início;
  - duração: preenchida com a duração do serviço e editável de 5 a 720 min.
- **Status e origem:** o agendamento feito no painel nasce "confirmado", com origem `admin`.
- **Horário ocupado:** `occupied_from` e `occupied_until` somam o preparo e o intervalo do serviço.
- **Avisos que pedem confirmação:**
  - fora do expediente;
  - sobre um bloqueio;
  - no passado.
- **Recusas:**
  - sobreposição: o erro mostra o horário do atendimento em conflito, sem o nome do paciente;
  - paciente anonimizado;
  - serviço inativo.
- **Gravação:**
  - tudo numa transação com `pg_advisory_xact_lock`, como previsto no planejamento;
  - a linha do paciente fica travada com `FOR SHARE`, com recusa se `anonymized_at` não for nulo;
  - uma chave de idempotência por envio do formulário evita duplicar o agendamento num clique duplo.

### Ver, remarcar e mudar status

- **Ficha do agendamento:** clicar num atendimento abre `/admin/agenda/<id>`. A página mostra os dados e as ações possíveis para o status atual, e permite editar serviço, rótulo, data, hora e duração.
- **Arrastar:** no computador, arrastar o atendimento muda a data e a hora, e esticar a borda muda a duração.
  - O servidor aplica as mesmas regras de quando o atendimento é criado.
  - Num caso de aviso, uma confirmação aparece antes de gravar.
  - Num caso de recusa, o atendimento volta ao lugar e a mensagem aparece.
  - Arrastar fica desligado no celular.
- **Transições de status** (o diagrama está no planejamento da Etapa 1):
  - solicitado → confirmado ou cancelado;
  - confirmado → cancelado, concluído ou falta. Concluído e falta só valem depois do horário de início;
  - concluído ↔ falta, para corrigir uma marcação errada.
- **Cancelar:** pede um motivo de uma lista fixa (pedido do paciente, remarcado, clínica indisponível, outro), gravado como código em `cancellation_reason`. Sem texto livre, para que nenhum dado pessoal fique ali. `cancelled_by` recebe `clinic`.
- **Histórico de ações:** cada operação gera `appointment.created`, `appointment.rescheduled`, `appointment.updated` ou `appointment.status_changed`. O registro guarda ids, horários, durações e status, nunca nomes.

### Ficha do paciente

- A ficha ganha a seção "Atendimentos", com os próximos e os últimos 10, cada um com data, hora, serviço e status, e com link para o agendamento.

## Banco de dados

Uma migração por entrega, só com acréscimos:

- Entrega 1: a coluna `services.is_flexible` (boolean, padrão `false`), mais a categoria "Outros" e o serviço "Avaliação / encaixe".
- Entrega 2: nenhuma mudança prevista. Se for preciso evitar feriado duplicado, entra um índice único parcial ou uma checagem no código.
- Entrega 3: a coluna `appointments.custom_label` (até 60 caracteres, só com serviço flexível) e uma CHECK que limita `cancellation_reason` aos códigos da lista.

## Dependências novas

Pacotes do FullCalendar (core, react, daygrid, timegrid, list e interaction) e o plugin de fuso nomeado (Luxon), necessário para exibir no fuso da clínica. Os estilos que o FullCalendar injeta são permitidos pela CSP atual (`style-src 'unsafe-inline'`); os scripts continuam exigindo nonce.

## Detalhes definidos na revisão do design

Decisões minhas (Claude), registradas a partir da leitura de um revisor; podem ser revistas:

- **O que se edita em cada status:**
  - Só agendamentos solicitados ou confirmados podem ser editados ou arrastados.
  - Concluídos, faltas e cancelados ficam só para leitura, exceto a correção entre concluído e falta.
  - Um cancelado não é reativado: cria-se um agendamento novo.
- **Preparo e intervalo ao remarcar:** o horário ocupado é recalculado com os tempos atuais do serviço, ou do serviço novo, se ele mudar.
- **Bloqueio de dia inteiro:** vai da meia-noite à meia-noite seguinte, no fuso da clínica.
- **Feriados repetidos:** um feriado nacional não é criado duas vezes. O código compara o tipo "feriado" e a data local.
- **Encaixe na grade:** arrastar e clicar usam o passo de `clinic_settings.slot_step_minutes` (30 min). A duração continua livre, de 5 a 720 min.
- **`service_duration_minutes`:** guarda a duração padrão do serviço no momento do agendamento. A duração real é a diferença entre o fim e o início.

## Deixado para quem constrói

- Nomes internos, desde que sigam `src/modules/<domínio>`.
- Como apresentar o formulário de agendamento no celular, desde que funcione a partir de 360 px.
- O ajuste fino do CSS do FullCalendar, desde que siga os tokens da identidade e tenha contraste AA.
