# "Minha página" em passo a passo: o dono monta a cara da própria página

Data: 2026-11-11. Status: aguardando aprovação do dono.

## Intenção

A Zemana vai ser vendida para clínicas, barbearias e manicures, e cada uma
quer a página pública (`/<slug>`) com a própria cara. A decisão de produto é
um sistema só: nada de cópia do código por cliente. Cada negócio personaliza
pelo painel, sozinho, sem falar com o dono da Zemana nem mexer em código.

Sucesso: um dono troca, só pelo painel, logo, cor principal, foto de capa,
texto de apresentação (e o resto dos passos abaixo), aperta "Publicar" e vê a
página pública atualizada.

## Objetivos

- Um passo a passo dentro de "Minha página": uma coisa por tela, com "Voltar"
  e "Próximo" e uma barra de progresso, para a tela não ficar cheia.
- Prévia ao vivo no topo de cada passo (modelo A escolhido pelo dono): uma
  mini página que muda enquanto ele mexe.
- Nada vale para os clientes até "Publicar". Até lá, a página atual continua
  no ar.
- Escolha do tipo de negócio, que ajusta palavras ("paciente" x "cliente") e
  sugere cor e fonte de partida.

## Não objetivos (primeira versão)

- Histórico de versões ou "voltar para a versão anterior".
- Envio de arquivo de fonte próprio.
- Editar no passo a passo os outros dados que já têm formulário (WhatsApp, e-mail,
  endereço, mapa, Instagram, comodidades, agendamento online, fidelidade):
  continuam no formulário atual, logo abaixo.
- Trocar "paciente" por "cliente" em todas as 29 telas do painel: a primeira
  versão troca só o menu e os títulos da área de pacientes (ver Tipo de negócio).

## Anti-objetivos

- Uma página que um cliente final não consegue ler (texto claro em fundo
  claro, botão sem contraste). A cor é livre, mas o texto sobre ela é sempre
  legível.
- Página "meio pronta" no ar porque o dono parou no meio.
- Um negócio ver ou alterar rascunho, fotos ou logo de outro (RLS).

## Passos do assistente

0. Tipo de negócio: clínica, barbearia, manicure/estética, outro.
1. Logo.
2. Foto de perfil (a foto do dono, que já existe como `owner_photo_media_id`).
3. Foto de capa.
4. Cor principal: atalhos de cores prontas e um seletor de qualquer cor.
5. Estilo dos botões: formato (redondo, levemente arredondado, quadrado) e
   preenchimento (cheio ou contorno).
6. Fonte dos títulos: lista fechada de 5 fontes.
7. Texto de apresentação: frase curta (`headline`) e "Sobre" (`about`).
8. Galeria: adicionar, remover e reordenar fotos.
9. Revisar e publicar: a página inteira em prévia, com "Publicar" e
   "Descartar rascunho".

Cada passo pode ser pulado. Ao entrar, o assistente abre no primeiro passo; um
índice dos passos permite pular direto para qualquer um.

## Abordagens consideradas

1. **Rascunho em uma coluna `page_draft` (jsonb) na própria linha de
   `clinics`.** Cada passo grava no rascunho; "Publicar" copia para as colunas
   de verdade numa transação. Migração pequena, o RLS fica igual (mesma linha),
   a página pública não muda o jeito de ler. O banco não valida o conteúdo do
   jsonb: a validação é do código (zod) na gravação e de novo ao publicar.
2. Tabela `clinic_page_drafts` espelhando as colunas, com FKs e checks. Mais
   rigor, mas cada campo novo nasce duas vezes e é mais uma tabela com RLS.
3. Versões da página (rascunho + publicadas). Dá histórico de graça, mas muda
   toda a leitura da página pública. Fica para quando histórico for pedido.

**Escolhida: 1**, pelo dono, por atender "só vale no publicar" com o menor
risco e permitir evoluir para a 3 depois.

## Desenho

### Banco (migração `0025_page_builder`)

Colunas novas em `clinics`:

- `business_type` enum `business_type` (`clinic`, `barbershop`,
  `nail_salon`, `other`), not null, default `clinic` (as clínicas que já
  existem continuam com "paciente").
- `cover_media_id uuid` com FK composta `(id, cover_media_id)` para
  `media(clinic_id, id)`, como logo e foto do dono.
