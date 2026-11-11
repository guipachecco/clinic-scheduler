# Módulos por clínica, Produtos e baixa de estoque

Data: 2026-11-11. Base: `main` em `a4a3ecb` (PR #33 já mesclado; a migração nova é a `0027`).

## Por quê

Cada dona usa o Zemana de um jeito. A Karol (manicure) tem produtos cadastrados, mas não usa; a Greice usa e precisa controlar o estoque do que aplica, como o Mounjaro. A decisão de produto continua a mesma: **um sistema só**. O que um cliente pede vira uma opção que o root liga ou desliga por clínica, nunca uma cópia.

Quem escolhe o que cada clínica tem é o **Guilherme, como root**. A baixa de estoque também é sempre escolhida por uma pessoa, nunca automática ("deixe para mim selecionar").

## Metas

1. O root marca, ao criar a clínica e depois, quais módulos ela tem. Um módulo desligado some do painel e da página pública.
2. A tela do root também muda o tipo de negócio (a Karol vira "Manicure").
3. Produtos ganham uma área igual à de Serviços: lista por categoria, novo, editar e categorias próprias.
4. Produtos entram no orçamento e, portanto, na venda.
5. Estoque com quantidade, entradas e baixas, e histórico por produto.
6. Baixa manual no atendimento, onde o produto foi aplicado, e "Dar baixa em tudo" na venda, para o que falta.

## Fora do escopo

- Cobrar o produto pelo atendimento. A baixa no atendimento só mexe no estoque; quem quer cobrar lança no Financeiro, como hoje.
- Baixa automática de qualquer tipo.
- Custo do produto, fornecedor, lote, validade e alerta de estoque mínimo.
- Mostrar o estoque na página pública.
- Migração que muda a Karol: o root faz isso pela tela nova.

## Deve evitar (anti-metas)

- Estoque abaixo de zero, em qualquer caminho.
- Desconto em dobro: a mesma unidade baixada no atendimento e de novo na venda.
- Perder dados ao desligar um módulo. Desligar só esconde; religar traz tudo de volta.
- Clínicas existentes perdendo algo no dia do deploy: todas começam com todos os módulos ligados.

## Abordagens consideradas (escolhidas pelo Guilherme)

| Tema | Escolhida | Descartadas |
|---|---|---|
| Onde guardar os módulos | **Uma coluna `clinics.modules text[]`** com check dos nomes válidos, como em `amenities` | Uma coluna booleana por módulo (cresce a cada módulo); tabela `clinic_modules` (mais RLS, sem ganho) |
| Estoque | **`products.stock_quantity` + tabela de movimentos**, gravados na mesma transação; `check (stock_quantity >= 0)` trava o negativo, mesmo com duas baixas ao mesmo tempo | Só o histórico, somado na leitura (mais lento, trava contra negativo mais difícil) |
| Produto no orçamento e na venda | **A mesma lista de itens aceita serviço ou produto** (exatamente um), mantendo a ordem e os totais | Listas separadas (telas e contas duplicadas) |

## Entrega em três PRs, nesta ordem

Cada PR depende do anterior.

### PR 1 — Módulos por clínica e tipo de negócio na tela do root

**Módulos** (nomes no banco → rótulo na tela):

| Chave | Rótulo | O que some quando desligado |
|---|---|---|
| `products` | Produtos | Menu Produtos, aba Produtos da página pública, produto no orçamento, "Produtos usados" no atendimento, bloco de produtos na venda |
| `finance` | Financeiro | Menu Financeiro (caixa, entradas, despesas, a receber, orçamentos, vendas, Mercado Pago), o bloco de pagamento no detalhe do atendimento e o resumo financeiro na ficha da pessoa |
| `online_booking` | Agendamento online | Marcação pela página (`/[slug]/marcar`) e a chave correspondente em "Minha página" |
| `loyalty` | Fidelidade | Cartão na página e na área da cliente, resgates no painel e a configuração em "Minha página" |
| `anamnesis` | Anamnese | Aba de anamnese da ficha |
| `reviews` | Avaliações | Pedir e escrever avaliação (`/[slug]/avaliar`), avaliações na página e a tela "Avaliações" do painel |

Sempre ligadas, fora da lista: Agenda, Clientes/Pacientes, Serviços, Expediente e Minha página.

**Regras**

- Quando o root desliga um módulo, isso vale por cima da chave da dona. Quando ele liga, a chave dela continua valendo como hoje. Assim, o agendamento online só abre com o módulo ligado **e** `online_booking_enabled`; a fidelidade, com o módulo e `loyalty_enabled`; a anamnese, com o módulo e `anamnesis_template` preenchido.
- Desligar não apaga nada.
- Uma rota de módulo desligado responde `notFound()`, e a Server Action correspondente recusa ("Este recurso não está ativo para a clínica."). Esconder o menu não basta.
- Os produtos dependem só de `products`. O produto no orçamento e o bloco de produtos na venda pedem `products` **e** `finance`.

**Banco (migração 0027)**

- `clinics.modules text[] not null default '{products,finance,online_booking,loyalty,anamnesis,reviews}'`, com `check (modules <@ array[...])`. As clínicas existentes recebem o default, ou seja, tudo ligado.
- Só `app_platform` (root) escreve nessa coluna: ela fica fora do `GRANT UPDATE (...)` de `app_panel`. `app_panel` e `app_client` podem ler (o `SELECT` por coluna de `app_client` ganha `modules`).
- O root muda `business_type` pelo `app_platform`. A dona continua mudando pelo passo a passo de "Minha página", porque o grant de `app_panel` já existe.

**Código**

- `src/modules/clinics/modules.ts`: `CLINIC_MODULES`, os rótulos, `hasModule(clinic, key)` e o schema zod. `ClinicSummary` ganha `modules`.
- Um único lugar decide se o módulo está ativo, e o resto do código chama esse lugar: o menu (`(painel)/layout.tsx`), as páginas, as actions, a página pública e a área da cliente.
- Tela do root:
  - Em `/admin/clinicas`, o formulário de criação ganha os checkboxes, todos marcados por padrão, e o tipo de negócio.
  - Cada clínica ganha um botão "Editar", que leva a `/admin/clinicas/[id]` com nome, tipo de negócio e checkboxes. O endereço da página fica de fora (mudar o slug quebra links já divulgados).
  - Cada mudança vai para `audit_logs`, como `setClinicActive`.

### PR 2 — Produtos como Serviços, e no orçamento

**Telas**

- Novo item de menu **Produtos** (`/admin/produtos`), depois de Serviços, só com o módulo ligado. `/admin/pagina/produtos` redireciona para lá.
- `/admin/produtos`: cartões agrupados por categoria, como `servicos/page.tsx`, com o botão "Novo produto" e o formulário de categoria.
- `/admin/produtos/novo` e `/admin/produtos/[id]`: nome, categoria, descrição, preço, "Mostrar na página" e "Ativo". O estoque aparece no PR 3.
- O botão de produtos de exemplo continua existindo na lista vazia.

**Banco (migração 0028)**

- `product_categories`, igual a `service_categories` (nome, slug, ordem, ativa), com `unique (clinic_id, id)` e RLS `FOR ALL` de `app_panel` por `app.clinic_id`. Cada clínica ganha a categoria "Outros" (`createClinic` e a migração para as existentes).
- `products` ganha:
  - `category_id`, obrigatório, com FK composta (clinic_id, category_id). Os produtos existentes vão para "Outros".
  - `show_on_page boolean`. Os existentes recebem o valor atual de `is_active`, e `is_active` passa a `true`.
  - `unique (clinic_id, id)`, para as FKs compostas.
- O que cada coluna significa: "Ativo" quer dizer que o produto pode ser usado (orçamento e baixa); "Mostrar na página" quer dizer que aparece na página pública. A política `products_client` passa a filtrar `is_active and show_on_page`.
- Um produto com histórico (orçamento ou movimento de estoque) é desativado, nunca apagado, como os serviços.
- `quote_items` e `sale_items`:
  - `service_id` passa a aceitar nulo, e entra `product_id` com FK composta para `products`, mais `check (num_nonnulls(service_id, product_id) = 1)`.
  - Para produto, `sessions` guarda a quantidade e `service_name` guarda o nome do produto na hora. Renomear as colunas fica a critério de quem implementar; manter os nomes evita mexer em todo o Financeiro.

**Orçamento**

- Em `quote-form.tsx`, ao adicionar um item, ela escolhe Serviço ou Produto. Para produto, o campo diz "Quantidade" em vez de "Sessões".
- Só aparecem produtos ativos.
- Preço, desconto e totais funcionam como hoje.

**Venda**

- O item de produto não cria sessões nem entra na contagem de sessões (`session-links.ts`, `insertSessionAppointments`).
- No plano "por sessão", cada item de produto gera **uma** parcela própria, com vencimento na data da venda. _(Decisão minha.)_
- Nos planos "à vista" e "parcelado", o produto entra no total como os serviços.

### PR 3 — Estoque e baixas

**Banco (migração 0029)**

- `products.stock_quantity integer not null default 0 check (stock_quantity >= 0)`. `app_client` **não** lê essa coluna, nem os movimentos.
- `stock_movements`:
  - `id`, `clinic_id`, `product_id`, `kind` (`entry` | `usage` | `handover` | `reversal`), `quantity` (positiva na entrada, negativa na saída e no estorno de uma entrada), `appointment_id` (nulo), `sale_item_id` (nulo), `reverses_id` (nulo, `unique`), `note`, `created_by_user_id`, `created_at`.
  - FKs compostas por `clinic_id`.
  - RLS de `app_panel` por `app.clinic_id`, com grant de `SELECT` e `INSERT` apenas: o histórico nunca é editado nem apagado.
- Toda mudança de estoque é um `UPDATE products SET stock_quantity = stock_quantity + $q` feito na mesma transação do `INSERT` do movimento. Quando o check falha, a mensagem é "Estoque insuficiente: há N. Lance uma entrada primeiro."

**Telas**

- Na página do produto: quantidade atual, "Lançar entrada" (quantidade e observação) e o histórico, com data, quem fez e a origem. A origem é "Entrada", "Atendimento de André em 12/11" (com link), "Venda nº 12" ou "Baixa desfeita". A lista de produtos mostra a quantidade em cada cartão.
- No detalhe do atendimento (`agenda/[id]`), novo bloco **"Produtos usados"**:
  - Ela escolhe o produto (só os ativos) e a quantidade, e confirma.
  - Se a pessoa atendida tem uma venda não cancelada com esse produto e ainda falta baixa nela, aparece um seletor "Conta na venda nº 12 (faltam 3)" ou "Sem venda". A opção da venda mais antiga vem marcada, e ela pode trocar.
  - A lista mostra o que já teve baixa naquele atendimento, com o botão "Desfazer", que cria um movimento `reversal` e devolve ao estoque.
  - O bloco aparece nos atendimentos `confirmed` e `completed`, só com o módulo ligado. _(Decisão minha.)_
- Na venda (`vendas/[id]`), bloco **"Produtos da venda"**:
  - Por item: "1 de 4 com baixa". A conta é a soma dos movimentos `usage` e `handover` daquele `sale_item_id`, menos os estornos.
  - O botão **"Dar baixa em tudo"** cria um movimento `handover` por item, com o que falta. Se algum produto não tiver estoque, nada é baixado e a tela diz qual produto faltou.
  - O mesmo bloco aparece logo depois de ela registrar um pagamento da venda.
  - Uma venda cancelada não oferece o botão. As baixas já feitas continuam, porque o produto foi consumido.
- A baixa ligada a uma venda nunca passa do que foi vendido: no máximo, o que falta naquele item. Isso é checado na transação, com o item travado (`for update`).

## Testes (no padrão do projeto)

- **Unidade** (`vitest --project unit`): o schema e o `hasModule` dos módulos, os schemas dos formulários de produto e categoria, o item de orçamento de serviço ou produto, as contas de "faltam N" e a parcela do produto no plano "por sessão".
- **Integração** (`tests/integration`, banco real):
  - `app_panel` não consegue mudar `clinics.modules`.
  - `app_client` não lê `stock_quantity` nem `stock_movements`, e não vê produto com `show_on_page = false`.
  - Uma clínica não enxerga categorias, produtos nem movimentos de outra.
  - `stock_movements` não aceita `UPDATE` nem `DELETE`.
  - Duas baixas ao mesmo tempo não deixam o estoque negativo.
  - A soma dos movimentos é igual a `stock_quantity` depois de entradas, baixas e desfazer.
  - Baixa ligada à venda não passa do vendido.
  - "Dar baixa em tudo" é tudo ou nada.
  - O check de exatamente um entre serviço e produto em `quote_items` e `sale_items`.
- **e2e** (Playwright):
  - O root cria uma clínica sem Produtos e sem Financeiro: os menus e a aba da página somem, e a URL direta dá 404. Depois ele liga de novo, os menus voltam e o tipo muda para Manicure ("Clientes").
  - Cadastro de categoria e produto, edição, e produto escondido fora da página pública.
  - Orçamento com serviço e produto, aprovado como venda.
  - Entrada de estoque, baixa no atendimento contando na venda, "Dar baixa em tudo", e a recusa por falta de estoque.

## Decisões minhas, para conferir

- A lista exata do que some com cada módulo (tabela do PR 1). O webhook do Mercado Pago continua funcionando com o Financeiro desligado, para não perder pagamentos em andamento.
- O endereço (slug) não muda na tela de edição do root.
- Os produtos existentes vão para "Outros", e "Escondido" vira "Mostrar na página = não".
- No plano "por sessão", o produto vira uma parcela à parte, com vencimento na data da venda.
- "Produtos usados" só aparece em atendimentos confirmados ou concluídos.
- A venda mais antiga com saldo vem marcada no seletor da baixa.
- Sem estoque mínimo e sem custo, por enquanto.

## Para quem implementar

Os nomes de componentes e funções, a forma de reaproveitar os formulários de Serviços, se as colunas `sessions`/`service_name` dos itens são renomeadas, e o texto exato das mensagens, desde que siga o tom do painel.
