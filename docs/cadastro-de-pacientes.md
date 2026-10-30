# Cadastro de pacientes

Aprovado por Guilherme em 30/10/2026. Primeira tela de negócio do painel: o padrão que ela criar (conferir permissão, validar, gravar e registrar no histórico) vale para as próximas.

## Intenção

A profissional e a equipe precisam cadastrar, encontrar e atualizar pacientes no painel, com os mesmos dados que a clínica já anota hoje. É a base da agenda: todo agendamento aponta para um paciente desta lista.

## Objetivos

- Cadastrar, buscar, ver e editar pacientes pelo painel, no computador e no celular.
- Guardar os dados que a clínica já usa (lista abaixo), validados no navegador e no servidor.
- Evitar cadastro duplicado.
- Anonimizar um paciente a pedido do titular (LGPD), sem perder o histórico de agendamentos.
- Registrar no histórico quem criou, alterou ou anonimizou, sem dados pessoais no registro.

## Fora do escopo

- Prontuário, informações clínicas, documentos e termos: etapa própria, com validação jurídica.
- Histórico de atendimentos na ficha: entra com a agenda.
- Exportar os dados do paciente (direito do titular): entrega seguinte.
- Excluir paciente: não existe; o caminho é anonimizar.
- Telefone de outro país: só números do Brasil por enquanto.

## O que seria um fracasso mesmo funcionando

- Dados de paciente em endereços de página, logs, histórico de ações ou mensagens de erro do servidor.
- Uma busca ou ficha acessível sem login com 2FA.
- Observações virando prontuário informal (alergias, remédios, queixas).
- Dois cadastros da mesma pessoa sem aviso.

## Dados do paciente

| Campo              | Obrigatório no painel | Regra                                                                                                                       |
| ------------------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Nome completo      | sim                   | 2 a 120 caracteres                                                                                                          |
| Apelido            | não                   | até 40 caracteres; aparece na agenda quando existir                                                                         |
| CPF                | não                   | 11 dígitos com dígitos verificadores válidos; guardado só com números; único entre pacientes                                |
| RG                 | não                   | até 20 caracteres, texto livre                                                                                              |
| Celular / WhatsApp | sim                   | número do Brasil com DDD; guardado no formato internacional (`+55…`)                                                        |
| Telefone fixo      | não                   | número do Brasil com DDD; mesmo formato                                                                                     |
| E-mail             | não                   | e-mail válido; vazio significa "não possui"                                                                                 |
| Data de nascimento | sim                   | data passada, até 120 anos atrás; a ficha mostra a idade e o selo "menor de idade" quando houver                            |
| Gênero             | não                   | masculino, feminino, outro, prefere não informar                                                                            |
| Como conheceu      | não                   | Google, Instagram, Facebook, Indicação, Escola, Outdoor, Panfleto, Placa, Plano/Convênio, Rádio, TV, Revista, Outros        |
| Indicado por       | não                   | até 120 caracteres; o campo só aparece com "Indicação"                                                                      |
| Observações        | não                   | até 1.000 caracteres; só informações administrativas, com o aviso "Não registre informações de saúde aqui" no próprio campo |

Data de nascimento e os demais campos novos ficam **opcionais no banco**: o agendamento online (Etapa 3) cria pacientes só com nome, WhatsApp e e-mail. No painel, a ficha incompleta mostra o aviso "Cadastro incompleto" até alguém preencher.

## Decisões

- **Páginas próprias** (escolhido entre página, janela flutuante e painel lateral):
  - `/admin/pacientes` é a lista com busca.
  - `/admin/pacientes/novo` é o formulário de cadastro.
  - `/admin/pacientes/<id>` é a ficha, com edição e anonimização. O `<id>` é o UUID, que não é dado pessoal.
  - **Motivo:** funciona igual no celular, e a ficha ganha um lugar próprio para o histórico e, depois, o prontuário.
  - A janela flutuante foi descartada: no celular vira tela cheia de qualquer jeito e lembraria o sistema anterior.
