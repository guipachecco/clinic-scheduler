# Identidade visual por clínica

Desenho aprovado por Guilherme em 04/11/2026.

## Intenção

Cada clínica do sistema é de uma dona diferente e precisa parecer dela, não de outra. A primeira é a Grais (Greice), que já tem marca própria. As próximas são a Karol Pacheco, a Sirlei Massoterapia e a Karina (manicure). As três só têm Instagram com a foto delas: não há logo nem cores.

Esta etapa dá a cada clínica uma identidade padrão (nome, inicial, cores e foto), e a dona pode trocar as cores dentro de opções aprovadas. A página das clientes (link, QR code, login da cliente e agendamento online) é a **próxima etapa** e vai usar o que for feito aqui.

## Objetivos

1. O painel de cada clínica usa as cores dela, no tema claro e no escuro.
2. O logo de quem não tem um é gerado pelo sistema: nome, área (ex.: "Massoterapia") e a inicial num círculo. A Grais continua com as imagens dela.
3. Cada clínica tem **três paletas** à escolha. A dona escolhe e troca quando quiser na tela **Aparência** do painel.
4. A dona envia a foto dela pela tela Aparência. A foto aparece no painel e vai ser usada na página das clientes.
5. O ícone da aba do navegador mostra a inicial da clínica aberta.

## Fora do escopo

- A página das clientes, a conta de cliente e o agendamento online.
- Seletor de cor livre, troca de fontes ou de layout.
- Envio de logo em imagem pela dona. A estrutura deixa isso possível depois.

## Anti-objetivos

O trabalho falha, mesmo funcionando, se:

- **alguma combinação ficar ilegível**, principalmente para o público mais velho. Toda paleta passa por um teste automático de contraste;
- **a Grais perder a marca dela** ou mudar de aparência;
- **uma clínica aparecer com a marca de outra**, no painel ou no ícone da aba.

## Caminhos considerados

| Caminho                                                                      | Resultado                                                                                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Paletas prontas no código; a clínica guarda qual escolheu (escolhido)** | Contraste garantido e testado, modo escuro previsível, nada muda no resto do sistema. Paleta nova exige uma pequena mudança no código |
| B. Seletor de cor livre                                                      | Liberdade total, mas permite combinação ilegível e modo escuro imprevisível. Vai contra o meio-termo decidido na conversa da MarkHora |
| C. Tema fixo por clínica, compilado                                          | Cada mudança vira deploy, e a dona não troca nada sozinha                                                                             |

Guilherme escolheu o caminho A em 04/11/2026.

## Decisões de Guilherme

- Cada clínica nasce com uma identidade padrão, que a dona pode mudar depois.
- **Cada clínica tem três paletas**, e a dona escolhe entre elas.
- Paletas (das propostas mostradas em 04/11/2026):
  - **Karol Pacheco:** Nude e vinho, Preto e dourado, Rosé terroso.
  - **Sirlei Massoterapia:** Sálvia, Argila, Grafite e cobre.
  - **Karina Manicure:** Marinho e coral, Rosa esmalte, Ameixa e dourado.
- Paleta inicial: **Karina → Rosa esmalte** (escolhida por Guilherme). Karol → Nude e vinho e Sirlei → Sálvia (a proposta A, porque nenhuma foi escolhida).
- Primeiro a identidade; a página das clientes vem na etapa seguinte.

## Como funciona

### Paletas

- **Catálogo no código** (`src/modules/branding/palettes.ts`). Cada paleta tem id, nome, descrição curta e os valores das variáveis de cor que hoje ficam fixas em `globals.css`: `primary`, `primary-pressed`, `primary-foreground`, `highlight`, `highlight-foreground`, `brand`, `brand-foreground`, `brand-muted`, `brand-accent`, `brand-accent-foreground` e `ring`. Há valores para o tema claro e para o escuro.
- **Os neutros continuam iguais para todas:** fundo, cartões, bordas, texto e a cor de erro. Só a identidade muda.
- **A paleta "Grais"** é a de hoje, copiada exatamente. Ela é a única oferecida à Grais.
- **Quais paletas cada clínica vê:** uma lista no código, por endereço da clínica (`karol-pacheco`, `sirlei-massoterapia`, `karina-manicure`). A Grais vê só a dela. Uma clínica fora da lista começa com a **paleta neutra** (abaixo) e pode escolher entre ela e as nove paletas novas. Assim, nenhuma clínica nova aparece com as cores de outra. _(Decisão minha.)_
- **Paleta neutra ("Painel"):** azul-acinzentado discreto, sem relação com nenhuma clínica. É usada onde ainda não há clínica: login, `/admin/clinicas` do root e as páginas de erro do painel. _(Decisão minha.)_
- **Como as quatro cores das propostas viram as variáveis:** `brand` (menu lateral) e `primary` (botões) recebem o tom principal escuro, como na Grais. `highlight` (item ativo do menu e destaques) recebe a cor de acento, como o dourado ou o coral, e o texto sobre ela fica no tom principal. `brand-accent` (círculo da inicial e avatar) recebe o tom claro. O fundo de cada proposta não é usado, porque os neutros são iguais para todas. _(Decisão minha.)_
- **Onde a escolha fica:** em `clinics.theme`, que já existe, no campo `paletteId`. Sem paleta ou com paleta desconhecida, vale a primeira da lista da clínica.
- **Como as cores entram na página:** o layout do painel escreve as variáveis da paleta numa tag `<style>` (claro em `:root` e escuro em `.dark`), depois de `globals.css`. A CSP atual já permite estilo inline. Componentes e classes não mudam.

