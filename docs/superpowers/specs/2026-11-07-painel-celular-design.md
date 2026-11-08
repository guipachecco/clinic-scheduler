# Painel da dona: visual novo (celular e computador) — design

Data: 2026-11-07. Continua `2026-11-07-pagina-da-clinica-design.md`.

## Intenção

A dona usa o painel no celular, entre um atendimento e outro, e a primeira coisa que ela quer é **a agenda**. Hoje, no celular, o menu de cima corta os itens (Serviços, Expediente, Financeiro e Minha página só aparecem arrastando, sem nenhum sinal de que dá), e o Início é um texto antigo sem informação útil. O painel precisa abrir já mostrando o dia dela, com o mesmo cuidado visual da página da cliente.

Modelos aprovados pelo dono do projeto: `.superpowers/brainstorm/1317-1794100315/content/painel-celular-v1.html`, telas A, B e C ("assim fica BOM DEMAIS").

## Decisões do dono do projeto

- **Visual novo nos dois:** vale para o celular e para o computador.
- **Agenda no computador:** continua como está hoje, o calendário da semana ("deixa no pc por enquanto como agenda").
- **Agenda no celular:** vira a lista do dia da tela B.
- **Prioridade:** a agenda.

## O que muda

### Navegação

- **Celular (abaixo de `md`, 768 px):**
  - **Barra fixa embaixo:** Início · Agenda · Pacientes · **Mais**, no estilo da barra da cliente: ícones de linha e o item ativo em pílula amarela.
  - **"Mais":** abre por baixo uma folha (role="dialog") com Serviços, Expediente, Financeiro, Minha página, Tema claro/escuro e Sair, em blocos de 2 colunas.
  - **Topo:** o topo roxo atual com o menu horizontal sai. Fica um topo compacto com a marca Zemana, o nome da clínica e, para root, "Trocar de clínica".
- **Computador (`md` para cima):** a barra lateral roxa atual continua, com os mesmos itens. Só ganha o acabamento visual novo (abaixo).
- **Avisos:** os contadores que já existem continuam, por exemplo os pedidos na Agenda. No celular, o contador aparece no ícone.

### Início (celular e computador)

Mesmo conteúdo nos dois. No computador ele ocupa a área principal, com no máximo `max-w-3xl`.

1. **Cabeçalho:**
   - "Bom dia / Boa tarde / Boa noite, <primeiro nome>", pelo horário da clínica;
   - a data por extenso;
   - a foto da dona ou as iniciais;
   - um selo "N avisos" quando houver algum.
2. **Três números do dia** (fuso da clínica):
   - **hoje:** atendimentos de hoje que não foram desmarcados;
   - **pelo site:** desses, os de origem online;
   - **previsto:** a soma do preço dos atendimentos de hoje não desmarcados, quando a dona tem preço cadastrado. Se nenhum tiver preço, o número não aparece.
3. **Cartão "Próxima":**
   - **Qual atendimento:** o próximo de hoje que ainda não começou e não foi desmarcado.
   - **O que mostra:** horário, "em N min" (ou "em N h"), nome da paciente, serviço e duração.
   - **Atalhos:** **WhatsApp** (link para o telefone dela, se houver) e **Ver ficha** (página da paciente).
   - **Sem próxima de hoje:** mostra "Sem mais atendimentos hoje" e o primeiro atendimento do próximo dia, se houver.
4. **Lista "Hoje":** todos os atendimentos do dia, em ordem. Cada um mostra hora, nome, serviço e um selo de situação (Confirmado, Pedido, Concluído, Faltou, Desmarcado). Os vindos do site têm o selo "Site". Tocar abre o atendimento (`/admin/agenda/<id>`). Há também o link "Ver agenda".
5. **Avisos:** os avisos de ficha para confirmar (o `PendingLinkNotice` atual) e os pedidos de agendamento pendentes, quando houver.
6. **Botão "Agendar":** amarelo e flutuante no celular; botão normal no topo do Início no computador. Leva a `/admin/agenda/novo`.
7. **Texto antigo:** sai o "O conteúdo do site chega na próxima etapa".

### Agenda no celular (`/admin/agenda` abaixo de `md`)

- **Faixa de dias:**
  - mostra 5 a 7 dias, com setas e o mês;
  - o dia escolhido fica em roxo;
  - um ponto amarelo marca os dias que têm atendimento;
  - abre em hoje.
- **Lista do dia escolhido:** os atendimentos em ordem, com hora, nome, serviço, duração e selo. O próximo atendimento fica com borda roxa. Tocar abre o atendimento.
- **Horários livres:** entre os atendimentos, dentro do expediente do dia e fora dos bloqueios, aparece um bloco tracejado: "Livre das HH:mm às HH:mm · tocar para agendar". Tocar leva a `/admin/agenda/novo?inicio=<data e hora de início do bloco>`. A tela de novo agendamento já aceita esse parâmetro.
- **Dia fechado ou bloqueado:** a mensagem "Fechado" ou "Bloqueado: <motivo>", sem blocos livres.
- **Botão flutuante:** o "Agendar" flutua em cima da barra de baixo.
- **Pedidos:** a lista de pedidos pendentes que já existe (`requested-list`) continua acessível no topo, como um aviso "N pedidos para confirmar".
- **Computador:** a Agenda (`md` para cima) não muda em nada, nem no comportamento nem no layout.

### Acabamento visual (celular e computador, painel inteiro)