- **Busca no servidor, fora da URL:** por nome (sem acento e sem diferença de maiúsculas), CPF ou telefone. O termo vai num POST e nunca aparece no endereço nem no histórico do navegador. Custo: ao voltar para a lista, a busca começa vazia.
- **Lista:** todos os pacientes em ordem alfabética, 50 por vez com "Carregar mais"; cada linha mostra nome, apelido, idade e WhatsApp. Pacientes anonimizados continuam na lista como "Paciente anonimizado", com a etiqueta discreta "Anonimizado", e abrem a ficha normalmente.
- **Máscaras:** CPF e WhatsApp (e telefone fixo) são formatados enquanto a pessoa digita (`000.000.000-00`, `(00) 00000-0000`) e aparecem formatados na ficha e na lista. O banco guarda só os dígitos (CPF) e o formato internacional (telefone).
- **Duplicidade:** o banco já recusa o mesmo WhatsApp com o mesmo nome; passa a recusar também o mesmo CPF. O formulário mostra o erro no campo, com link para a ficha que já existe.
- **Anonimizar:** opcional, só a pedido do titular (LGPD). Fica numa seção recolhida ("Anonimizar paciente (LGPD)") no fim da ficha, com confirmação digitada. Apaga todos os dados pessoais, troca o nome por "Paciente anonimizado" e mantém os agendamentos. É recusado enquanto o paciente tiver agendamento futuro solicitado ou confirmado. Depois de anonimizar, a pessoa continua na ficha, que mostra o aviso "Dados pessoais apagados em dd/mm/aaaa a pedido do titular (LGPD). O histórico de agendamentos é mantido." e não tem mais formulário de edição nem a seção de anonimizar.
- **Histórico de ações:** `patient.created`, `patient.updated` e `patient.anonymized`, com o id do paciente e, na edição, só os nomes dos campos alterados, nunca os valores.
- **Permissão:** todas as páginas e ações chamam `requireAdmin()`. Quando houver outros papéis, esta tela ganha a regra de quem pode ver.
- **Menu:** "Pacientes" entra no menu lateral do painel.

## Abordagens consideradas

| Abordagem                      | A favor                                              | Contra                                                                       | Escolha       |
| ------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------- | ------------- |
| Páginas próprias               | Celular, ficha com endereço, padrão das telas atuais | Um clique a mais para voltar à lista                                         | **Escolhida** |
| Janela flutuante sobre a lista | Cadastro rápido                                      | Vira tela cheia no celular; duas formas de editar; lembra o sistema anterior | —             |
| Lista com painel lateral       | Bom em tela grande                                   | Cai no formato de páginas no celular; mais complexo                          | —             |

## Banco de dados

Uma migração nova, só com acréscimos, sem apagar nada:

- Colunas novas em `patients`: `nickname`, `cpf`, `rg`, `landline_phone`, `birth_date` (date), `gender` (enum `patient_gender`), `referral_source` (enum `patient_referral_source`), `referred_by`, `notes`.
- Índice único parcial em `cpf` quando não nulo.
- CHECKs:
  - `cpf` com 11 dígitos;
  - telefone fixo no formato internacional;
  - tamanhos máximos;
  - `referred_by` só com `referral_source = 'referral'`.
- `patients_anonymized_check` passa a exigir também os campos novos nulos.

## Detalhes definidos na revisão do design

Decisões minhas (Claude), tomadas para responder às dúvidas de um revisor; podem ser revistas:

- **Banco sem dados reais:** nenhum ambiente tem pacientes reais ainda, então a migração não precisa preencher nada nem usar `NOT VALID`.
- **WhatsApp continua obrigatório também no banco:** a regra atual (telefone e nome normalizado presentes, salvo anonimizado) não muda. O agendamento online sempre informa o WhatsApp.
- **Interpretação da busca:**
  - Um termo só com números (ignorando pontos, traços, parênteses e espaços), com 3 dígitos ou mais, procura em CPF e telefones, por trecho.
  - Qualquer outro termo procura no nome e no apelido, por trecho, sem acento e sem diferença de maiúsculas.
  - Anonimizados aparecem na busca por nome (o nome vale "Paciente anonimizado", então buscar "anonimizado" os lista), na ordem alfabética dessa etiqueta. Como não têm CPF nem telefone, a busca por números não os encontra.
  - Sem índice especial: o volume de uma clínica não pede.
- **"Carregar mais":** a busca e a paginação são uma Server Action, com ordem por nome normalizado e desempate pelo id. O termo buscado nunca vai para log.
- **Duplicidade:**
  - O servidor confere antes de gravar e também trata o erro do banco, para o caso de duas gravações ao mesmo tempo.
  - O link para a ficha existente aparece só para quem está logado no painel.
  - Anonimizados não têm CPF nem telefone, então nunca entram em conflito.
- **Anonimização:**
  - Apaga também apelido, RG, telefone fixo, nascimento, gênero, como conheceu, indicado por e observações.
  - Para confirmar, a pessoa digita a palavra ANONIMIZAR.
  - Roda numa transação que trava a linha do paciente antes de conferir os agendamentos futuros.
  - Agendamentos futuros cancelados ou concluídos não impedem a anonimização.
- **Histórico de ações:** grava o id de quem fez a ação. Na edição, os campos alterados aparecem pelo nome usado no código (`birthDate`, `cpf`…), nunca os valores.
- **Datas:** idade, "menor de idade" e o limite de 120 anos são calculados no fuso da clínica (America/Sao_Paulo).

## Deixado para quem constrói

- Nomes internos de funções e arquivos, seguindo `src/modules/<domínio>`.
- Como normalizar o nome para a busca, desde que o mesmo cálculo valha na gravação e na busca.
- A máscara dos campos de CPF e telefone, desde que o valor gravado siga as regras acima.
