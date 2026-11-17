# Sinal por Pix (Asaas)

Construído em 16/11/2026 a partir do [desenho aprovado](superpowers/specs/2026-11-16-sinal-pix-asaas-design.md) e refeito em 17/11/2026 para a conta própria da dona ([desenho](superpowers/specs/2026-11-17-sinal-pix-conta-propria-design.md)). Quem marca pela página da clínica paga um sinal de 15% do serviço por Pix, e o horário só vira confirmado quando o Pix cai. **A dona conecta a própria conta Asaas** colando a chave de API dela: o dinheiro cai direto nessa conta, e a Zemana não recebe nem repassa nada. O Mercado Pago (veja [mercado-pago.md](mercado-pago.md)) continua só para cobrar parcelas no financeiro.

**Situação: pronto; falta ligar em produção e testar com a primeira dona (Greice).** Sem `ASAAS_WEBHOOK_TOKEN` no ambiente, nenhuma tela, status ou texto novo aparece, e a marcação online e o financeiro funcionam como antes. Os testes automáticos usam um Asaas falso. O fluxo inteiro (chave colada, Pix pago, aviso no webhook, reembolso) **não foi testado de ponta a ponta** (veja o checklist).

## O fluxo

1. **Conectar** (`/admin/financeiro/sinal-pix`, só a dona): a dona cria a conta no Asaas, gera uma chave de API (Integrações, Chaves de API, criar chave) e cola na tela. A Zemana testa a chave lendo a conta, guarda a chave criptografada, registra na conta dela um webhook "Zemana" (ou atualiza e reativa o que já existe) e guarda o nome da conta para mostrar na tela. Uma conta Asaas conecta em uma clínica só. "Trocar chave" reconecta pelo mesmo formulário e reativa o webhook.
2. **Aprovação**: a tela mostra o status e consulta o Asaas ao abrir e pelos avisos. Conta aprovada: a Zemana usa a chave Pix ativa da conta (de qualquer tipo) ou cria uma, cria a forma de pagamento "Pix online" da clínica e liga o sinal. A dona pode desligar e ligar de novo.
3. **Marcar**: na confirmação do horário, a cliente vê o valor do sinal e a regra de devolução, informa o CPF (de quem paga, pode ser outra pessoa) e recebe o QR Code e o "copia e cola". O agendamento nasce "Aguardando sinal" e segura o horário por **30 minutos**. A tela consulta o pagamento a cada poucos segundos. Quem sai e volta encontra o QR em "Meus horários".
4. **Pix pago**: o Asaas avisa o webhook (`/api/webhooks/asaas`). O sistema confere o token, reconsulta a cobrança no Asaas com a chave da dona e, se paga, confirma o agendamento e cria a venda "Sinal online".
5. **A venda "Sinal online"**: nasce ligada ao agendamento, com um orçamento aprovado criado automaticamente, e duas parcelas: o **sinal** (15%, pago, forma "Pix online", data do dia) e o **restante** (85%, vence no dia do atendimento). Na agenda, o detalhe mostra "Sinal pago R$ X · Falta R$ Y", e o restante é recebido como qualquer parcela.
6. **Pix não pago**: passados os 30 minutos, o agendamento vira cancelado ("Sinal não pago") e a cobrança é cancelada no Asaas. Não há agendador: a limpeza acontece quando alguém abre os horários livres, marca online ou abre a agenda.
7. **Cancelar** (painel): quando há sinal pago, a tela pergunta "Quem desmarcou?" e mostra o efeito antes de confirmar.

| Situação                             | Sinal                              | Restante          |
| ------------------------------------ | ---------------------------------- | ----------------- |
| Cliente, mais de 24h antes do início | Estornado no Asaas e no financeiro | Parcela cancelada |
| Cliente, 24h ou menos antes          | Fica com a dona                    | Parcela cancelada |
| Clínica, a qualquer momento          | Estornado no Asaas e no financeiro | Parcela cancelada |
| Falta (`no_show`)                    | Fica com a dona                    | Parcela cancelada |

