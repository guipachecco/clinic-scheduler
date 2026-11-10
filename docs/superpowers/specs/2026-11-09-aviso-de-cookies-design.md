# Aviso de cookies com o Zema — design

## Intenção

Avisar as visitantes da Zemana sobre os cookies e linkar Privacidade e Termos
de um jeito que tenha a cara da marca, e não um banner genérico. Enquanto a
pessoa não clica, o Zema (mascote) foge de um biscoito gigante, como o Indiana
Jones fugindo da pedra. Clicou, some e não volta.

## O que o site usa de cookies

Só cookies necessários: a sessão do login (better-auth) e o tema claro/escuro.
A contagem de visitas (Vercel Analytics) não usa cookies. Por isso o aviso é
informativo: um botão só, "Entendi", sem "recusar".

## Arte (aprovada: proposta A)

- Faixa amarela `#f5c700` presa embaixo, de ponta a ponta, com a borda rasgada
  da landing (`TornEdge`). Texto em roxo `#2a0081`: título "Só cookies do bem"
  (`displayClass`), frase "Usamos apenas o necessário: manter você conectada e
  lembrar o tema claro ou escuro. Nada de rastrear.", links Privacidade · Termos
  e o botão "Entendi" (rosa `#ffd3f0`, borda e sombra roxas, como o
  `QuoteButton`). No celular o botão ocupa a largura toda, abaixo do texto.
- O Zema em SVG, redesenhado da imagem enviada pelo usuário: corpo roxo
  arredondado, Z amarelo na barriga, olhos olhando para trás (assustado),
  sobrancelhas amarelas, bochechas rosa, boca aberta, gota de suor, luvas
  brancas, tênis amarelos com sola branca.
- O biscoito: círculo dourado com contorno roxo e gotas de chocolate, maior que
  o Zema.

## Animação

- Corrida (CSS keyframes, só com `prefers-reduced-motion: no-preference`):
  pernas e braços balançando, corpo quicando, suor, poeira; o biscoito gira. A
  dupla atravessa a tela correndo _em cima_ da borda rasgada, da esquerda para
  a direita, e recomeça pela esquerda (≈6,5 s no computador, ≈3,6 s no
  celular). O Zema às vezes perde terreno e recupera (distância oscilando).
- Saída (motion/react, ao clicar): o Zema pula para a direita e sai, o biscoito
  passa reto, e a faixa desce para fora da tela. Depois o aviso sai do DOM.
- Movimento reduzido: o Zema e o biscoito aparecem parados sobre a faixa, e o
  clique só esconde o aviso, sem animação.
- A pista dos personagens fica acima da faixa, por cima da página, com
  `pointer-events: none`: não bloqueia cliques no que estiver embaixo.

## Onde aparece

Só nas páginas da Zemana: a landing (`src/app/page.tsx`) e as páginas de
`src/app/(zemana)/` (logins, privacidade, termos, clínicas). Não aparece nas
páginas das clínicas (`[slug]`) nem no painel (`admin`).

## Escolha guardada

Cookie `aviso_cookies=ok` (1 ano, `path=/`, `samesite=lax`), gravado no
navegador ao clicar, como o cookie do tema. Um componente de servidor lê o
cookie e nem renderiza o aviso quando ele existe: nada pisca na tela. A página
de Privacidade passa a citar esse cookie na seção "Cookies".

## Abordagens consideradas

- Guardar a escolha: **cookie lido pelo servidor** (escolhido; sem piscar,
  mesmo padrão do tema) × localStorage (o aviso só aparece depois de carregar
  e pisca para quem já aceitou).
- Animar: **misto** (escolhido; loop em CSS, leve no celular; entrada/saída
  com motion/react como o resto da landing) × tudo em motion/react (loops
  infinitos no JavaScript gastam processamento sem ganho visível).

## Restrições

- Celular de 360 px sem rolagem horizontal; temas claro e escuro (a faixa usa
  as cores da marca, iguais nos dois).
- O aviso flutua por cima da página, e um espaço em branco da altura da faixa
  no fim da página deixa os últimos links rolarem para fora de baixo dela
  (decidido na implementação: sem isso, o fim de `/entrar` ficava coberto).
- A borda rasgada ganha um contorno roxo (uma cópia 3 px acima), para a faixa
  amarela não sumir nas seções amarelas da landing.
- Acessível: região com `role="region"` e `aria-label="Aviso de cookies"`,
  personagens `aria-hidden`, botão focável com anel de foco.
- Não mexer em `src/app/landing/scroll-story.tsx`.
- Os e2e que clicam em coisas no fim da página ganham o cookie aceito no
  contexto (ou clicam em "Entendi"), e um e2e novo cobre: aparece, some ao
  clicar, não volta ao recarregar.

## Fica para quem implementa

Tamanhos exatos, duração fina das animações e o desenho final do SVG, desde
que fiéis ao mockup aprovado (`.superpowers/brainstorm/.../aviso-cookies-v2.html`).
