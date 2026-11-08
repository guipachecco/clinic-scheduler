# Página da Zemana (zemana.com.br) — design

Data: 2026-11-08.

## Intenção

`zemana.com.br` mostra hoje "Site em construção" (`src/app/page.tsx`). Ela vira o cartão de visitas da Zemana, que é uma startup jovem. A página tem dois papéis:

1. **Vender:** convencer profissionais como a Karol a contratar a Zemana, com um botão de orçamento que leva ao WhatsApp do dono.
2. **Entrada das clientes:** a cliente entra e vê **as clínicas em que já é cliente**, com um botão para ir a cada uma.

O estilo é divertido e animado. A referência é https://phin.helenadang.work/:
- tipografia gigante;
- um objeto desenhado que conta a história conforme a página rola;
- seções de cores fortes trocando com bordas rasgadas;
- etiquetas e carimbos tortos.

## Decisões do dono do projeto

**A história, conforme a pessoa rola (aprovada: "tudo correto"):**
1. **Abertura:** fundo amarelo da Zemana, letras gigantes ("SUA AGENDA, SEM BAGUNÇA." ou equivalente), o logo com um leve pulo e o botão **"Quero um orçamento"**.
2. **O caos:** uma agenda de papel desenhada. Um **lápis escreve** nomes de clientes conforme a rolagem ("Ana 14h", "Bia 14h??", rasuras, "remarcar", setas). Um post-it cai e o celular vibra com "tem horário amanhã?".
3. **O X:** com a página cheia de rabisco, o lápis risca um **X enorme** de ponta a ponta e aparece um carimbo torto **"PROBLEMA RESOLVIDO"**.
4. **A solução:** o papel sai e entra um celular com a página da clínica e a agenda da Zemana, limpas. São representações das telas que já existem.
5. **O que a Zemana faz:** 3 ou 4 cartões coloridos e levemente tortos, **só com o que o sistema já tem**:
   - agendamento online pelo link da clínica;
   - agenda e fichas das clientes;
   - financeiro;
   - página da clínica com avaliações e fidelidade.
6. **Chamada final:** "Bora organizar sua agenda?" e o botão de orçamento.
7. **Rodapé:** um link discreto **"Sou cliente, quero entrar"**, que também fica no topo como "Entrar".

**Login das clientes (aprovado: "tudo certo"):**
- **`/entrar`:** com o visual da Zemana, pede e-mail, senha e tem "Esqueci minha senha". Não tem "Criar conta", porque a conta nasce pelo link de uma clínica, onde a ficha é criada.
- **Depois do login:** a cliente vai para **"Suas clínicas"**, um cartão por clínica em que ela tem ficha, com nome, área e foto da dona (ou as iniciais). Cada cartão tem **"Agendar"** (`/<slug>/marcar`) e **"Meus horários"** (`/<slug>/meus-horarios`).
- **Quantidade de clínicas:** com uma só, a lista aparece igual. Sem nenhuma, aparece: "Você ainda não é cliente de nenhuma clínica. Peça o link para a sua profissional."
- **Dona ou root:** se entrar por esse formulário, vai direto para `/admin`.
- **Segurança:** a lista vem de uma **função nova no banco** que devolve só as clínicas daquela conta (endereço, nome de exibição, área e se tem foto). Nada de ficha, contato ou outras clientes.

**Como construir:** a biblioteca **Motion** (pacote `motion`, para React).
- **Lápis:** o traço que escreve é um SVG com o comprimento do traço ligado à rolagem.
- **Movimentos:** o X, o carimbo e o celular entram com mola.
- **Escopo:** só a página inicial carrega a biblioteca.

**Orçamento:** abre o WhatsApp `https://wa.me/5547991037244`, com a mensagem pronta "Oi! Vi o site da Zemana e quero um orçamento para minha clínica." (codificada na URL).

## Decisões minhas (o dono pode mudar)

- **Endereços novos:** `/entrar`, `/esqueci-senha`, `/nova-senha` e `/minhas-clinicas`. Eles entram nos endereços reservados (`RESERVED_SLUGS`), para nenhuma clínica poder usá-los. `entrar` já é reservado. Antes, confirme que nenhuma clínica existente usa esses nomes.
- **"Esqueci minha senha" sem clínica:** hoje o e-mail de troca de senha só é enviado quando o pedido vem do link de uma clínica (`deliverResetPasswordEmail` em `src/modules/clients/auth-emails.ts`). Passa a valer também o pedido da página da Zemana: o link do e-mail leva a `/nova-senha` e o texto usa "Zemana" no lugar do nome da clínica. O comportamento pelo link da clínica não muda.
- **Topo da página:** a marca Zemana, o link "Entrar" (ou "Suas clínicas", se a cliente já estiver logada) e o botão de tema claro/escuro já existente.
- **Movimento reduzido:** com "reduzir movimento" ligado, a página mostra cada cena já pronta e parada (agenda rabiscada, X, carimbo, celular), legível e sem animações de rolagem.
- **Celular primeiro:** a página é feita para 360 px e se expande no computador. A história não pode depender de passar o mouse por cima.
- **Desempenho:**
  - a página inicial é renderizada no servidor;
  - a animação é um componente de cliente separado;
  - a página não depende do banco, então abre mesmo com o banco "dormindo" (só "Suas clínicas" e o login usam o banco);
  - nenhuma imagem pesada: os desenhos são SVG em código.