- `page_draft jsonb` nulo = sem rascunho.
- `theme` (jsonb que já existe) ganha campos tipados em `ClinicTheme`:
  `primaryColor` (`#rrggbb`), `buttonShape` (`pill` | `rounded` | `square`),
  `buttonFill` (`solid` | `outline`), `fontId`. `paletteId` fica ignorado
  como hoje.
- `media_kind` ganha `cover`. (Fotos da galeria continuam `photo`.)

Permissões (padrão das migrações 0011/0017/0020):

- `app_panel`: `GRANT UPDATE (logo_media_id, cover_media_id, business_type,
  page_draft, headline, about, theme)` — as que faltarem. A policy
  `clinics_panel` já limita à própria clínica.
- `app_client`: `GRANT SELECT (business_type, cover_media_id, logo_media_id,
  theme)` — nunca `page_draft`.
- Funções definer `client_clinic_logo(p_clinic)` e `client_clinic_cover(p_clinic)`,
  no molde de `client_owner_photo`, só para clínica ativa.
- Teste de integração: o cliente não lê `page_draft`; um painel não grava
  rascunho/mídia de outra clínica.

### Rascunho

Formato (validado por zod em `src/modules/page-builder/draft.ts`):

```ts
type PageDraft = {
  businessType?: BusinessType;
  logoMediaId?: string | null;       // null = remover
  ownerPhotoMediaId?: string | null;
  coverMediaId?: string | null;
  theme?: { primaryColor?: string; buttonShape?: ...; buttonFill?: ...; fontId?: ... };
  headline?: string | null;
  about?: string | null;
  gallery?: string[];                // media ids, em ordem; ausente = não mexeu
};
```

- Campo ausente = "não mexeu, vale o publicado". A prévia mostra
  `publicado ⊕ rascunho`.
- Envio de imagem no rascunho: a imagem é re-encodada (`reencodeImage`, sem
  EXIF), gravada em `media` já ligada à clínica, e o id vai para o rascunho.
  Ela não aparece na página porque nenhuma coluna publicada aponta para ela.
- **Publicar** (uma transação, `for update` na linha da clínica): valida o
  rascunho de novo; confere que cada media id é da clínica; copia os campos;
  reescreve `clinic_photos` conforme `gallery`; apaga as mídias que deixaram
  de ser usadas (substituídas e órfãs do rascunho); zera `page_draft`;
  grava `audit_logs` (`clinic.page_published`, com a lista de campos).
- **Descartar**: apaga as mídias criadas só pelo rascunho e zera
  `page_draft`.
- Órfãs: uma mídia é "do rascunho" se nenhum campo publicado nem
  `clinic_photos` aponta para ela. Publicar e descartar fazem essa limpeza só
  sobre os ids citados no rascunho, nunca varrendo `media` inteira.

### Cor

- Dono escolhe qualquer `#rrggbb` (atalhos + `<input type="color">`).
- `src/modules/branding/derive.ts` gera a `Palette` (tokens light/dark que já
  existem) a partir de uma cor: tom pressionado (escurecido), tint claro, tons
  do modo escuro, e escolhe `primary-foreground` branco ou `#1c1a22` pelo
  maior contraste (`contrastRatio`). Para o modo escuro, clareia a cor até ter
  contraste ≥ 4.5 contra o fundo escuro.
- Sem cor escolhida: paleta Zemana, como hoje.
- A página pública (`src/app/[slug]/layout.tsx`) injeta `paletteCss` com
  escopo no contêiner da página, para não vazar para outras telas.

### Botões e fonte

- Botões: variáveis CSS (`--radius-button`, e uma classe de preenchimento)
  aplicadas no contêiner da página pública; os botões da página (agendar,
  abas, barra de agendamento) passam a lê-las.
- Fontes: 5 fontes `@fontsource-variable` (uma já carregada, Bricolage
  Grotesque, + 4 novas escolhidas para cobrir elegante/clínica, forte/
  barbearia, delicada/manicure, neutra). Só os títulos (`font-heading`) mudam;
  o corpo continua Figtree. As fontes são importadas só na página pública e
  no assistente.

### Tipo de negócio