As 24h contam do início do atendimento até o momento em que a dona registra o cancelamento; exatamente 24h ainda fica com a dona. O estorno vai ao Asaas **primeiro**; se ele recusar (por exemplo, sem saldo), nada muda aqui e a dona vê o motivo. Quando o sinal é estornado, a venda é cancelada; quando fica com a dona, a venda continua com o sinal pago e o restante cancelado. Falta que depois vira "concluído" devolve o sinal ao estado pago e reabre o restante.

## Regras que o sistema garante

- **Sinal mínimo.** O Asaas recusa cobrança Pix abaixo de **R$ 5,00** (confirmado no sandbox). Como o sinal é 15%, serviço abaixo de **R$ 33,34** marca sem sinal. Também não há sinal para serviço sem preço ou com exibição "sob consulta" ou oculta. O valor é 15% arredondado para cima ao centavo.
- **O aviso não é confiável, a cobrança é.** O webhook só lê o id do pagamento e a referência externa (o id do sinal). O status vem sempre de uma consulta ao Asaas com a chave da dona. O token do aviso é comparado em tempo constante.
- **Uma baixa por cobrança.** O sinal fica travado durante o processamento e guarda o pagamento que gerou, então aviso repetido não muda nada.
- **Pix que chega fora de hora é devolvido sozinho**: horário que já foi ocupado por outra pessoa, agendamento cancelado pela dona, confirmado na mão, segundo pagamento do mesmo sinal (QR antigo), ou pagamento de valor diferente do sinal. Se o prazo passou mas o horário continua livre e ainda não começou, o sinal reabre e confirma; se o horário já passou, o Pix é devolvido. Nunca reativa o que a dona cancelou. O estorno automático fica registrado na auditoria (`asaas.deposit_auto_refunded`) e o sinal continua "expirado/fechado", já que nenhum pagamento chegou a ser lançado aqui.
- **Estorno feito no app do Asaas** cancela a venda aqui sozinho, como no Mercado Pago.
- **Se o Asaas falhar ao criar a cobrança**, o agendamento é desfeito na hora e a cliente vê "não conseguimos gerar o Pix agora". Se recusar por motivo que não passa sozinho (limite do período de avaliação, conta bloqueada), a marcação segue **sem sinal** e a dona vê um aviso fixo na agenda e na tela do sinal. A clínica nunca fica sem marcação online por causa do Asaas.
- **Cliente não confirma sozinha.** Uma política de linha (migração `0037`) deixa a cliente criar o agendamento "solicitado" só quando a clínica tem o sinal ativo (função `asaas_deposit_active`); sem isso continua valendo a regra antiga de só criar confirmado.
- **Clínicas separadas.** As tabelas têm `clinic_id`, RLS e chaves compostas. O webhook chega sem sessão: descobre a clínica pelo sinal (função `SECURITY DEFINER` que só responde isso) e depois trabalha dentro dela como `app_panel`.
- **Segredos.** A chave da dona é criptografada (AES-256-GCM, a mesma derivação do Mercado Pago) e nunca volta para a tela, log, auditoria ou resposta de ação. Erros do Asaas nunca carregam o corpo da resposta, que pode ter CPF. O CPF informado não vai para a ficha da paciente: fica só no cliente Asaas da conta da dona, e nem auditoria nem log guardam CPF.
- **Chave revogada.** Se o Asaas passar a recusar a chave (401), o sinal é desligado, a conta fica "desconectada", as marcações seguem sem sinal e a agenda e a tela do sinal mostram o aviso para colar uma chave nova. Sinal pendente na tela da cliente vence normalmente.
- **A Zemana não segura dinheiro.** Nada passa pela conta da Zemana. A tarifa do Pix sai da conta da dona, e no estorno ela não volta.

## Configuração

Variáveis de ambiente (também no `.env.example`):

