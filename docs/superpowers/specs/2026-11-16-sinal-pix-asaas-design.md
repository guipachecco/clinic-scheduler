# Sinal via Pix no agendamento online (Asaas)

Data: 2026-11-16

Legenda: **(decidido)** foi escolha do Guilherme na conversa; **(proposta)**
é escolha minha, para ele conferir; **(verificado)** foi testado no sandbox
do Asaas em 16/11.

---

## Por quê

Clientes marcam pela página da clínica e faltam ou desmarcam em cima da hora.
A dona quer uma garantia: quem marca online paga um sinal na hora, por Pix.
O Mercado Pago, que já está no código, está travado em produção (o OAuth do
MP não libera o fluxo, chamado WCS-58328). O Asaas entra no lugar dele para
o sinal.

Hoje a dona já consegue registrar um sinal, mas só montando um orçamento e
fixando a 1ª parcela. Para um agendamento comum isso é burocrático; o sinal
precisa acontecer sozinho.

## O que é

1. **Ativar recebimentos (painel).** A dona preenche os dados dela dentro da
   Zemana e a Zemana cria uma **subconta Asaas** para a clínica. O dinheiro
   do sinal cai nessa subconta, nunca na conta da Zemana. **(decidido)**
2. **Marcar com sinal (página da clínica).** Com a subconta aprovada, quem
   marca online paga **15% do valor do serviço** por Pix na hora. **(decidido)**
   O horário fica segurado enquanto ela paga e só vira confirmado quando o
   Pix cai.
3. **Venda automática (financeiro).** Pago o sinal, nasce uma venda ligada ao
   agendamento com duas parcelas: o sinal, já pago, e o restante, a receber
   no dia. Na agenda a dona vê "Sinal pago R$ 12,00 · Falta R$ 68,00" e
   recebe o restante como já recebe hoje. **(decidido)**
4. **Cancelar com regra de devolução (painel).** Quem cancela é sempre a
   dona, pelo painel, dizendo quem desmarcou. Cliente com mais de 24h de
   antecedência ou cancelamento pela clínica: o sinal volta por estorno
   Pix. Menos de 24h ou falta: o sinal fica com a dona. **(decidido)**

**Metas**

- Sinal acontecendo sem a dona fazer nada além de ativar uma vez.
- Dinheiro 100% da dona, sem taxa da Zemana por enquanto. **(decidido)**
- O sinal e o restante aparecem no financeiro no fluxo que ela já usa.

**Fora do escopo (não-metas)**

- Cliente cancelar ou remarcar sozinha pelo site (continua só a dona).
  **(decidido)** Fica para uma próxima etapa.
- Percentual configurável por clínica ou por serviço. Os 15% ficam numa
  constante. **(proposta)**
- Cartão de crédito, boleto, parcelamento do sinal.
- Taxa/comissão da Zemana (split do Asaas). **(decidido)**
- Modo white label/BaaS do Asaas (documentos dentro da Zemana). Exige
  liberação do gerente de contas; o desenho deixa a troca fácil. **(decidido:
  começar pela subconta comum)**
- Substituir o Mercado Pago no financeiro (links de cobrança de parcelas).
  O módulo MP continua como está.
- Sinal em agendamentos criados pela dona no painel.

**Não pode acontecer (anti-metas)**

- Cliente pagar e ficar sem horário, ou pagar duas vezes pelo mesmo horário
  sem estorno.
- Vaga presa para sempre por um Pix nunca pago.
- Dinheiro de uma clínica cair ou ser estornado na subconta de outra.
- A Zemana segurar dinheiro de terceiros (nada passa pela conta da Zemana).
- Chave de API de subconta em texto puro no banco ou em log.

## Restrições (verificadas)

- **Só conta CNPJ cria subconta.** **(verificado)** A conta sandbox em CPF
  recebeu 403; uma conta sandbox PJ criou. A Zemana **ainda não tem CNPJ**:
  tudo é construído e testado no sandbox; produção espera o CNPJ e a conta
  Asaas de produção da Zemana.
