# Anamnese

Construída em 10/11/2026 a partir do [desenho aprovado](superpowers/specs/2026-11-10-anamnese-design.md). Fica na ficha da paciente, na seção **Anamneses**. Hoje só a Grais tem. O questionário vem do Word "Anamnese Integrativa – Método ADS-USI", que a dona da clínica guarda.

## Quem tem

- **Só a Grais:** `clinics.anamnesis_template = 'integrativa-ads-v1'`, definido pela migração `drizzle/0024_anamnesis.sql`.
- **Ligar em outra clínica é uma migração**, nunca uma opção do painel: `UPDATE clinics SET anamnesis_template = '<modelo>' WHERE id = …`. O usuário do painel (`app_panel`) não consegue alterar essa coluna.
- **Outro questionário precisa do modelo no código:** se a outra clínica usa um questionário diferente, ele tem de existir em `src/modules/anamnesis/template.ts` antes da migração. `createAnamnesis` sempre cria com o id do modelo atual.
- Clínica sem modelo não mostra a seção.

## Como a dona usa

1. Na ficha da paciente, **Nova anamnese** cria uma anamnese (em andamento).
2. Se a paciente já tem anamnese, a nova **copia a mais recente** (por data e, em empate, pela última edição). Só "Diagnóstico biopsicossomático" e "Protocolos de tratamento" começam em branco.
3. A dona preenche. O texto é **salvo sozinho 3 segundos depois da última alteração**. Ao sair por um link da própria tela, salva antes.
4. **Concluir** fecha a anamnese; **Reabrir** volta a editar. **Excluir** apaga uma anamnese.
5. **PDF** baixa a anamnese.

## Regras do formulário

- **Salvar com versão:** cada anamnese tem uma versão. Se outro aparelho salvou antes, o salvamento (ou a mudança de situação) é recusado com a mensagem de conflito, e nada é sobrescrito.
- **Sessão expirada:** o texto digitado continua na tela. A dona entra de novo e salva.
- **Nada no navegador:** o rascunho não fica em `localStorage` nem em outro armazenamento local.
- **`src/proxy.ts`:** deixa passar as chamadas de Server Action (POST) no caminho do formulário (`/admin/pacientes/<id>/anamneses/<anamneseId>`) sem o redirecionamento por falta de cookie, para o formulário mostrar a mensagem de sessão em vez de perder o texto. As ações conferem a sessão por conta própria (`getPanelContext()`, que responde "sessão expirada" sem redirecionar). Por isso **toda Server Action do painel confere a sessão ela mesma**, nunca confia no proxy.

## PDF

- Gerado no servidor com `@react-pdf/renderer`, com o cabeçalho da clínica (logo, nome e contatos).
- Traz **só as perguntas respondidas** e linhas de assinatura no fim.
- Arquivo `anamnese-AAAA-MM-DD.pdf`, com a data da anamnese. Resposta com `Cache-Control: no-store`.
- Logo ilegível não impede o PDF.
- A fonte do PDF (Helvetica embutida) só tem os caracteres do Windows-1252: emoji e outros símbolos do teclado do celular são retirados antes de gerar; acentos e pontuação comum ficam.
- **Celular / WhatsApp** e **Telefone fixo** saem em linhas separadas, só quando preenchidos.

## LGPD e acesso

- **Tabela `anamneses`** com `clinic_id` e RLS por clínica. Só `app_panel` acessa; `app_client` e `app_platform` não têm acesso (ver [várias clínicas](multiclinica.md)).
- **Anonimizar a paciente apaga as anamneses dela**, na mesma transação.
- **"É a mesma"** (juntar a ficha provisória com a antiga) move as anamneses para a ficha que já existe.
- **Respostas fora do terminal:** `logging.serverFunctions: false` em `next.config.ts`, para o `next dev` não imprimir os argumentos das Server Actions.
- **Histórico (`audit_logs`),** só com ids, nunca com respostas: `anamnesis.created`, `anamnesis.updated` (no máximo um a cada 30 minutos), `anamnesis.completed`, `anamnesis.reopened`, `anamnesis.deleted` e `anamnesis.pdf_generated`.

## Onde o código está

| Parte                                                | Arquivo                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| Tabela e acesso                                      | `drizzle/0024_anamnesis.sql`                                         |
| Criar, copiar, salvar com versão, concluir e excluir | `src/modules/anamnesis/anamnesis.ts`                                 |
| Perguntas do modelo e campos                         | `src/modules/anamnesis/template.ts`, `fields.ts`                     |
| PDF                                                  | `src/modules/anamnesis/pdf.tsx`                                      |
| Telas                                                | `src/app/admin/(painel)/pacientes/[id]/anamneses.tsx` e `anamneses/` |
| Passagem das Server Actions                          | `src/proxy.ts`                                                       |
