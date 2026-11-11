# Anamnese na ficha da paciente

Conversado com Guilherme em 10/11/2026. Itens marcados _(decisão minha)_ foram propostos por Claude e podem ser revistos.

## Intenção

A Greice (Grais) atende com a **Anamnese Integrativa – Método ADS-USI**, da pós-graduação dela. Hoje a ficha só existe num Word (`ANAMNESE METODO ADS CASO CLINICO ALUNOS.docx`). Ela quer preencher a anamnese no painel, digitando durante o atendimento, guardar na ficha da paciente e, no fim, gerar um PDF com o cabeçalho da clínica dela.

O cadastro de pacientes deixou prontuário e informações clínicas para uma etapa própria (`docs/cadastro-de-pacientes.md`). Esta é a primeira parte dessa etapa: a anamnese, e só ela.

## Objetivos

- Na ficha da paciente, uma lista de anamneses, cada uma com a sua data.
- Uma anamnese nova vem preenchida com as respostas da última, para a Greice só atualizar o que mudou.
- Salvar no meio e voltar depois para continuar ou corrigir.
- Botão que baixa um PDF pronto, com o cabeçalho da clínica, igual no computador e no celular.
- Disponível só para a Grais.

## Fora do escopo

- Editor de perguntas no painel. O modelo fica no código.
- Anamnese para outras clínicas (manicure, massoterapia, estética). Quando houver, entra como outro modelo.
- A paciente preencher pelo link da clínica, ou ver a anamnese em "Meus horários".
- Assinatura digital. O PDF tem a linha para assinar à mão.
- Evolução clínica sessão a sessão, exames anexados, fotos de antes e depois.

## O que seria um fracasso mesmo funcionando

- O conteúdo da anamnese em logs, no histórico de ações (`audit_logs`), em endereços de página, no título da aba ou em mensagens de erro do servidor.
- A área da cliente (`app_client`) ou outra clínica conseguir ler uma anamnese.
- A Greice perder o que digitou porque fechou a página ou a sessão expirou.
- Uma paciente anonimizada continuar com anamnese guardada.
- O PDF sair com dezenas de perguntas em branco, ou cortar texto longo.
- No celular, o formulário ficar inviável de preencher (rolagem lateral, campos minúsculos).

## O modelo da ficha

O modelo vem do Word, que está em `C:\Users\Guilherme\Videos\Retiro 2026\ANAMNESE METODO ADS CASO CLINICO ALUNOS.docx` (fora do repositório). Quem constrói transcreve dele os rótulos e os textos de ajuda exatos; a lista abaixo é o resumo. A ordem é esta. Cada pergunta é um campo de texto livre, salvo onde está indicado. Textos explicativos do Word aparecem como ajuda no formulário e não vão para o PDF.

1. **Identificação**: vem do cadastro e não é digitada aqui. O PDF mostra nome, nascimento (com idade), telefone, WhatsApp e e-mail lidos da ficha da paciente no momento de gerar o PDF. A anamnese guarda só os campos que o cadastro não tem: profissão, atuação (escolha única: CLT, independente ou clínica), endereço e convênio.
2. **Queixas e sintomas**: principais queixas, duração, o que agrava ou melhora, diagnóstico prévio, tratamentos já feitos, o que espera do atendimento.
3. **Fase de análise**: sensação predominante, como afeta a vida, emoções associadas, projeto de vida, como se vê em 10 anos, metas.
4. **História de vida**: história pessoal, momentos marcantes, eventos traumáticos ou estressores.
5. **Antecedentes pessoais e familiares**: doenças na família, doenças pessoais/cirurgias/acidentes, problema crônico.
6. **Histórico gestacional**: concepção (programada ou surpresa), aceitação pelos pais, histórico materno, estado emocional dos pais, abortos anteriores, tipo de parto (marcar um ou mais: normal, cesárea, fórceps, trauma no parto), complicações, oxigenação/UTI neonatal, reação após o primeiro dia, tempo de amamentação, dias até a alta.
7. **Setênios da vida**: um campo por fase (0–7, 7–14, 14–21, 21–28, 28–35, 35–42, 42–49), com a descrição de cada fase como ajuda. _(Decisão minha: acrescentar "49 anos ou mais", porque há pacientes acima dessa idade.)_
8. **Impactos desencadeadores**: medos, preocupações, o que estressa, satisfação com a vida, realização, felicidade.
9. **Impactos clínicos**: infância, adolescência, intestino (com o tipo de fezes da Escala de Bristol, escolha de 1 a 7, mais um texto), pele/cabelos/unhas, olhos e língua, flacidez ou celulite, circunferência abdominal.
10. **Doenças pregressas**: marcar (diabetes, hipertensão, câncer, obesidade, enxaqueca, problemas articulares, dores crônicas) mais "Outras".
11. **Hábitos de vida**: sono (dorme bem, insônia ou despertar precoce, como acorda), mente e emoções (ansiedade/irritabilidade, padrões mentais, memória e cognição), relacionamentos (vida afetiva e social), alimentação (principais refeições).
12. **Hábitos de vida e lazer**: atividade física, hobbies, rotina de lazer.
13. **Diagnóstico biopsicossomático** (preenchido pela Greice): estado geral, hormonal, sono, fisiológico (exames laboratoriais), bioressonância/AO Scan/mineralograma/Oligoscan.
14. **Protocolos de tratamento**: os 4 passos do Word. Em cada um, as terapias para marcar e um campo de observações:
    - Passo 1, 4 pilares: jejum intermitente e desintoxicação intestinal; modulação do terreno biológico; fitoterapia, homeopatia e florais; terapias complementares.
    - Passo 2, campo sutil e memória celular: microfisioterapia, leitura biológica e constelação familiar; hipnoterapia, PNL, ThetaHealing e reprogramação de crenças; TICs.
    - Passo 3: modulação hormonal e nutricional.
    - Passo 4: atividade física e estilo de vida.

