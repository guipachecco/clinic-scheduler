# Identidade visual

Aprovada por Guilherme em 29/10/2026, a partir das logos da Grais Saúde Integrativa. Proposta visual com telas de exemplo: https://claude.ai/artifact/N38mBCbetHaq8Go2fXC5gS (privada).

## Intenção

O sistema deve parecer da clínica, não um software genérico: profissional, organizado, confiável e acolhedor. O painel é usado o dia inteiro pela profissional, então a prioridade é leitura calma e rápida; o site público cuida da primeira impressão. Nenhum outro sistema de gestão serve de referência visual.

## Decisões

| Tema                  | Decisão                                                                                                            | Motivo                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Cor principal         | Marinho `#00357A` (pressionado: `#00245A`)                                                                         | Cor da marca; transmite confiança e tem contraste alto com branco                                   |
| Destaque              | Amarelo `#FFDE59`, sempre com texto marinho                                                                        | Segunda cor da marca. No branco ele é ilegível, por isso nunca vira texto                           |
| Modo escuro           | Preto `#0B0B10` com ciano `#99F0FF`                                                                                | Versão escura da própria marca. Fica para uma entrega futura                                        |
| Neutros               | Fundo `#F7F5F8`, superfície branca, borda `#E4DFE8`, texto `#1C1A22`, texto secundário `#5E5868`                   | Cinzas puxando ao lilás, tirados da luz das fotos do consultório; evitam a cara fria de hospital    |
| Erro e exclusão       | `#B3261E`                                                                                                          | Vermelho legível sobre branco                                                                       |
| Status do agendamento | Solicitado amarelo claro, confirmado marinho, concluído verde, não compareceu bordô, cancelado cinza riscado       | Cada um difere também em claridade e sempre tem o nome escrito. Os tokens entram junto com a agenda |
| Letras                | Archivo nos títulos e nos rótulos em maiúsculas espaçadas da marca; Figtree nos rótulos de formulário e nos textos | A Archivo lembra o "SAÚDE INTEGRATIVA" do logo; a Figtree é legível em listas e formulários         |
| Letra do logo         | Só no logotipo                                                                                                     | A letra ondulada do "GRAIS" cansaria e atrapalharia a leitura na interface                          |
| Espaçamento           | Múltiplos de 4 px; cantos de 10 px em botões e campos e 16 px em cartões                                           | Ritmo consistente sem decisões caso a caso                                                          |
| Alvos de toque        | Botões e campos com 44 px de altura                                                                                | Uso confortável no celular e no tablet                                                              |
| Navegação do painel   | Menu lateral marinho com o símbolo; no celular, barra no topo com o menu em linha rolável                          | Sem barra superior escura nem trilho de ícones, que lembrariam outros sistemas                      |

## Como entra no código

- **Tokens:** as variáveis do tema em `src/app/globals.css` passam a ter as cores acima. Componentes do shadcn/ui as herdam sem mudança. Um token novo, `highlight`, guarda o amarelo.
- **Fontes:** pacotes `@fontsource-variable/archivo` e `@fontsource-variable/figtree`, servidos pelo próprio app. Isso mantém a regra de nenhuma requisição externa e nenhum download no build, e a CSP (`font-src 'self'`) não muda.
- **Logos:** os quatro PNG em `public/marca/`, e o símbolo marinho como ícone do site (`src/app/icon.png` e `apple-icon.png`).
- **Painel:** o layout ganha o menu lateral. Ele lista só telas que existem. Agenda, pacientes e outras entram no menu quando forem construídas, para nada parecer pronto sem estar.
- **Login e 2FA:** fundo marinho com o logotipo e o formulário num cartão branco. Os textos e rótulos não mudam, então os testes de ponta a ponta continuam valendo.

## Fora desta entrega

- Modo escuro.
- Tokens de status, que entram com a agenda.
- Fotos no site público, que dependem da autorização de imagem da paciente que aparece em duas delas.
- Versão vetorial (SVG) dos logos. Os PNG atuais têm fundo sólido; um SVG com fundo transparente deixaria o logo nítido em qualquer cor de fundo.
