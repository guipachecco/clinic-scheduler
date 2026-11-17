# Sinal Pix com a conta Asaas da própria dona

Data: 2026-11-17. Muda a ativação do [sinal Pix por subconta](2026-11-16-sinal-pix-asaas-design.md);
o resto daquele desenho (marcação, QR, aviso de pagamento, reembolso de 24h,
venda no financeiro) continua valendo.

Legenda: **(decidido)** foi escolha do Guilherme na conversa; **(proposta)** é
escolha minha que ele aprovou no esboço da tela; **(construtor)** fica a cargo
de quem implementar.

---

## Por quê

A subconta exige que a conta principal da Zemana seja de CNPJ. O Guilherme
não tem CNPJ, e usar o CNPJ do pai põe a responsabilidade pelas subcontas no
pai. Ele quer o sinal **automático** mesmo assim, e vai testar em produção com
a Greice (clínica grais).

A troca custa pouco para a dona: mesmo com subconta, em produção ela já teria
que entrar no Asaas para criar senha e mandar documentos (exigência do Banco
Central). A diferença agora é um passo a mais: copiar uma chave e colar na
Zemana.

## O que é

Cada dona abre a **própria conta Asaas** (CPF ou CNPJ dela), gera uma chave de
API e cola em **Financeiro → Sinal por Pix**. A partir daí tudo funciona como no
desenho anterior, só que as cobranças saem da conta dela. **(decidido)**

- Vale para **todas as clínicas** assim que for para produção, sem liberar
  clínica a clínica. **(decidido)**
- A criação de subconta **sai do código** (fica no histórico do git para
  quando houver CNPJ). Um único caminho de ativação. **(decidido, opção A)**
- A Zemana deixa de precisar de chave principal: `ASAAS_API_KEY` sai. O
  recurso liga com `ASAAS_WEBHOOK_TOKEN` definido. `ASAAS_BASE_URL` continua.
  **(proposta)**

## Não é

- Não guarda nem pede CPF, endereço ou renda da dona: o cadastro é no Asaas.
- Não cobra taxa da Zemana (continua 100% para a dona).
- Não mexe no Mercado Pago.
- Não cria conta no Asaas pela dona nem automatiza o envio dos documentos.

## Anti-objetivos

- O dinheiro do sinal cair em qualquer conta que não seja a da dona.
- A chave da dona aparecer em log, tela, e-mail ou erro.
- Marcação online quebrar porque a conta da dona tem problema: sem conta
  funcionando, a marcação segue **sem sinal**, como hoje.

## A tela (Financeiro → Sinal por Pix)

Esboço aprovado com três estados mais o aviso de erro. **(proposta)**

1. **Antes de conectar.** Texto curto do que é o sinal, o passo a passo
   (criar conta no Asaas com link, enviar documentos, Integrações → Chaves de
   API → Gerar chave, colar aqui), campo de senha "Chave de API do Asaas" e o
   botão "Conectar conta".
2. **Conectada, quase pronta.** "Conta conectada: {nome da conta no Asaas}".
   Mostra o que falta: conta em análise no Asaas, ou chave Pix ainda não
   ativa. Botão "Trocar chave".
3. **Sinal ativo.** "Sinal de 15% ativo nos agendamentos online", nome da
   conta, "Desligar sinal" (o toggle que já existe) e "Trocar chave".
4. **Aviso vermelho quando a chave para de funcionar:** "Sua conta do Asaas
   desconectou. O sinal foi desligado e as marcações seguem sem sinal. Gere
   uma chave nova no Asaas e cole aqui."

O texto do passo a passo deve citar os nomes de menu do Asaas como estão hoje;
o construtor confere no painel do Asaas.

## Conectar (o que acontece ao colar a chave)

Tudo **(proposta)**, aprovado no esboço:

1. **Ambiente certo.** Chave de sandbox (`$aact_hmlg_`) com `ASAAS_BASE_URL`
   de produção, ou o contrário, é recusada com mensagem clara antes de chamar
   o Asaas.
2. **Testa a chave** lendo a conta no Asaas. Chave inválida → "O Asaas não
   aceitou essa chave. Gere uma nova e cole de novo." Guarda o id e o nome da
   conta para mostrar na tela.