- `src/modules/business-type/vocabulary.ts`: mapa por tipo com
  `person`/`people` ("paciente"/"pacientes" ou "cliente"/"clientes") e
  sugestões de partida (cor, fonte, formato do botão).
- Escolher o tipo no passo 0 preenche no rascunho as sugestões só dos campos
  que o dono ainda não escolheu.
- Na primeira versão o vocabulário vale no menu do painel ("Pacientes" →
  "Clientes"), no título e no botão "novo" da lista de pacientes. As URLs
  (`/admin/pacientes`) não mudam. O resto das telas fica para depois.
- A página pública já fala "cliente"; não muda.

### Logo na página pública

O topo da página (`layout.tsx`) mostra o logo do negócio no lugar do símbolo
da Zemana quando houver; sem logo, continua o símbolo. Rota
`/<slug>/logo` no molde de `/<slug>/foto`.

### Capa

`Hero` usa `cover_media_id` quando houver; senão a primeira foto da galeria
(comportamento de hoje). O Open Graph segue a mesma ordem.

### Tela no painel

- `/admin/pagina` ganha, no topo, um cartão "Monte a cara da sua página" com
  botão "Começar" (ou "Continuar rascunho" quando houver). O formulário atual
  continua embaixo.
- Assistente em `/admin/pagina/montar` (rota com `?passo=N`), componente
  cliente; cada "Próximo" grava o passo no rascunho via Server Action e
  avança. Prévia: componente React que reaproveita o `Hero` e um botão de
  agendar, alimentado pelo estado do formulário (sem iframe).
- Mobile primeiro (o dono usa no celular), mesmo visual do painel.

## Testes

- Unidade (vitest): `derive.ts` (contraste ≥ 4.5 em cores claras, escuras e
  médias), schema do rascunho, merge publicado ⊕ rascunho, vocabulário.
- Integração (banco real): publicar copia campos e reescreve galeria; descartar
  apaga só mídias do rascunho; RLS — cliente não lê `page_draft`, painel não
  toca outra clínica.
- E2E (Playwright, padrão de `e2e/clinic-page-panel.spec.ts`): o dono entra,
  percorre o assistente trocando logo, cor, capa e texto, confere que a página
  pública ainda está igual, publica e confere a página pública atualizada.

## Decisões tomadas após a revisão (escolhas do Claude, o dono pode recusar)

1. **Frase e "Sobre" saem do formulário antigo.** Passam a ser editados só no
   passo 7, atrás do "Publicar". Assim não há dois caminhos gravando o mesmo
   campo, e um rascunho velho não sobrescreve uma edição feita direto.
2. **A cor escolhida é usada exatamente como está no fundo dos botões cheios e
   nas faixas de cor.** Onde a cor vira texto ou contorno sobre fundo claro
   (botão de contorno, abas, links, `ring`), `derive.ts` usa uma variante
   escurecida até ter contraste ≥ 4.5; no modo escuro, uma variante
   clareada. A prévia mostra exatamente isso.
3. **O logo é um só.** `logo_media_id` é o mesmo do papel timbrado do PDF da
   anamnese, então publicar um logo novo também muda os PDFs gerados depois
   (eles são gerados na hora, não ficam guardados). O logo antigo é apagado ao
   publicar a troca.
4. **O tipo de negócio também só vale no "Publicar"**, como todo o resto: o
   menu do painel muda de "Pacientes" para "Clientes" depois de publicar.
5. **Duas pessoas editando ao mesmo tempo:** vale a última gravação, campo a
   campo. "Descartar" e "Publicar" só apagam mídias citadas no rascunho que
   leram dentro da transação (`for update`), então nada que outra pessoa
   publicou é apagado. Sem tela de conflito na primeira versão.
6. **`paletteId` e o catálogo de paletas ficam como estão** (sem uso, já são
   ignorados). A paleta Zemana segue como padrão quando não há cor; a
   limpeza do código morto de paletas fica fora desta entrega.
7. A prévia de imagens do rascunho usa a rota que o painel já tem
   (`/admin/foto/[id]`).

## Fica a cargo de quem implementar

- Quais 4 fontes novas e os 5–6 atalhos de cor.
- Detalhes visuais da prévia e do índice dos passos.
- Limite de tamanho do `headline` (o atual) e do rascunho.
