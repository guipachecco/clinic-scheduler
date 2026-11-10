# Mercado Pago

Construído em 10/11/2026. A paciente paga a clínica por um link do Mercado Pago (Pix ou cartão), e o dinheiro cai direto na conta Mercado Pago **da clínica**. A Zemana não recebe nem repassa dinheiro. Quando o pagamento é aprovado, a parcela fica paga sozinha no [financeiro](financeiro.md).

## O fluxo

1. **Conectar** (`/admin/financeiro/mercado-pago`): a dona clica em "Conectar Mercado Pago", entra na conta dela no site do Mercado Pago e autoriza a Zemana (OAuth). Os tokens voltam para o servidor e são guardados criptografados. A clínica ganha a forma de pagamento "Mercado Pago".
2. **Cobrar**: na venda, cada parcela em aberto tem "Cobrar pelo Mercado Pago". O botão cria um link (uma _order_ do Checkout Pro) para o que falta da parcela, válido por 7 dias. Um link aberto com o mesmo valor é reaproveitado.
3. **Enviar**: "Enviar pelo WhatsApp" abre a conversa com a mensagem pronta, e "Copiar link" copia o link.
4. **Pagar**: a paciente paga no site do Mercado Pago.
5. **Dar baixa sozinho**: o Mercado Pago avisa o webhook (`/api/webhooks/mercado-pago`). O sistema confere a assinatura, busca a order no Mercado Pago com o token da clínica e, se estiver paga (`processed`), registra o pagamento na parcela com a data do dia e a forma "Mercado Pago".
6. **Estornar**: "Estornar" num pagamento que veio do link devolve o dinheiro pelo Mercado Pago primeiro e só depois estorna aqui. Se a devolução for feita pelo app do Mercado Pago, o aviso estorna o pagamento aqui sozinho.

## Regras que o sistema garante

- **O aviso não é confiável, a order é.** O webhook só lê o id da order. O status e o valor vêm sempre de uma consulta ao Mercado Pago com o token da clínica, e a order precisa ter como referência externa o id da cobrança.
- **Uma baixa por cobrança.** O Mercado Pago repete avisos. A cobrança fica travada durante o processamento e guarda o pagamento que gerou, então o segundo aviso não muda nada.
- **Nunca paga a mais.** Se a parcela foi paga à mão ou cancelada enquanto o link estava aberto, o pagamento do link não é registrado: a cobrança fica em "conflito", e a venda mostra um aviso para a dona devolver o valor pelo Mercado Pago.
- **Clínicas separadas.** As duas tabelas novas têm `clinic_id` e RLS como as outras. O webhook chega sem sessão: ele descobre a clínica da order pela função `mercado_pago_order_clinic` (SECURITY DEFINER, só responde isso) e depois trabalha dentro da clínica como `app_panel`.
- **Tokens criptografados** com AES-256-GCM. A chave é derivada do `BETTER_AUTH_SECRET`, então trocar esse segredo exige que as clínicas conectem o Mercado Pago de novo.
- **Renovação do token.** O token vale 180 dias. Ao ser usado, se faltar menos de 30 dias, ele é renovado, e o novo refresh token é guardado. Uma clínica que passe 6 meses sem usar precisa conectar de novo.

## Configuração

Na aplicação da Zemana em [mercadopago.com.br/developers/panel/app](https://www.mercadopago.com.br/developers/panel/app):

1. **Credenciais de produção:** copie o "Número da aplicação" para `MP_CLIENT_ID` e o Client Secret para `MP_CLIENT_SECRET`.
2. **URLs de redirecionamento** (Detalhes da aplicação > Editar): `https://<domínio>/api/mercado-pago/retorno`. Precisa ser igual, letra por letra, ao `BETTER_AUTH_URL` + esse caminho.
3. **Webhooks > Configurar notificações:** URL `https://<domínio>/api/webhooks/mercado-pago`, tópico **Order (Mercado Pago)**. Copie a chave secreta para `MP_WEBHOOK_SECRET`.

Root vê as duas URLs certas na página Mercado Pago do painel.

Sem `MP_CLIENT_ID`, o painel não oferece a conexão. Sem `MP_WEBHOOK_SECRET`, o webhook recusa todo aviso (503), e as parcelas não dão baixa sozinhas.

**Testar no computador:** o Mercado Pago só chama endereços públicos com HTTPS. Para testar a conexão e os avisos localmente, rode um túnel (ngrok ou cloudflared), use o endereço dele em `BETTER_AUTH_URL` e cadastre as duas URLs com ele. Para entrar como clínica de teste, use a conta de teste da aplicação (Credenciais de teste > Conta de teste).

## Onde o código está

| Parte                                                    | Arquivo                                                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Tabelas                                                  | `src/db/schema/mercado-pago.ts`, migração `drizzle/0023_mercado_pago.sql`                 |
| Chamadas ao Mercado Pago                                 | `src/modules/mercado-pago/api.ts`                                                         |
| Conta conectada e renovação do token                     | `src/modules/mercado-pago/accounts.ts`                                                    |
| Links, avisos e estorno                                  | `src/modules/mercado-pago/charges.ts`                                                     |
| Regras puras (valores, status, assinatura, criptografia) | `src/modules/mercado-pago/orders.ts`, `signature.ts`, `crypto.ts`                         |
| Rotas                                                    | `src/app/api/mercado-pago/conectar`, `retorno`, `src/app/api/webhooks/mercado-pago`       |
| Telas                                                    | `src/app/admin/(painel)/financeiro/mercado-pago/`, `vendas/[id]/charge-link.tsx`          |
| Testes                                                   | `src/modules/mercado-pago/mercado-pago.test.ts`, `tests/integration/mercado-pago.test.ts` |

## A conferir no ambiente de teste do Mercado Pago

A documentação pública não mostrava tudo. Estes pontos seguem o que é mais provável e precisam ser confirmados com um pagamento de teste antes de ir para produção:

- O texto assinado do webhook (`id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, HMAC-SHA256, id em minúsculas) e o formato do aviso do tópico Order.
- Os nomes dos campos da resposta do OAuth (`user_id`, `public_key`, `live_mode`, `expires_in`).
- `processing_mode: "manual"` na criação da order, como no exemplo da documentação.

## O que ainda não existe

- Comissão da Zemana por venda (`marketplace_fee`).
- Link para entradas avulsas (receitas fora de uma venda) e sinal no agendamento online.
- Devolução parcial.
- Lançar a taxa do Mercado Pago como despesa.