3. **Uma conta Asaas, uma clínica.** Se a mesma conta já está conectada em
   outra clínica, recusa (unicidade no banco).
4. **Aviso de pagamento.** Registra na conta dela um webhook "Zemana" para
   `BETTER_AUTH_URL + /api/webhooks/asaas`, com o `ASAAS_WEBHOOK_TOKEN` e os
   mesmos eventos de hoje. Se já houver um webhook com essa URL (reconexão),
   atualiza em vez de criar outro. Os outros webhooks dela não são tocados.
5. **Guarda a chave criptografada**, como as subcontas faziam
   (`asaas_accounts.api_key_enc`). A chave nunca volta para a tela.
6. **Conta em análise no Asaas:** aceita e espera, como hoje ("em análise,
   abra de novo depois").
7. **Chave Pix:** se a conta tem chave Pix ativa (de qualquer tipo), usa essa.
   Se não tem nenhuma a caminho, cria uma aleatória. Igual ao `refreshAccount`
   atual.
8. Registra em `audit_logs` (`asaas.connected`, sem a chave).

**Trocar chave** repete os passos 1 a 5 na mesma linha. Só aceita a **mesma
conta Asaas** (mesmo id): conta diferente com sinal pendente deixaria cobranças
órfãs. Para trocar de conta, fica para depois. **(proposta)**

## Quando a chave para de funcionar

Qualquer resposta 401 do Asaas com a chave da clínica (ao criar cobrança, ao
abrir a tela, ao reembolsar) marca a conta como desconectada: o sinal desliga,
a marcação online segue sem sinal e o painel mostra o aviso vermelho, inclusive
no alerta que já aparece na agenda. **(proposta)**

Sinais já pendentes nesse momento continuam como no desenho anterior: vencem
em 30 minutos e soltam o horário. **(construtor confere que nada trava)**

## Banco

Migração nova **(construtor decide os detalhes)**:

- `asaas_accounts.account_id` único.
- Nome da conta para exibir (coluna nova ou lido do Asaas ao abrir a tela).
- `wallet_id` deixa de ser obrigatório se o Asaas não devolver na leitura da
  conta.
- Um jeito de marcar "desconectada" (status novo ou `last_error` conhecido).

Como antes: só acrescenta, para rodar o `db:migrate` de produção **antes** do
merge.

## Riscos a confirmar no teste com a Greice

- **Reembolso pode pedir aprovação da dona.** O Asaas trata estorno de Pix como
  saque, e saques numa conta comum pedem token por SMS ou app. No sandbox o
  reembolso passou direto. Se em produção ficar pendente, o reembolso
  automático de 24h depende dela aprovar no app do Asaas. O construtor garante
  que a Zemana só marca o sinal como devolvido quando o Asaas confirmar
  (`PAYMENT_REFUNDED`), e mostra "reembolso aguardando sua aprovação no Asaas"
  se a resposta vier pendente.
- **Webhook pausado.** Se o Asaas pausar a fila do webhook dela (falhas
  seguidas), os pagamentos não confirmam sozinhos. O e-mail de aviso do Asaas
  vai para o e-mail da conta dela. A reconexão (Trocar chave) reativa o
  webhook.
- **Tarifa do Pix** sai da conta dela.

## Entrega

- No mesmo PR do sinal Pix (#56). A trava "merge só depois do CNPJ" deixa de
  existir: o merge acontece quando o Guilherme quiser testar com a Greice,
  depois do `db:migrate` de produção (0036 a 0038 e a nova).
- `docs/asaas.md` e `.env.example` atualizados: sem `ASAAS_API_KEY`, novo
  passo a passo de produção (gerar `ASAAS_WEBHOOK_TOKEN`, migrar, mesclar,
  dona conecta a conta).
- Testes: os de integração de ativação trocam subconta por "colar chave"
  (chave inválida, ambiente errado, conta já usada em outra clínica, webhook
  existente atualizado, 401 desliga o sinal). Os de marcação, reembolso e
  webhook continuam passando sem mudança de comportamento.

## Fica a cargo do construtor

- Os endpoints exatos do Asaas para ler a conta e listar/criar/atualizar
  webhooks (conferir na documentação v3).
- Nomes de colunas, status e funções.
- O texto final da tela, seguindo o esboço.
