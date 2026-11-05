# Financeiro

Construído em 04/11/2026 a partir do [desenho aprovado](superpowers/specs/2026-11-04-modulo-financeiro-design.md). Fica em **Financeiro** no menu do painel. Cada clínica só enxerga o próprio dinheiro (ver [várias clínicas](multiclinica.md)).

## O fluxo

1. **Orçamento** (`/admin/financeiro/orcamentos`): a dona escolhe a paciente, os serviços, as sessões e o preço, com desconto por item e no total. Também dá para começar pela ficha da paciente, em "Novo orçamento".
2. **Enviar**: o botão "Enviar pelo WhatsApp" abre a conversa com a mensagem pronta e marca o orçamento como enviado. Só o rascunho pode ser editado; para mudar um orçamento enviado, use "Duplicar".
3. **Aprovar**: a dona registra a aprovação e escolhe como a cliente vai pagar: à vista, parcelado (com sinal opcional na 1ª parcela) ou por sessão. Isso cria a venda e as parcelas.
4. **Agendar o pacote**: na venda, "Agendar sessões" propõe as datas (toda semana, a cada 2 semanas, todo mês ou uma por uma). A dona ajusta, e o sistema grava tudo ou nada, com as mesmas checagens da agenda.
5. **Atender e dar baixa**: "Receber" em cada parcela, na lista "A receber" ou, na sessão de um pacote por sessão, direto na página do atendimento ("Receber agora").
6. **Acompanhar**: o resumo mostra o que entrou hoje e no mês, o que saiu, o saldo, as parcelas atrasadas e o total a receber. O caixa lista os lançamentos do mês, e as despesas têm tela própria.

## Regras que o sistema garante

- **Dinheiro em centavos.** A soma das parcelas é sempre igual ao total, e os centavos que sobram de uma divisão vão para as primeiras partes, um em cada.
- **Pago é calculado, nunca guardado.** Uma parcela está paga quando a soma dos pagamentos não estornados alcança o valor dela. Saldo e atraso também são calculados na hora.
- **Nada é apagado.** Pagamento errado é estornado, e venda ou despesa errada é cancelada, sempre com motivo. O que foi pago continua no histórico.
- **O caixa não reescreve o passado.** O pagamento conta na data informada pela dona (pode ser retroativa, e o caixa avisa "lançado depois"). O estorno e o cancelamento de despesa contam no dia em que foram feitos.
- **Alterar uma venda** (acrescentar sessões ou serviço, retirar sessões livres, renegociar o que falta) não mexe no que já foi pago, e o total nunca fica abaixo dele. Cada alteração fica registrada na venda, com o antes e o depois.
- **Sessão do pacote e parcela andam juntas.** No pagamento por sessão, a parcela vence no dia do atendimento e acompanha a remarcação. Se a sessão é cancelada ou a cliente falta, a sessão volta para o pacote e a parcela fica sem data; se já estava paga, vira crédito e é usada na próxima sessão agendada.
- **Clínicas separadas no banco**, por chaves estrangeiras compostas `(clinic_id, id)` em todas as tabelas do financeiro.

## Onde o código está

| Parte                                                                    | Arquivo                                                                                                                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tabelas                                                                  | `src/db/schema/finance.ts`, migração `drizzle/0009_finance.sql` (também cria as formas de pagamento e as categorias de despesa padrão de cada clínica) |
| Contas puras (divisão, desconto, estado da parcela) e datas de repetição | `src/modules/finance/money.ts`, `src/modules/finance/recurrence.ts`                                                                                    |
| Orçamentos, vendas, despesas e relatórios                                | `src/modules/finance/quotes.ts`, `sales.ts`, `expenses.ts`, `reports.ts`                                                                               |
| Ligação entre sessão do pacote e parcela                                 | `src/modules/finance/session-links.ts`, chamado pela agenda a cada mudança de horário ou status                                                        |
| Telas                                                                    | `src/app/admin/(painel)/financeiro/`                                                                                                                   |
| Testes                                                                   | `src/modules/finance/money.test.ts`, `tests/integration/finance.test.ts`, `e2e/finance.spec.ts`                                                        |

## Diferenças em relação ao desenho

- **Arredondamento:** o desenho dizia que a sobra ficava toda na primeira sessão. Na construção, ela é espalhada, um centavo por parte, a partir da primeira. Assim, duas sessões nunca diferem em mais de 1 centavo.
- **A regra de repetição do pacote não é guardada** (tabela `appointment_series` do desenho). Ela só serve para propor as datas. A ligação entre venda e agendamento fica na tabela `sale_sessions`, e a tabela `appointments` não mudou.
- **Falta sempre devolve a sessão ao pacote.** A opção "contar a sessão mesmo com falta" ainda não existe.
- **Na aprovação parcelada, a tela só permite fixar o valor da 1ª parcela** (o sinal). O servidor já aceita um valor e um vencimento para cada parcela, mas a tela ainda não oferece isso.
- **O serviço flexível "Avaliação / encaixe" não entra em orçamento**, porque não tem descrição fixa para vender.

## O que ainda não existe

- Tela para editar as formas de pagamento e as categorias de despesa. Hoje cada clínica recebe as padrão (Pix, Dinheiro, Débito, Crédito; Aluguel, Produtos e materiais, Contas, Taxas de cartão, Devolução a cliente, Outros).
- PDF do orçamento e área financeira para a cliente.
- Comissões, estoque e nota fiscal, que ficaram fora do desenho.
