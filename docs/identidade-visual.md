# Identidade visual

O sistema inteiro é a **Zemana**: uma marca só, em todas as telas e para todas as clínicas, inclusive a Grais. Aprovada por Guilherme em 05/11/2026. Desenho completo em `docs/superpowers/specs/2026-11-05-marca-zemana-design.md`. As regras da marca vêm do manual (`Zemana-Manual-de-Marca.pdf`).

## Cores

| Nome        | HEX       | Uso no sistema                                                                                     |
| ----------- | --------- | -------------------------------------------------------------------------------------------------- |
| Roxo Zemana | `#2A0081` | `primary` e `brand`: menu lateral, botões, anel de foco, status "confirmado"                       |
| Amarelo     | `#F5C700` | `highlight`: item ativo do menu e destaques, sempre com texto roxo (nunca como texto sobre branco) |
| Rosa        | `#FFD3F0` | `brand-accent`: avatar e detalhes                                                                  |
| Azul-claro  | `#B7E7FC` | Apoio e cor principal no modo escuro                                                               |
| Framboesa   | `#BA1650` | Apoio. Não substitui o erro, que continua `#B3261E`                                                |

Neutros (fundo `#F7F5F8`, cartões brancos, bordas e textos acinzentados com tom lilás) seguem como antes. No modo escuro o `brand` é um roxo bem escuro (`#14033a`). Os valores ficam em `src/app/globals.css` e em `PALETTES.zemana` (`src/modules/branding/palettes.ts`); o teste `palettes.test.ts` confere o contraste de 4,5:1 nos dois temas.

## Fontes

- **Títulos:** Bricolage Grotesque (`@fontsource-variable/bricolage-grotesque`).
- **Textos e formulários:** Figtree (`@fontsource-variable/figtree`).

Ambas são servidas pelo próprio app, sem requisição externa (a CSP `font-src 'self'` não muda).

## Logo

Os arquivos ficam em `public/marca/`, recortados do manual. Nunca redesenhe o nome com outra fonte, estique, gire ou troque as cores do símbolo. Não use o logo abaixo de 120 px de largura nem o símbolo abaixo de 16 px. Todo logo leva `alt="Zemana"`.

| Arquivo                                                              | Quando usar                    | Onde aparece                                                                       |
| -------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| `zemana-vertical.png`, `zemana-horizontal.png`, `zemana-simbolo.png` | Fundo claro (símbolo roxo)     | Site público (tema claro)                                                          |
| versões `-fundo-escuro` de cada um (símbolo amarelo, nome branco)    | Fundo roxo ou escuro           | Login e 2FA, menu lateral do painel, cabeçalho do root, site público (tema escuro) |
| `src/app/icon.png` e `apple-icon.png`                                | Ícone da aba e da tela inicial | Todas as páginas                                                                   |

O componente `BrandImage` (`src/components/brand-image.tsx`) escolhe o arquivo: com `onBrand` usa sempre a versão de fundo escuro (superfícies sempre roxas); sem ele, mostra a clara no tema claro e a de fundo escuro no tema escuro.

## No painel

O menu lateral é roxo, com o logo horizontal, o nome da clínica aberta logo abaixo e, para o root, "Trocar de clínica". O avatar do usuário mostra a inicial do nome. Não há tela de Aparência: a marca não se escolhe por clínica.

## Guardado para depois

A marca própria de cada clínica (paleta, nome de exibição, área e foto da dona) foi desligada, não apagada. `src/modules/branding/*` e a rota `/admin/foto/[id]` continuam no código, sem uso na interface, caso a ideia volte (por exemplo, para a página das clientes).
