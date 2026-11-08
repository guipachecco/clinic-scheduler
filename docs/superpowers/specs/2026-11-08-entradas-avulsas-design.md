# Entradas avulsas ("Receber" na agenda e "Nova entrada") — design

Data: 2026-11-08.

## Intenção

O financeiro foi feito para os pacotes da Grais. Nele, o dinheiro só entra por um caminho de quatro passos: orçamento, aprovação, venda e baixa da parcela. A Karol é manicure e recebe na hora, no Pix, no cartão ou em dinheiro, ao fim de cada atendimento. Ela precisa registrar isso em um passo, sem perder os pacotes, que às vezes também vende.

## Decisões do dono

- **Registro na hora, pela agenda.** O atendimento ganha o botão **Receber**.
- **Pacotes continuam.** Os orçamentos ficam para quem vende pacotes; a Karol vende às vezes.
- **Jeito 1, aprovado.** As entradas avulsas são uma lista própria, separada das vendas, e aparecem no Caixa e no Resumo.

## Como funciona

- **Receber, no atendimento (`/admin/agenda/<id>`):**
  - **Quando aparece:** em atendimentos confirmados ou concluídos que ainda não foram recebidos.
  - **O formulário:**
    - o **valor** já vem com o preço do serviço e pode ser editado; vem vazio se o serviço não tem preço;
    - a **forma de pagamento** vem da lista da clínica (Pix, cartão, dinheiro e as que ela tiver);
    - a **data** vem com hoje e pode ser mudada para um dia anterior;
    - a **observação** é opcional.
  - **Depois de receber:** o atendimento mostra "Recebido: R$ 35,00 no Pix em 08/11".
  - **Atendimento que é sessão de um pacote pago por sessão:** continua mostrando a parcela do pacote, como hoje, e não mostra Receber.
- **Nova entrada, no Financeiro:**
  - **O botão:** vira o botão principal. "Novo orçamento" continua, como segundo botão.
  - **O formulário:** descrição (ex.: "Esmalte"), valor, forma, data, cliente (opcional) e observação.
- **No Caixa:**
  - cada entrada aparece com a descrição e o nome da cliente, como "Manicure Tradicional · Ana Souza";
  - pode ser **estornada**, com um motivo: fica riscada e deixa de contar, como os pagamentos de hoje.
- **No Resumo:** as entradas somam em "Entrou hoje", "Entrou no mês" e no total por forma de pagamento.

## Decisões minhas (o dono pode mudar)

- **Tabela nova `receipts`:**
  - **Colunas:**
    - clínica;
    - atendimento (opcional, e **um atendimento só pode ter uma entrada que vale**);
    - cliente (opcional);
    - descrição (1 a 80 caracteres; no Receber, é o nome do serviço);
    - valor (maior que zero);
    - forma de pagamento;
    - data em que o dinheiro entrou;
    - observação (até 200 caracteres);
    - quem lançou e quando;
    - estorno (quando, quem e motivo).
  - **Atendimento recebido de novo:** um estorno libera o atendimento para receber de novo.
  - **Segurança:** a tabela é vista e editada só pelo painel da própria clínica (RLS, como `payments`). Nunca é apagada, só estornada.
- **Registro de auditoria:** cada entrada e cada estorno ficam no registro, só com ids e valores, sem dados pessoais.
- **Cliente:** a entrada guarda a ficha (`patient_id`) e o Caixa mostra o nome atual da ficha. Uma ficha anonimizada aparece como "Cliente".
- **"A receber":** não muda. Entrada avulsa é dinheiro já recebido.

## Abordagens consideradas

1. **Lista própria de entradas (escolhida).** É simples, e o Caixa fica claro.
2. **Orçamento invisível por trás.** Não precisaria de tabela nova, mas encheria a lista de vendas e deixaria o Caixa confuso ("Parcela 1 · orçamento 57").

## Não-objetivos

- **Maquininha ou Pix integrado:** o registro é manual.
- **Taxa do cartão e troco.**
- **Tela de foto da dona no painel:** tratada à parte.
- **Esconder as abas de pacotes:** a Karol usa às vezes.

## O que fica para o construtor

O texto exato, onde exatamente o botão fica na tela do atendimento (no celular e no computador) e a divisão em componentes.
