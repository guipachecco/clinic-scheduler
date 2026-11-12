# Preços e "por dentro" na página da Zemana

Desenho aprovado por Guilherme em 12/11/2026.

## Por que

Nenhuma cliente paga ainda. Há 2 profissionais que só agendam e 1 clínica interessadas, que Guilherme vai abordar pelo WhatsApp. Quem chega à página sem indicação hoje só vê "Quero um orçamento" e não sabe quanto custa nem como o sistema é por dentro. A página precisa mostrar o preço e as telas do sistema, no estilo da Zemana, sem mudar o jeito de vender: a conversa continua no WhatsApp e a conta continua sendo criada pelo root.

## Objetivos

- Mostrar os dois planos com preço, sem a pessoa precisar clicar em nada para ver.
- Mostrar o sistema por dentro com fotos reais das telas.
- Cada plano leva ao WhatsApp já dizendo qual plano a pessoa quer.

## Fora do escopo

- Cadastro e pagamento sozinhos, cobrança automática e teste grátis controlado pelo sistema. A cobrança é por Pix, feita à mão por Guilherme. O Mercado Pago está travado (chamado WCS-58328).
- Página `/precos` separada e perguntas frequentes.
- Mudar o que cada plano liga. Os planos são combinações dos módulos que o root já liga e desliga por clínica.

## O que faria isso dar errado

- Um plano com nome ou texto de profissão (manicure, clínica, estética). Massoterapeutas, acupunturistas e outras profissionais precisam se reconhecer. Os planos se diferenciam pelo jeito de trabalhar, não pela profissão.
- Fugir da arte da Zemana: a seção precisa parecer parte da página que já existe.
- Fotos com dados reais de clientes.
- A página anunciando preço de lançamento depois que ele acabou.

## Os planos

| Plano        | Para quem (adesivo no cartão) | O que inclui                                                                                       | Até 31/12/2026 | A partir de 01/01/2027 |
| ------------ | ----------------------------- | -------------------------------------------------------------------------------------------------- | -------------- | ---------------------- |
| **Agenda**   | "Atende por horário"          | Agenda e fichas das clientes, link de agendamento, página com avaliações e fidelidade              | R$ 29,90/mês   | R$ 49,90/mês           |
| **Completo** | "Vende pacote ou parcela"     | Tudo do Agenda, mais orçamento, pacotes e parcelas, caixa e valores a receber, anamnese e produtos | R$ 99,00/mês   | R$ 149,90/mês          |

- Os dois planos têm **1 mês de teste grátis**.
- **Quem entrar até 31/12/2026 mantém o preço de lançamento para sempre.** O adesivo diz isso ("Garanta esse preço").
- Texto geral da seção: "Pra beleza, estética e saúde. Sem fidelidade, cancele quando quiser."

## Caminhos considerados

1. **Seção de preços na própria página**, entre "Recursos" e a chamada final, com botão que abre o WhatsApp com o plano. **Escolhido**: todo mundo que rola a página vê o preço, e nada muda no jeito de vender.
2. Página `/precos` separada, com link no topo. Quem lê a página principal não vê o preço, e é mais uma página para manter. Fica para quando houver perguntas frequentes.
3. Cadastro e teste grátis automáticos com cobrança no sistema. É trabalho demais para 3 clientes, e depende de cobrança automática, que não temos.

Dentro do caminho 1, foram desenhados três layouts (as maquetes estão em `.superpowers/brainstorm/`, fora do git): um bloco com abas "Por dentro · Preços · Dúvidas", abas por jeito de trabalhar ("Só agendo · Também vendo pacotes") e **galeria "por dentro" seguida dos preços sempre à vista**. **Escolhido o último**, porque o preço aparece sem a pessoa precisar clicar.

## Como fica

Duas seções novas em `src/app/page.tsx`, entre `<Features />` e `<FinalCta />`, no mesmo estilo das outras (`Sticker`, `TornEdge`, `displayClass`, borda `#2a0081` de 3px, sombra dura, cartões levemente tortos, `RiseIn`):

1. **"Olha só como fica."**: fundo rosa `#ffd3f0`, adesivo "Por dentro". Abas em forma de pílula (Agenda, Orçamento, Sua página, No celular). Cada aba mostra uma foto da tela no computador e, quando fizer sentido, no celular, inclinadas, com um adesivo de legenda curto. A aba ativa fica roxa e um pouco girada, como na maquete.
2. **"Sem letra miúda."**: fundo azul `#b7e7fc` com borda rasgada, adesivo "Preços". Os dois cartões lado a lado (um embaixo do outro no celular): Agenda em amarelo e Completo em roxo, com o adesivo de "para quem", o preço atual grande, o preço de 2027 riscado, a lista do que inclui e o botão "Quero o Agenda" ou "Quero o Completo". Abaixo, adesivos "1º mês grátis" e "Preço de lançamento até 31/12: garanta esse preço".

Detalhes:

- **Botão do plano** abre o WhatsApp do `quote-link.ts` com a mensagem do plano, por exemplo "Oi! Quero o plano Completo da Zemana." O "Quero um orçamento" das outras seções continua igual.
- **Fotos**: capturas reais do painel e da página da clínica, tiradas do sistema rodando localmente com dados de exemplo inventados (nomes e telefones fictícios), salvas como imagens otimizadas em `public/` e mostradas com `next/image` e texto alternativo. _(Decisão minha.)_
- **Virada de 1º de janeiro de 2027**: a partir dessa data, a seção mostra só o preço de 2027, sem riscado e sem o adesivo de lançamento, sem ninguém precisar mexer. A data fica numa constante só, ao lado dos preços. _(Decisão minha.)_ Como a página hoje é estática, a virada precisa funcionar sem um deploy novo.
- As abas funcionam no teclado e com leitor de tela, e a seção funciona em 375px de largura sem rolagem lateral.
- Os textos da página que dizem que não há preços (o comentário em `features.tsx` e a descrição da página, "Peça seu orçamento pelo WhatsApp") são revistos. Os Termos dizem que os valores do plano são combinados diretamente com Guilherme. Isso continua verdade para a cobrança, mas o texto passa a citar os preços publicados.

## Fica com quem constrói

- O jeito de fazer a virada de data com a página estática (revalidação periódica, ou decidir no navegador), desde que funcione sem deploy.
- Quais telas exatas viram foto em cada aba e o texto de cada legenda.
- Os testes: unidade para a escolha de preço pela data, e2e para ver a seção, as abas e o link do WhatsApp com o plano.
