# Marca Zemana em todo o sistema

Desenho aprovado por Guilherme em 05/11/2026. Referência: manual de marca da Zemana (`Zemana-Manual-de-Marca.pdf`, 4 páginas).

## Intenção

O sistema passa a ser a **Zemana**: uma marca só, em todas as telas e para todas as clínicas, inclusive a Grais. A ideia de cada clínica ter marca própria para as clientes fica guardada "por enquanto". Por isso, o mecanismo de paletas construído em 04/11 continua no código, mas sem uso visível.

## Objetivos

1. Login, configuração do 2FA, painel de todas as clínicas, tela de clínicas do root, páginas de erro e site público com as cores, as fontes e o logo da Zemana.
2. Ícone da aba: o símbolo da Zemana em todas as páginas.
3. O painel mostra o nome da clínica aberta, sem logo nem cores próprias da clínica.
4. Modo escuro continua funcionando, no estilo do manual (fundo roxo escuro, símbolo amarelo, nome branco).

## Fora do escopo

- Página das clientes e marca por clínica (adiadas).
- Redesenho de telas: só trocam marca, cores e fonte dos títulos.

## Anti-objetivos

- **Desrespeitar o manual:** recriar o nome com outra fonte, esticar ou girar o logo, trocar as cores do símbolo, usar o logo abaixo de 120 px de largura ou o símbolo abaixo de 16 px.
- **Perder legibilidade:** a paleta da Zemana passa pelo mesmo teste de contraste (4,5:1) nos dois temas.
- Deixar rastros da Grais (imagens, cores ou ícone) em qualquer tela.

## Caminhos considerados

| Caminho | Resultado |
| --- | --- |
| **A. Trocar a marca e manter o mecanismo de paletas (escolhido)** | Mexe pouco; reversível se a marca por clínica voltar |
| B. Remover a identidade por clínica de vez | Código mais enxuto, mas desfaz o trabalho de 04/11 |

Guilherme escolheu o caminho A em 05/11/2026.

## Decisões de Guilherme

- Tudo é Zemana, inclusive a Grais.
- A cliente ver a marca da própria clínica fica para depois.
- Caminho A.
- **A tela Aparência sai do menu.**

## Como fica

### Cores (do manual)

| Nome | HEX | Uso no sistema |
| --- | --- | --- |
| Roxo Zemana | `#2A0081` | `primary`, `brand` (menu lateral, botões), `ring`, status "confirmado" |
| Amarelo | `#F5C700` | `highlight` (item ativo do menu, destaques). Texto sobre ele em roxo, nunca amarelo como texto sobre branco |
| Rosa | `#FFD3F0` | `brand-accent` (avatar, detalhes) |
| Azul-claro | `#B7E7FC` | Apoio, e cor principal no modo escuro se passar no contraste |
| Framboesa | `#BA1650` | Apoio. Não substitui a cor de erro, que continua `#B3261E` |

- Os neutros atuais (fundo, cartões, bordas, texto) continuam, porque já puxam ao lilás e combinam com o roxo.
- **Modo escuro:** o `brand` fica num roxo bem escuro, o principal fica num tom claro (azul-claro ou rosa) que passe no teste de contraste, e o destaque continua amarelo. Os valores exatos ficam com quem constrói, desde que passem no teste. *(Decisão minha.)*

### Fontes

- **Títulos:** Bricolage Grotesque, empacotada pelo app (`@fontsource-variable/bricolage-grotesque`) no lugar da Archivo.
- **Textos:** Figtree, que já é usada.
- A Fraunces (logo gerado das clínicas) sai do carregamento, porque o logo gerado deixa de aparecer.

### Logo

- **Arquivos:** os PNGs são recortados do PDF do manual em alta resolução e com fundo transparente, sem redesenhar nada. Ficam em `public/marca/`:
  - símbolo (versão roxa, para fundos claros);
  - símbolo para fundo roxo (quadrado amarelo com Z roxo);
  - logo horizontal para fundo claro (nome roxo);
  - logo horizontal para fundo roxo (nome branco);
  - logo vertical para a tela de login.

  Se Guilherme enviar os arquivos originais (SVG), eles substituem os recortes.
- **Onde aparece:**
  - menu lateral do painel: logo horizontal para fundo roxo, com o nome da clínica aberta abaixo;
  - tela de login e configuração do 2FA: logo vertical;
  - tela de clínicas do root: logo horizontal;
  - site público (`/`): logo vertical.
- **Ícone da aba e do celular** (`src/app/icon.png`, `apple-icon.png`): o símbolo da Zemana. A rota que gerava o ícone por clínica e o ícone neutro saem de uso.

### Paletas e tela Aparência

- O catálogo ganha a paleta `zemana`. `CLINIC_BRANDING` passa a oferecer só `zemana` a todas as clínicas, e toda clínica fora da lista também usa `zemana`. As outras paletas continuam definidas e testadas, mas não são oferecidas.
- **Tela Aparência:** sai do menu e a rota `/admin/aparencia` deixa de existir. As funções de paleta, de texto e de foto continuam no código, sem tela. Os dados já gravados (incluindo a foto) continuam no banco, sem uso. *(Decisão de Guilherme.)*
- **O menu lateral** mostra o logo da Zemana, o nome da clínica e o círculo com a inicial da usuária, como antes. A foto da dona deixa de aparecer, já que não há mais onde trocá-la. *(Decisão minha.)*

## Testes que precisam existir

- **Contraste da paleta `zemana`** nos dois temas, no teste que já existe.
- **No navegador:**
  - login, painel da Grais e painel de outra clínica com `--brand` igual a `#2a0081`;
  - logo da Zemana visível (texto alternativo "Zemana") e nenhuma imagem da Grais;
  - sem rolagem lateral em 360 px.
- Os testes que hoje verificam as cores por clínica passam a verificar a Zemana.

## O que fica para quem construir

- Os valores do modo escuro, desde que passem no contraste.
- O recorte dos PNGs (resolução de pelo menos 2x o tamanho exibido) e as variantes de cada fundo, conforme as páginas 3 e 4 do manual.
- Atualizar `docs/identidade-visual.md`, `docs/multiclinica.md` e o README para a marca Zemana.