### Logo

- **Clínica com imagens de marca (só a Grais):** continua com `BrandImage` e as imagens de `public/marca`.
- **As outras:** um componente `ClinicWordmark` mostra a inicial num círculo (cor `brand-accent`), o nome numa fonte serifada e a área abaixo, em letras pequenas e espaçadas, como na proposta.
- **A inicial** é a primeira letra da primeira e da última palavra do nome, no máximo duas ("Karol Pacheco" → KP). Para nomes que começam com a área, como "Sirlei Massoterapia", vale só a primeira palavra (S). Por isso o nome curto e a área ficam em campos próprios (abaixo).
- **Fonte do logo:** uma serifada empacotada pelo app, como já é feito com Archivo e Figtree. Sugestão: Fraunces, via `@fontsource-variable`. Só o logo usa essa fonte.

### Dados novos da clínica

- `display_name`: o nome curto do logo ("Sirlei", "Karina", "Karol Pacheco"). Vazio usa `name`.
- `area_label`: a área ("Massoterapia", "Manicure", "Estética"). É opcional.
- `owner_photo_media_id`: a foto da dona, na tabela `media` que já existe.
- `theme.paletteId`, no campo que já existe.

### Tela Aparência (`/admin/aparencia`)

- Fica no menu do painel de todas as clínicas. A dona da clínica e o root (na clínica aberta) podem usar.
- **Na Grais:** a seção de paleta mostra "Marca própria" no lugar dos cartões, e a dona pode enviar a foto. O nome curto e a área ficam vazios, porque a Grais usa as imagens de marca dela. _(Decisão minha.)_
- **Escolher a paleta:** as três paletas aparecem como cartões, com um pedaço do painel e da página de agendamento no celular, como na proposta. A atual vem marcada. Escolher salva na hora, e o painel já aparece com as cores novas.
- **Dados do logo:** campos para o nome curto e a área, com prévia do logo.
- **Foto:** a dona envia uma foto (JPEG, PNG ou WebP, até 2 MB, limite que a tabela `media` já tem). O servidor remove os metadados (EXIF, que pode conter localização, como exige o comentário da tabela `media`), redimensiona para no máximo 800 px e grava. Também dá para remover a foto.
- Toda mudança fica no histórico (`audit_logs`), sem dados pessoais.

### Onde a identidade aparece nesta etapa

- **Menu lateral do painel:** logo (imagem da Grais ou logo gerado) e as cores da paleta.
- **Ícone da aba:** a inicial da clínica num círculo, na cor da paleta, servida por uma rota que gera um SVG. A Grais continua com o ícone atual.
- **Tela de login (`/admin/entrar`), configuração do 2FA, `/admin/clinicas` e erros do painel:** usam a paleta neutra, sem logo de clínica e com o título "Painel". Antes do login não se sabe a clínica, e assim nenhuma dona entra vendo a marca de outra. O ícone da aba dessas páginas também é neutro. _(Decisão minha.)_
- **Site público (`/`):** continua como está ("Site em construção", com a marca da Grais). Quem será a marca do endereço principal fica para a etapa da página das clientes.
- **Foto da dona no painel:** substitui o círculo com a inicial do nome da usuária no menu lateral, quando existir. Também aparece na tela Aparência. _(Decisão minha.)_

### Novas clínicas

As três clínicas são criadas pelo root em `/admin/clinicas`, com os endereços `karol-pacheco`, `sirlei-massoterapia` e `karina-manicure`, para que a lista do código as encontre. Ao criar, a clínica já recebe a paleta inicial da lista. A lista também traz o nome curto e a área iniciais de cada uma.

## Testes que precisam existir

- **Contraste de toda paleta, nos dois temas:** texto sobre `primary`, `brand` e `highlight`, e `primary` sobre o fundo, com razão de pelo menos 4,5:1 (WCAG AA). Uma paleta que não passa quebra o teste.
- **A paleta Grais é idêntica às variáveis de hoje,** para nada mudar na Grais.
- **Uma clínica só salva uma paleta da lista dela,** e nunca altera a aparência de outra clínica.
- **Foto:** os metadados são removidos, um arquivo grande ou de outro tipo é recusado, e a foto de uma clínica não abre na sessão de outra.
- **No navegador:** trocar a paleta muda a cor do menu, e o ícone da aba mostra a inicial certa.

## O que fica para quem construir

- Os valores exatos do tema escuro de cada paleta, desde que passem no teste de contraste.
- Ajustes finos nas cores das propostas, se alguma não passar no contraste. Nesse caso, escurecer o tom principal sem mudar a cor.
- A rota que serve a foto (`/admin/...`, exigindo sessão da clínica dona da foto). A página das clientes vai precisar de outra rota, pública, na próxima etapa.