Os rótulos ficam como no Word, com a ortografia corrigida ("Fórceps", "Precisou de oxigenação"). O cabeçalho da pós-graduação ("Programa de atendimento aos alunos e monitoria", nome do coordenador) **não** entra.

## Como funciona

### Na ficha da paciente (`/admin/pacientes/<id>`)

- Nova seção **"Anamneses"**, só quando a clínica tem anamnese ligada. Mostra a lista da mais nova para a mais antiga: data da anamnese, "Em andamento" ou "Concluída" e "atualizada em dd/mm/aaaa".
- Botão **"Nova anamnese"**. Se a paciente já tem anamnese, a nova é criada com as respostas da mais recente copiadas e a data de hoje. Se não tem, começa em branco.
  - "Mais recente" é a de `taken_on` maior, com desempate por `updated_at`, esteja ela concluída ou em andamento. _(Decisão minha.)_
  - **Diagnóstico biopsicossomático (seção 13) e protocolos de tratamento (seção 14) não são copiados**: começam em branco, porque são a avaliação da Greice naquele momento e um diagnóstico antigo copiado poderia ir para o PDF assinado sem ela perceber. (Decidido por Guilherme.)
  - A cópia usa sempre a versão atual do modelo: respostas a perguntas que não existem mais ficam de fora da cópia e continuam só na anamnese antiga. Assim cada anamnese tem uma versão só. _(Decisão minha.)_
- Paciente anonimizada: a seção some, porque não há mais anamneses.

### Preenchimento (`/admin/pacientes/<id>/anamneses/<anamneseId>`)

- Página própria, com as seções acima em blocos recolhíveis e um índice das seções, para pular direto a qualquer uma.
- No topo: a data da anamnese (editável, para registrar uma feita em outro dia) e a situação.
- **Salvar** grava tudo e continua na página. Há também um salvamento automático alguns segundos depois da última digitação e ao sair da página, para não perder texto. _(Decisão minha: a ficha é longa demais para depender de um botão só.)_
- **Rascunho só no servidor.** Nada da anamnese fica no navegador (`localStorage`, IndexedDB), porque o celular pode ser compartilhado. Se a sessão expirar, o texto continua na tela e aparece "Sua sessão expirou. Entre de novo em outra aba e depois clique em Salvar". _(Decisão minha.)_
- **Dois aparelhos ao mesmo tempo:** cada salvamento leva a versão que a tela carregou (`updated_at`). Se a anamnese mudou em outro lugar, o salvamento é recusado com "Esta anamnese foi alterada em outro aparelho. Copie o que digitou e recarregue a página", em vez de sobrescrever. _(Decisão minha.)_
- **"Marcar como concluída"** e **"Reabrir"**. Concluída continua editável. A situação só serve para a Greice saber o que falta.
- **"Gerar PDF"** baixa o arquivo com o que está salvo. Se houver alteração não salva, salva antes.
- **Excluir anamnese**: com confirmação, para uma criada por engano. _(Decisão minha.)_
- Validação: tamanhos máximos por campo (texto curto 200, texto longo 5.000 caracteres) e opções só da lista do modelo, no navegador e no servidor. Nenhum campo é obrigatório.

### O PDF

- **Cabeçalho da clínica**: logo da clínica (`clinics.logo_media_id`), quando houver; nome da clínica; nome e registro da profissional (`professional_name`, `professional_registration`); endereço, WhatsApp e e-mail de contato, quando preenchidos.
- Título "Anamnese Integrativa", nome da paciente e data da anamnese.
- Bloco de identificação vindo do cadastro.
- **Só as perguntas respondidas**; seção sem nenhuma resposta não aparece. Marcações aparecem como lista do que foi marcado.
- Texto longo quebra entre páginas sem cortar; rodapé com "página X de Y".
- No fim: linhas para assinatura da paciente e da profissional, com local e data.
- Nome do arquivo: `anamnese-AAAA-MM-DD.pdf`, sem o nome da paciente, que ficaria no histórico de downloads de outros aparelhos. _(Decisão minha.)_
- Gerado no servidor com `@react-pdf/renderer`, numa rota do painel que exige `requireAdmin()` e responde com `Cache-Control: no-store`.