- **Subconta não usa Pix até ser aprovada.** **(verificado)** Recém-criada,
  ela recusa criar chave Pix e cobrança Pix ("sua conta precisa estar
  aprovada"). Status logo após criar: `commercialInfo: APPROVED`, demais
  `PENDING`; documento pendente `IDENTIFICATION` sem `onboardingUrl`.
- **Subconta comum:** o Asaas manda à dona um e-mail para criar senha e
  enviar documento com foto e selfie no site dele, uma vez. Período de
  avaliação regulatória de até 60 dias com limites de valor.
- **A `apiKey` da subconta só vem na resposta da criação.** Precisa ser
  gravada (criptografada) na mesma operação; perdeu, não recupera.
- **Pix exige CPF/CNPJ da cliente.** **(verificado)** Cobrança Pix para
  cliente Asaas sem CPF dá 400. `patients.cpf` é opcional hoje.
- **Pix no Asaas vence por data (`dueDate`), não por minuto.** A janela de
  30 minutos é controlada pela Zemana, que cancela a cobrança no Asaas
  (`DELETE /payments/{id}`) quando a janela passa.
- **Estorno Pix** é `POST /payments/{id}/refund`, total ou parcial, e sai do
  saldo da subconta. Se a dona já sacou e não há saldo, o estorno falha.
- **Tarifa do Asaas** é cobrada da subconta que recebe (a dona). No estorno
  a tarifa não volta.
- **Chave do `.env` local** começa com `$`: escapar com `\$` (o Next expande
  `$aact...` como variável). Já documentado no `.env.example`.
- **Agendamento online é de um serviço só** (`bookOnline` recebe um
  `serviceId`); vários procedimentos existem só no painel.
- **Venda exige orçamento hoje** (`sales.quote_id` é obrigatório).

## Formas consideradas

**Onde fica a conta da dona**

1. **Subconta comum** (escolhida). Dados preenchidos na Zemana, documentos
   uma vez no site do Asaas. Funciona sem negociar nada.
2. **Subconta white label/BaaS.** Documentos por um link de onboarding, sem
   a dona criar senha no Asaas. Melhor experiência, mas precisa ser liberada
   pelo gerente de contas. Fica como evolução: no código muda só o que a
   tela de ativação mostra (link de onboarding em vez de "confira seu
   e-mail").
3. **Conta própria da dona + chave colada no painel.** Descartada: a dona
   sai da Zemana para abrir conta e lidar com chave de API.

**Como organizar o código**

1. **Módulo `asaas` no molde do `mercado-pago`** (escolhida, proposta):
   chave criptografada por clínica, webhook que reconsulta a cobrança no
   Asaas, trava contra aviso repetido. Reaproveita `crypto.ts`.
2. **Camada genérica de "gateway"** para MP e Asaas. Descartada agora: só um
   gateway faz sinal, e os modelos (OAuth vs subconta, order vs payment)
   divergem demais para uma abstração útil.

## Fluxos

### 1. Ativar recebimentos (painel)

Tela nova em Financeiro, "Receber sinal por Pix" **(proposta de nome)**.
Só a dona (papel de admin da clínica) vê e usa.

- **Sem subconta:** formulário com os dados que o Asaas pede para criar a
  conta: nome/razão social, e-mail, CPF ou CNPJ, data de nascimento (PF) ou
  tipo de empresa (PJ), celular, renda/faturamento mensal, CEP, endereço,
  número, bairro. Pré-preenche o que a clínica já tem. Ao enviar:
  `POST /v3/accounts` com a conta principal da Zemana, já registrando o
  webhook da subconta; grava `apiKey` (criptografada), `walletId` e o id.
- **Subconta em análise:** mostra o status ("Confira o e-mail do Asaas para
  enviar seus documentos") e o que falta, lendo `GET /myAccount/status`
  com a chave da subconta. Atualiza ao abrir a tela e pelos avisos do
  Asaas.
- **Subconta aprovada:** a Zemana cria a chave Pix aleatória da subconta
  (`POST /pix/addressKeys`, tipo EVP) e liga o sinal. A tela mostra "Sinal
  de 15% ativo nos agendamentos online" e um interruptor para desligar.
  **(proposta: interruptor de liga/desliga)**
- **Recusada / com pendência:** mostra o motivo que o Asaas der e o que
  fazer.

O sinal só é cobrado quando: subconta aprovada + chave Pix ativa + sinal
ligado. Qualquer outra situação: a clínica agenda online como hoje.

### 2. Marcar com sinal (página da clínica)

Vale só para serviço com preço (`price_cents` preenchido, exibição `fixed`
ou `starting_at`; em `starting_at` usa o valor base). Serviço sem preço
(`on_request`/`hidden` sem valor) marca como hoje, sem sinal. **(proposta)**

1. Na confirmação do horário, a cliente vê o valor do sinal ("Sinal de
   R$ 12,00 por Pix para garantir o horário") e a regra de devolução em uma
   linha ("Devolvido se você desmarcar com mais de 24h de antecedência").
   Se ela não tem CPF salvo, a tela pede o CPF e grava na ficha dela.
   **(proposta)**
2. `bookOnline` grava o agendamento como **`requested`** (segura a vaga pelo
   `appointments_no_overlap`, como hoje) e registra o sinal pendente com
   prazo de **30 minutos**. **(proposta: 30 min)**
3. A Zemana cria (ou reaproveita) o cliente no Asaas da subconta, cria a
   cobrança Pix de 15% com `externalReference` = id do sinal, e mostra o QR
   Code e o "copia e cola" com o tempo restante.
4. A tela consulta o status a cada poucos segundos; quando o Pix cai, mostra
   "Horário confirmado".
5. **Se o Asaas falhar** ao criar a cobrança, o agendamento é desfeito na
   hora e a cliente vê "Não conseguimos gerar o Pix agora, tente de novo".
   Nada fica pendurado.
6. **Se o Asaas recusar por motivo que não passa sozinho** (limite do
   período de avaliação, subconta bloqueada, chave Pix removida): a
   marcação segue **sem sinal**, como antes de ativar, e o painel mostra à
   dona um aviso fixo com o motivo, na agenda e na tela de recebimentos.
   O status da subconta é reconsultado nessa hora. A clínica nunca fica sem
   agendamento online por causa do Asaas. **(proposta)**

**CPF** **(proposta)**: pode ser o de quem paga (mãe, parceiro). Ele **não
vai para a ficha** (`patients.cpf`): fica só no cliente Asaas guardado pela
Zemana para aquela paciente e clínica, e é reaproveitado na próxima vez.
Assim não há conflito com a unicidade de `patients.cpf` nem precisa dar à
cliente permissão de editar a própria ficha.

15% sobre o preço, arredondado para o centavo. **(proposta: arredondar
para cima, para nunca cobrar menos de 15%)** Sinal mínimo: o mínimo que o
Asaas aceitar numa cobrança Pix; abaixo disso, sem sinal. **(proposta;
o valor exato a conferir no sandbox)**

### 3. Pix pago

O webhook do Asaas (`PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED`) só serve de
gatilho: o sistema confere o token do aviso, descobre a clínica pelo
`externalReference`, **reconsulta a cobrança no Asaas com a chave da
subconta** e só então age. Em uma transação, com o sinal travado:

- Agendamento `requested` → `confirmed` (`confirmed_at`, log de auditoria
  com ator `system`).
- Cria a venda ligada ao agendamento: um item (o serviço), total = preço do
  serviço, duas parcelas: **sinal** (15%, vence hoje) e **restante** (85%,
  vence no dia do atendimento). Registra o pagamento do sinal na 1ª
  parcela, forma de pagamento **"Pix online"** (nova forma padrão por
  clínica, **proposta de nome**), data = dia do pagamento no fuso da
  clínica.
- Aviso repetido não faz nada (o sinal já guarda o pagamento que gerou).
- **Tarifa** **(proposta)**: o pagamento entra pelo **valor cheio** do
  sinal, igual ao Mercado Pago hoje. A tarifa do Asaas (e a tarifa perdida
  num estorno) não é lançada como despesa nesta versão; "lançar a taxa do
  gateway como despesa" já está na lista de pendências do MP e vale para os
  dois depois.

**Pix que chega quando o sinal não está mais aguardando** **(proposta)**.
O webhook decide pelo estado do sinal, nunca só pelo horário:

| Estado do sinal quando o Pix chega                          | O que acontece                                        |
| ----------------------------------------------------------- | ----------------------------------------------------- |
| `pending` dentro do prazo                                   | Confirma (fluxo normal)                               |
| `expired` só pelo prazo, horário ainda livre                | Reabre e confirma, como se tivesse pago a tempo       |
| `expired` só pelo prazo, horário ocupado                    | Estorna sozinho; status `refunded`, motivo "horário indisponível" |
| Agendamento cancelado pela dona antes do Pix                | Estorna sozinho; nunca reativa o que ela cancelou     |
| Dona confirmou na mão (fluxo 7)                             | Estorna sozinho; ela já recebeu por fora              |
| Já `paid` (segundo pagamento, ex.: QR antigo)               | Estorna sozinho o pagamento repetido                  |

Para distinguir "expirou pelo prazo" de "cancelado pela dona", o sinal
guarda o motivo do fechamento. Todo estorno automático aparece para a dona
no detalhe do agendamento.

### 4. Pix não pago

Sem cron hoje no projeto. **(proposta)** Expiração preguiçosa e segura:

- Todo cálculo de horários livres e todo `bookOnline` (dentro do
  `lockAgenda`) primeiro cancelam os sinais vencidos da clínica:
  agendamento `requested` → `cancelled` com `cancelled_by = system`, motivo
  "Sinal não pago", e a cobrança é cancelada no Asaas (falha nisso não
  impede o cancelamento local; o aviso de "pago depois" cobre o resto).
- A agenda do painel e a tela da cliente fazem a mesma limpeza ao abrir.

Assim a vaga volta a ficar livre no máximo na próxima vez que alguém olhar
a agenda, sem depender de um agendador.

### 5. Cancelar (painel)

A tela de cancelar que existe ganha, **só quando há sinal pago**, a
pergunta "Quem desmarcou?" (A cliente / A clínica) e mostra o efeito antes
de confirmar:

| Situação                                  | Sinal                                | Restante               |
| ----------------------------------------- | ------------------------------------ | ---------------------- |
| Cliente, mais de 24h antes do início      | Estornado no Asaas e no financeiro   | Parcela cancelada      |
| Cliente, 24h ou menos antes               | Fica com a dona (pagamento mantido)  | Parcela cancelada      |
| Clínica, a qualquer momento               | Estornado no Asaas e no financeiro   | Parcela cancelada      |
| Falta (`no_show`)                         | Fica com a dona                      | Parcela cancelada      |

- 24h contadas a partir do **início** do atendimento até o momento em que a
  dona registra o cancelamento. **(proposta: o momento do registro, não o
  momento em que a cliente avisou)**
- O estorno vai ao Asaas **primeiro**; só com sucesso o pagamento é
  estornado no financeiro e o agendamento cancelado. Se o Asaas recusar
  (ex.: sem saldo), nada muda aqui e a dona vê o motivo, podendo cancelar
  sem estornar e devolver por fora. **(proposta)**
- Venda: quando o sinal fica com a dona, a venda continua com o sinal pago e
  a parcela do restante cancelada (o caixa mostra o sinal como receita).
  Quando o sinal é estornado, a venda é cancelada.
- Agendamento ainda aguardando sinal: cancelar só cancela a cobrança no
  Asaas, sem pergunta.

### 6. Remarcar (painel)

O sinal acompanha o agendamento: remarcar não mexe no sinal; a parcela do
restante muda de vencimento para o novo dia. **(proposta)** Não há regra de
24h na remarcação (só a dona remarca).

### 7. Dona confirma na mão

Agendamento aguardando sinal pode ser confirmado pela dona (ex.: a cliente
pagou em dinheiro). Isso cancela a cobrança no Asaas e confirma sem venda
automática. **(proposta)**

## Onde aparece

- **Agenda (painel):** status "Aguardando sinal" distinto do "Solicitado"
  (pedido de aprovação). No detalhe: "Sinal pago R$ 12,00 · Falta R$ 68,00"
  e o "Receber agora" que já existe, apontando para a parcela do restante.
- **Lista de solicitações do painel** (`listRequestedFrom`): **não** mostra
  os aguardando sinal; eles se resolvem sozinhos.
- **Financeiro:** a venda automática aparece em Vendas (marcada como "Sinal
  online"), o restante em "A receber", o sinal no caixa do dia do Pix.
- **Página da clínica:** sinal na confirmação, QR Code, e em "Meus horários"
  o status "Aguardando pagamento do sinal" com o QR enquanto valer.

## Dados (proposta)

- `asaas_accounts` (uma por clínica): ids da subconta e da carteira,
  `api_key_enc`, status de aprovação, chave Pix pronta, sinal ligado,
  quem ativou, datas. RLS e `clinic_id` como as outras.
- `asaas_deposits` (um por agendamento com sinal): clínica, agendamento,
  valor, id da cobrança no Asaas, id do cliente Asaas, status
  (`pending`, `paid`, `expired`, `refunded`, `kept`, `conflict`), prazo,
  pagamento gerado. Mesmo padrão de `mercado_pago_charges`.
- Cliente Asaas por paciente e clínica (pode ficar numa coluna/tabela à
  parte para reaproveitar).
- Venda sem orçamento: `sales.quote_id` passa a aceitar nulo para vendas
  de origem "sinal online", ou a venda nasce com um orçamento aprovado
  automático. **Escolha de quem constrói**, preferindo o que mexer menos nas
  telas do financeiro.
- Forma de pagamento "Pix online" criada para cada clínica (migração, como
  as padrão).
- Webhook sem sessão: descobrir a clínica por função `SECURITY DEFINER`
  como `mercado_pago_order_clinic`, depois trabalhar como `app_panel`.

## Entrega antes do CNPJ **(decidido)**

Entra no `main` e em produção **desligado**:

- Sem `ASAAS_API_KEY` em produção, nenhuma tela, status ou texto novo
  aparece para as clínicas; agendamento online e financeiro seguem iguais.
- A forma de pagamento "Pix online" **não** nasce na migração: é criada
  para a clínica só quando ela ativa os recebimentos, para não aparecer nos
  seletores de "Receber" de todo mundo.
- As migrações são compatíveis com o código antigo e rodam em produção
  antes do merge (regra do projeto).
- Quando sair o CNPJ: abrir a conta Asaas de produção da Zemana, configurar
  as variáveis e seguir `docs/asaas.md`.

## Configuração

- `ASAAS_API_KEY`: chave da conta principal da Zemana (só cria subcontas).
- `ASAAS_BASE_URL`: `https://api-sandbox.asaas.com/v3` ou produção.
- `ASAAS_WEBHOOK_TOKEN` **(proposta)**: token que o Asaas manda em cada aviso,
  registrado no webhook de cada subconta na criação.
- Sem `ASAAS_API_KEY`, a tela de ativação não aparece e nada muda.
- Teste local: o Asaas só chama endereço público; usar túnel, como no MP.

## Para quem constrói

- Seguir `docs/mercado-pago.md` como modelo de segurança (aviso não é
  confiável, a cobrança é; uma baixa por cobrança; clínicas separadas).
- Ler `bookOnline` (`src/modules/booking/booking.ts`), `changeAppointmentStatus`
  e `rescheduleAppointment` (`src/modules/appointments/appointments.ts`),
  `session-links.ts` e `sales.ts` do financeiro.
- Confirmar no sandbox antes de fechar: valor mínimo de cobrança Pix,
  formato e token do webhook, eventos de status da subconta, e como aprovar
  uma subconta no sandbox para testar o Pix ponta a ponta.
- Produção depende do CNPJ da Zemana. Documentar o passo a passo de ligar
  em produção em `docs/asaas.md`.