- **Cores e fontes:** as da marca Zemana, ou seja, o roxo `#2a0081`, o amarelo `#f5c700`, o rosa `#ffd3f0` e o azul-claro `#b7e7fc`, com Bricolage Grotesque nos títulos e Figtree no texto. Funciona no tema claro e no escuro.
- **Ícones:** de linha, sem emojis.
- **Metadados:** título "Zemana — agenda online para profissionais de beleza e saúde" e uma descrição curta para o compartilhamento no WhatsApp e no Instagram (Open Graph).

## Detalhes decididos depois da revisão (decisões minhas)

- **Página estática:** `/` não consulta o banco no servidor e pode ficar em cache. O "Entrar" do topo é trocado por "Suas clínicas" do lado do navegador, depois que a página carrega, lendo a sessão pelo cliente de login (Better Auth) que já existe. Enquanto a sessão não chega, ou se falhar, aparece "Entrar".
- **Função `client_my_clinics(p_user uuid)`:**
  - **Proteção e quem chama:** é `SECURITY DEFINER`, com o mesmo padrão das outras (`search_path` fixo, `REVOKE` de PUBLIC e `EXECUTE` só para `app_client`). O servidor chama pelo `clientDb`, com o id do usuário tirado da sessão, como já faz com `client_context`, sem precisar de `app.clinic_id`.
  - **O que devolve:** só clínicas **ativas** em que existe ficha (`patients`) com `user_id = p_user` e não anonimizada, inclusive ficha provisória à espera da dona. Para cada uma: `slug`, nome de exibição (`display_name`, senão `name`), `area_label` e se tem foto da dona. A ordem é alfabética pelo nome.
  - **Clínica com agendamento online desligado:** aparece também. O botão "Agendar" leva a `/<slug>/marcar`, que nesse caso já mostra o contato da clínica.
  - **Foto:** vem de `/<slug>/foto`, que já é pública. Sem foto, aparecem as iniciais.
- **E-mail não confirmado:** a cliente entra normalmente em `/entrar` e vê "Suas clínicas". A confirmação continua sendo pedida no link da clínica na hora de marcar, como já acontece hoje.
- **Conta do painel em `/entrar`:**
  - **Login:** o formulário faz o mesmo que o login pelo link de uma clínica faz hoje com uma conta do painel. O formulário tem o link "É profissional? Entre no painel", que leva a `/admin/entrar`, onde fica o 2FA.
  - **Já logada:** uma dona ou o root que já está logado e abre `/entrar` vai para `/admin`.
  - **Troca de senha:** continua bloqueada por e-mail para contas do painel, com a mesma resposta silenciosa (não revela se a conta existe).
- **Troca de senha pela Zemana:**
  - **Como é detectada:** pelo `callbackURL` exato `/nova-senha`.
  - **O e-mail:** usa o mesmo remetente (`EMAIL_FROM`), o assunto "Troque sua senha da Zemana", e o texto e o link (`/nova-senha?token=…`) sem nome de clínica.
  - **Pelo link da clínica:** não muda.
- **Endereços reservados:** conferi o banco de produção em 2026-11-08 e nenhuma clínica usa `entrar`, `esqueci-senha`, `nova-senha` ou `minhas-clinicas`. Não precisa de migração, só incluir os nomes em `RESERVED_SLUGS`. Hoje não existe página em `/entrar` (o nome só está reservado), então não há comportamento antigo a preservar.
- **Tema escuro:** muda só as superfícies neutras (topo, rodapé, `/entrar`, "Suas clínicas" e as páginas de senha). As seções coloridas da história mantêm as cores da marca nos dois temas, com o contraste do texto conferido.
- **Imagem de compartilhamento:** gerada com `next/og` (amarelo da marca, símbolo Zemana e a frase principal), sem arquivo de imagem pesado no repositório.
- **Testes:** os testes existentes que esperam "Site em construção" podem ser atualizados. Entram testes de navegador para:
  - a página inicial no celular, com e sem "reduzir movimento";
  - o botão de orçamento apontando para o WhatsApp certo;
  - o caminho `/entrar` → "Suas clínicas", com a cliente vendo só as clínicas dela;
  - nenhuma clínica;
  - uma conta do painel.

  Entram também testes de integração da função no banco, verificando que ela não vaza clínicas de outra conta nem clínicas inativas.

## Abordagens consideradas

1. **Motion (escolhida):** efeito igual em todos os navegadores do celular, combina com React e respeita "reduzir movimento". Custo: cerca de 40 KB, só na página inicial.
2. **Só CSS e SVG, com animações ligadas à rolagem:** não pesa nada, mas o Firefox e iPhones antigos não suportam bem, e uma segunda versão em JavaScript seria frágil.
3. **GSAP com ScrollTrigger:** muito poderosa, mas não é feita para React e é mais pesada.

## Não-objetivos

- Preços na página (é por orçamento).
- Cadastro de clínica pela página (continua pelo root).
- Formulário de contato próprio: o contato é pelo WhatsApp.
- Blog e depoimentos.
- Ilustrações em arquivo de imagem.

## Anti-objetivos

- **Prometer o que não existe:** nada de "lembrete automático por WhatsApp", "app na loja" ou "pagamento online".
- **Página pesada no celular:** nada que trave a rolagem no celular nem demore para mostrar o primeiro texto.
- **Vazamento entre clínicas:** a lista de clínicas de uma cliente não pode mostrar clínicas de outra pessoa, nem dados das fichas.

## O que fica para o construtor

- O texto exato das seções, seguindo o tom e a história acima.
- A divisão em componentes.
- Os detalhes de cada desenho em SVG.
- O ritmo das animações.