### Quem vê

- Só o painel da clínica (`requireAdmin()`, com 2FA), como o resto da ficha. Root dentro da Grais também vê, como vê o resto.
- A paciente nunca vê, nem pelo link da clínica. _(Decisão minha: é dado de saúde e inclui o diagnóstico da Greice.)_

## Banco de dados

Uma migração nova, só com acréscimos:

- **`clinics.anamnesis_template`** (`text`, nulo). É o modelo que a clínica usa; nulo quer dizer sem anamnese. A migração liga `'integrativa-ads-v1'` na clínica de endereço `grais`. _(Decisão minha: uma coluna em vez do endereço fixo no código, para poder ligar outro modelo em outra clínica sem mexer no código de permissão.)_
- **Tabela `anamneses`**:
  - colunas: `id`, `clinic_id`, `patient_id`, `template` (modelo e versão usados), `taken_on` (date), `status` (`in_progress` | `completed`), `answers` (jsonb), `created_by_user_id`, `updated_by_user_id`, `created_at`, `updated_at`;
  - chave estrangeira composta `(clinic_id, patient_id)` para `patients`, como os outros registros da clínica;
  - índice `(clinic_id, patient_id, taken_on desc)`;
  - CHECK de tamanho total de `answers` (por exemplo, 200 KB).
- **Permissões**: `app_panel` com SELECT, INSERT, UPDATE e DELETE, com RLS pela clínica da sessão, igual às outras tabelas. `app_client` e `app_platform` sem acesso. Os testes de `tests/integration/db-roles.test.ts` passam a conferir isso.
- **`answers`** é um objeto `{ idDaPergunta: valor }`. O modelo no código define cada pergunta (id, rótulo, tipo, opções, ajuda), e dele saem o formulário, a validação (zod) e o PDF. Respostas a perguntas que deixaram de existir numa versão nova do modelo continuam guardadas e saem no PDF com o rótulo da versão em que foram feitas. Por isso, o modelo antigo nunca é apagado do código.

## LGPD e histórico

- **Anonimizar a paciente apaga todas as anamneses dela**, na mesma transação da anonimização. O aviso da ficha anonimizada passa a dizer que as anamneses foram apagadas.
- **Juntar fichas ("É a mesma")**: as anamneses da ficha provisória passam para a ficha antiga, junto com horários e vendas.
- **Histórico de ações**: `anamnesis.created`, `anamnesis.updated`, `anamnesis.completed`, `anamnesis.reopened`, `anamnesis.deleted` e `anamnesis.pdf_generated`, com os ids da paciente e da anamnese. Nunca o conteúdo, nem os nomes das perguntas alteradas, porque o nome da pergunta já revela o assunto. _(Decisão minha: o salvamento automático não grava uma linha a cada salvamento; grava no máximo uma `anamnesis.updated` por anamnese a cada 30 minutos.)_
- Nada de respostas em `console`, logs de erro ou na resposta de erro das Server Actions.

## Abordagens consideradas

**Como guardar as respostas**

| Abordagem                                       | A favor                                                                 | Contra                                               | Escolha       |
| ----------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- | ------------- |
| Modelo no código + respostas em JSON com versão | Uma definição gera formulário, validação, cópia e PDF; ajustar é barato | O banco não confere cada campo; a validação é do app | **Escolhida** |
| Uma coluna por pergunta                         | O banco valida tudo                                                     | Mais de 100 colunas; cada ajuste vira migração       | —             |
| Editor de perguntas no painel                   | Cada clínica monta a sua                                                | Muito trabalho para um modelo só                     | —             |

**Como gerar o PDF** (Guilherme escolheu a primeira)

| Abordagem                               | A favor                                                                           | Contra                                                                                 | Escolha       |
| --------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------- |
| PDF no servidor (`@react-pdf/renderer`) | Botão baixa o arquivo, igual em qualquer aparelho, pronto para mandar no WhatsApp | Dependência nova; layout do PDF escrito à parte da tela                                | **Escolhida** |
| Página de impressão + "Salvar como PDF" | Sem dependência nova                                                              | No celular o caminho é escondido e muda entre aparelhos; quebras dependem do navegador | —             |

## Deixado para quem constrói

- Nomes internos, seguindo `src/modules/anamnesis` e o padrão de `src/modules/patients`.
- Os ids das perguntas no modelo, desde que estáveis entre versões.
- O visual do formulário e do PDF, dentro da marca Zemana no painel e com o cabeçalho da clínica no PDF.
- Como fazer o salvamento automático (Server Action com intervalo de espera), desde que um salvamento lento não sobrescreva um mais novo.
- Fontes do PDF: as do projeto (`@fontsource-variable`) ou as padrão da biblioteca, desde que acentos saiam certos.