- `ASAAS_WEBHOOK_TOKEN`: um valor aleatório (32+ caracteres). **Sem ele, o recurso fica desligado.** O Asaas devolve esse token em cada aviso; ele é registrado no webhook "Zemana" da conta de cada dona quando ela conecta.
- `ASAAS_BASE_URL`: `https://api-sandbox.asaas.com/v3` no sandbox (padrão), `https://api.asaas.com/v3` em produção. Chave `$aact_prod_` só vale com a URL de produção, e `$aact_hmlg_` só com a de sandbox.

**Por clínica:** o sinal é o módulo "Sinal por Pix" (`pix_deposit`), que o root liga em Clínicas → editar → Módulos. Começa desligado em toda clínica (migração 0040). Sem ele a aba some, a agenda não mostra os avisos do Asaas e a marcação online sai sem sinal; sinais já pendentes terminam normalmente pelo webhook. A aba também exige o módulo Financeiro.

Não há webhook para cadastrar à mão no painel do Asaas: ao conectar, a Zemana registra o webhook "Zemana" na conta da dona, apontando para `BETTER_AUTH_URL` + `/api/webhooks/asaas`. Os outros webhooks dela nunca são alterados.

**Banco:** as migrações `0036_asaas.sql`, `0037_asaas_client_hold.sql`, `0038_asaas_link_fixes.sql` e `0039_asaas_own_account.sql` só acrescentam ou relaxam (o código antigo roda com elas aplicadas). Rode o `db:migrate` de produção **antes** de mesclar, senão a página da clínica dá 500.

**Testar no computador:** o Asaas só chama endereço público com HTTPS. Rode um túnel (ngrok ou cloudflared), use o endereço dele em `BETTER_AUTH_URL` e conecte a conta depois disso (o webhook nasce com esse endereço). Use uma chave de sandbox de uma conta de teste.

## Ligar em produção

1. Gerar um valor aleatório (32+ caracteres) e definir `ASAAS_WEBHOOK_TOKEN` no ambiente de produção.
2. Definir `ASAAS_BASE_URL=https://api.asaas.com/v3` (produção).
3. Rodar o `db:migrate` de produção, com as migrações 0036 a 0039, **antes** do merge.
4. Mesclar.
5. Ligar o módulo "Sinal por Pix" na clínica (migração 0040 rodada antes do merge que a traz).
6. A dona (Greice) conecta a conta em `/admin/financeiro/sinal-pix`, colando a chave de API da conta Asaas de produção dela. Fazer uma marcação de teste com o menor valor possível (serviço de pelo menos R$ 33,34) e conferir o reembolso.

## Riscos a confirmar no teste com a dona

- **Reembolso pode pedir aprovação da dona.** O Asaas trata estorno de Pix como saque, e saques numa conta comum pedem token por SMS ou app. No sandbox o reembolso passou direto. Se em produção ficar pendente, o cancelamento conclui aqui e a agenda mostra "O reembolso foi pedido e está aguardando sua aprovação no app do Asaas." Se ela nunca aprovar ou o Asaas recusar de vez, o sinal fica como devolvido aqui sem ter saído: conferir com ela.
- **Webhook pausado.** Se o Asaas pausar a fila do webhook dela (falhas seguidas), os pagamentos não confirmam sozinhos. O e-mail de aviso do Asaas vai para o e-mail da conta dela. "Trocar chave" reativa o webhook.
- **Tarifa do Pix** sai da conta dela.

## Onde o código está