- **Cartões:** cantos mais arredondados (`rounded-2xl`), borda suave e uma sombra leve, a mesma linguagem dos cartões da página da cliente.
- **Selos de situação:** consistentes em todo o painel (as cores de `status-*` do tema).
- **Ícones:** só de linha (estilo do `panel-nav.tsx`), **nunca emojis**.
- **Tema:** claro e escuro funcionando.
- **Toque:** áreas de toque de no mínimo 44 px no celular.

### Correção na área da cliente

Em "Meus horários", um horário desmarcado não fica mais em "Próximos horários". Ele vai para uma seção "Desmarcados" abaixo, mais discreta, ou junto dos passados. A cliente continua sem poder desmarcar.

## Detalhes decididos (decisões minhas, o dono pode mudar)

- **"Previsto":**
  - **Preço:** usa o preço atual do serviço (`services.price_cents`), mesmo se a página da cliente esconder o preço (`price_display`). O agendamento não guarda preço, e o banco não muda.
  - **Quais entram:** soma os atendimentos de hoje que não estão Desmarcado nem Faltou.
  - **Preço faltando:** se algum deles não tem preço, o número ganha um "+" (ex.: "R$ 480+"). Se nenhum tem preço, o número não aparece.
- **"Hoje" e "pelo site":** contam os atendimentos de hoje que não estão Desmarcado nem Faltou.
- **Listas (Início e Agenda do celular):**
  - **Status:** mostram todos os status, na ordem do horário. Desmarcado aparece apagado (opacidade menor) e com o selo.
  - **Paciente anonimizada:** aparece como "Paciente anonimizada".
- **Horários livres:**
  - **O que ocupa:** todo atendimento que não está Desmarcado, inclusive Pedido, Concluído e Faltou, porque aquele tempo já foi usado.
  - **Intervalo de almoço:** cada intervalo do expediente gera seus próprios blocos, então o intervalo de almoço não vira livre.
  - **Bloqueios:** os blocos respeitam os bloqueios.
  - **Hoje:** não mostra livres que já passaram, e o bloco atual começa em "agora", arredondado para cima no passo da clínica.
  - **Tamanho mínimo:** só aparece bloco de pelo menos o passo de horários da clínica (`slot_step_minutes`).
- **"N avisos":** é a soma das fichas para confirmar com os pedidos de agendamento pendentes de hoje em diante (`countRequestedFrom`). O selo de pedidos da Agenda continua como é hoje.
- **Agenda no celular:**
  - **Dia escolhido:** renderizada no servidor, pela URL `?dia=yyyy-mm-dd`, que por padrão é hoje no fuso da clínica.
  - **Faixa de dias:** mostra 7 dias a partir do início da semana do dia escolhido. As setas andam uma semana, mudando a URL, sem limite de datas. O ponto amarelo marca os dias da faixa que têm algum atendimento não desmarcado.
  - **Página compartilhada:** a página monta a lista (visível só no celular, `md:hidden`) e o calendário atual (só no computador, `hidden md:block`). O calendário continua igual.
- **Saudação e foto:**
  - usa o primeiro nome de quem está logado (para root, o nome dela);
  - a foto é a foto da dona da clínica, pela rota de foto do painel que já existe. Sem foto, aparecem as iniciais.
- **Folha "Mais":**
  - reaproveita o botão de tema e o de sair que já existem;
  - fecha ao navegar, no Esc e ao tocar fora;
  - o contador de pedidos fica só no ícone da Agenda.
- **Área da cliente:** os desmarcados saem de "Próximos horários" e vão para uma seção "Desmarcados", depois dos passados, com o mesmo cartão em tom discreto (data, hora e serviço).
- **"em N min":** usa o agora no fuso da clínica e passa para "em N h" a partir de 60 min. O link do bloco livre usa o formato `yyyy-MM-ddTHH:mm` que `/admin/agenda/novo?inicio=` já aceita.

## Abordagens consideradas

1. **Só no celular:** desktop intacto. Menor, mas o dono quer o visual novo também no computador.
2. **Celular e computador, agenda do computador mantida (escolhida):** o visual novo e o Início valem para os dois. Navegação diferente por tamanho: barra embaixo no celular, lateral no computador. A agenda vira lista só no celular. Custo: duas formas de agenda para manter.
3. **Tudo em lista também no computador:** descartada pelo dono por agora, porque perderia a visão da semana.

## Não-objetivos

- Mudar regras de agendamento, permissões ou o banco.
- Arrastar atendimentos na lista do celular.
- Novas telas de financeiro ou relatórios.
- Notificação de avaliação nova (pode vir depois).

## Anti-objetivos

- **Itens escondidos:** um item do menu que só aparece arrastando sem aviso.
- **Botão flutuante por cima:** o "Agendar" cobrindo o último atendimento da lista, que precisa ter espaço embaixo.
- **Números enganosos:** um "previsto" que soma atendimentos desmarcados, ou um "hoje" fora do fuso da clínica.
- **Desktop quebrado:** qualquer mudança no comportamento da agenda do computador.

## O que fica para o construtor

- **Componentes:** a divisão em componentes e onde ficam as consultas novas, como os resumos do dia e os livres do dia. Use os módulos `appointments` e `schedule` que já existem e a mesma conexão do painel (`inClinic`).
- **Animação:** a da folha "Mais".
- **Cálculo dos livres:** reaproveitar a lógica de expediente e bloqueios que já existe (`findBlocksAndHours`).