| Parte                                                   | Arquivo                                                                                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tabelas                                                 | `src/db/schema/asaas.ts`, migrações `drizzle/0036_asaas.sql`, `0037_asaas_client_hold.sql`, `0038_asaas_link_fixes.sql` e `0039_asaas_own_account.sql` |
| Chamadas ao Asaas (todas aceitam um `fetch` para teste) | `src/modules/asaas/api.ts`                                                                                                                             |
| Regras puras (15%, mínimo, 24h, pagamento tardio, CPF)  | `src/modules/asaas/rules.ts`                                                                                                                           |
| Conectar conta, chave Pix, liga e desliga               | `src/modules/asaas/accounts.ts`, `fields.ts`                                                                                                           |
| Sinal: cobrança, expiração, aviso, cancelamento         | `src/modules/asaas/deposits.ts`                                                                                                                        |
| Venda "Sinal online"                                    | `src/modules/asaas/deposit-sale.ts`, `src/modules/finance/sales.ts`                                                                                    |
| Webhook                                                 | `src/app/api/webhooks/asaas/route.ts`                                                                                                                  |
| Painel (conectar e ligar)                               | `src/app/admin/(painel)/financeiro/sinal-pix/`                                                                                                         |
| Agenda (status, detalhe, cancelar com devolução)        | `src/app/admin/(painel)/agenda/`                                                                                                                       |
| Marcação online (sinal, QR, meus horários)              | `src/modules/booking/booking.ts`, `src/app/[slug]/marcar/`, `src/app/[slug]/meus-horarios/`                                                            |
| Testes                                                  | `src/modules/asaas/api.test.ts`, `rules.test.ts`, e os de integração em `tests/integration/`                                                           |

## Checklist antes de ligar em produção (sandbox, manual)

O teste ponta a ponta exige túnel público e uma conta Asaas, então **não foi feito por automação**. Os testes automáticos usam um Asaas falso. Faça uma vez (sandbox ou com a Greice), e anote aqui o que divergir:

1. Subir o app com túnel e `BETTER_AUTH_URL` apontando para ele, com `ASAAS_WEBHOOK_TOKEN` e `ASAAS_BASE_URL` do sandbox.
2. Conectar uma clínica de teste colando a chave de sandbox (conta aprovada). Conferir que o webhook "Zemana" aparece na conta, a chave Pix é usada ou criada e o sinal liga.
3. Marcar um serviço de pelo menos R$ 33,34 na página da clínica, informando um CPF válido. Ver o QR.
4. Pagar o Pix pelo painel do sandbox. Ver "Horário confirmado", o agendamento confirmado e a venda "Sinal online" com sinal pago e restante a receber.
5. Marcar de novo e deixar o prazo passar: ver o cancelamento "Sinal não pago".
6. Cancelar um agendamento pago pela clínica (e outro como cliente com mais de 24h): ver o estorno no Asaas e a venda cancelada. Cancelar um com menos de 24h: ver o sinal mantido.
7. Estornar um pagamento pelo app do Asaas e ver a venda cancelar aqui.

Pontos a confirmar nesse teste (a documentação pública não deixava claro, ou o código usa o mais provável):

- **Nome do header do webhook:** o código lê `asaas-access-token`, como na documentação do Asaas.
- **Códigos de erro do Asaas** para "limite da conta" (que faz a marcação seguir sem sinal) e para "saldo insuficiente" (que impede o estorno): hoje são suposição; confirmar os códigos reais e ajustar a lista de erros permanentes em `deposits.ts`.
- **Formato dos eventos de pagamento** (`PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_REFUNDED`): o código só usa o id do pagamento e a referência externa, mas vale ver um aviso real.

**Sem teste e2e no navegador:** não existe `e2e/asaas-deposit.spec.ts`. O e2e do projeto não tem um Asaas falso. Sem `ASAAS_WEBHOOK_TOKEN`, os e2e existentes cobrem a marcação e o financeiro iguais a antes.

## O que ainda não existe

- A cliente cancelar ou remarcar sozinha pelo site (hoje só a dona, pelo painel).
- Percentual configurável por clínica ou por serviço (os 15% ficam numa constante).
- Cartão, boleto ou parcelamento do sinal.
- Lançar a tarifa do Asaas como despesa (o sinal entra pelo valor cheio).
- Comissão da Zemana por sinal (split do Asaas).
- Sinal em agendamento criado pela dona no painel, e em marcação com vários procedimentos.
