# Decisões técnicas

Escolhas feitas durante a implementação que não estavam detalhadas no [planejamento](planejamento-etapa-1.md). Cada item diz o que foi decidido, por quê e o que muda se um dia for revisto.

## Etapa 2: fundação

### Páginas renderizadas a cada acesso, com CSP por nonce

- **Decisão:** todas as páginas são geradas no servidor a cada requisição, e a Content Security Policy usa um nonce novo por requisição (`src/proxy.ts`). O recurso Cache Components do Next.js 16, que vem ligado no modelo inicial, ficou desligado.
- **Motivo:** com o nonce, o navegador só executa os scripts que o próprio servidor marcou, o que barra scripts injetados. Isso importa num painel com dados de pacientes. O Cache Components pré-gera parte das páginas no build, e uma página pré-gerada não tem como carregar o nonce de cada acesso.
- **Consequência:** nenhuma página fica em cache estático. Para o volume de uma clínica o custo é desprezível, e a agenda precisa estar sempre atualizada de qualquer forma. Religar o Cache Components exigiria trocar a CSP por uma sem nonce (`'unsafe-inline'`) ou pela opção experimental de hashes (SRI).

### Verificação em duas etapas obrigatória

- **Decisão:** toda conta do painel precisa de 2FA por aplicativo autenticador (TOTP). Depois da senha, uma conta sem 2FA só consegue abrir a tela de configuração (`requireAdmin` em `src/modules/auth/session.ts`). São gerados 10 códigos de recuperação de uso único.
- **Motivo:** o Better Auth oferece 2FA, mas não obriga. Uma senha vazada não deve bastar para ver dados de pacientes.
- **Consequência:** desativar o 2FA pelo site está bloqueado; a remoção, para o caso de celular perdido, é feita no terminal com `pnpm admin reset-2fa <email>`. A opção "confiar neste dispositivo" não foi oferecida, então todo login pede o código. Ela pode ser ligada depois, se o uso diário pedir.

### Sessões e rotas de autenticação

- **Decisão:** cada sessão termina 12 horas depois do login, mesmo com uso contínuo; não há cache de sessão em cookie, e a sessão é conferida no banco a cada página e ação do painel. As rotas do Better Auth que o painel não usa estão desligadas (`disabledPaths` em `src/lib/auth.ts`): cadastro, login social, recuperação de senha por e-mail, troca de e-mail, exclusão de conta e desativação do 2FA, entre outras.
- **Motivo:** menos rotas expostas, menos superfície de ataque; consultar o banco a cada acesso faz uma sessão encerrada perder o acesso na hora.
- **Consequência:** a recuperação de senha é feita pelo terminal (`pnpm admin reset-password <email>`). A recuperação por e-mail pode voltar quando houver e-mail configurado.

### Contas criadas pelo terminal

- **Decisão:** `pnpm admin` cria contas, troca senhas e remove o 2FA. A senha é digitada sem aparecer na tela e nunca é passada como argumento, para não ficar no histórico do terminal. Cada operação é registrada em `audit_logs`.
- **Motivo:** o site não tem cadastro público, e a conta inicial precisa nascer de algum lugar controlado.

### Limite de tentativas guardado no PostgreSQL

- **Decisão:** em produção, o login aceita até 5 tentativas por minuto por IP, e as rotas de 2FA, 3 a cada 10 segundos. A contagem fica na tabela `rate_limits`.
- **Motivo:** na hospedagem serverless cada requisição pode cair numa instância diferente; contar em memória não funcionaria. O PostgreSQL evita mais um serviço, como o Redis.
- **Consequência:** a tabela guarda o IP de quem tenta entrar. O IP é dado pessoal, guardado só para segurança; o Better Auth apaga as linhas vencidas quando a contagem reinicia, e a rotina de retenção (Etapa 3) vai limpar o que sobrar.

### Logs sem dados pessoais

- **Decisão:** o logger (`src/lib/logger.ts`) grava JSON, descarta campos sensíveis (nome, telefone, e-mail, senha, token, cookie, IP e outros) e mascara e-mails e telefones que apareçam em textos. Em produção, tudo o que passa pelo console, inclusive os erros do próprio Next.js, recebe o mesmo filtro.
- **Motivo:** os erros do Drizzle trazem na mensagem os valores da consulta, e os erros do PostgreSQL podem trazer o valor duplicado (por exemplo, um telefone). Sem o filtro, um erro inesperado gravaria dados de paciente no log da hospedagem.
- **Consequência:** a regra continua sendo registrar só IDs, status e contagens. O filtro é uma rede de proteção: nomes soltos no meio de um texto, por exemplo, não têm como ser reconhecidos.

### Modelo do banco

- IDs UUID gerados pelo PostgreSQL em todas as tabelas, inclusive nas do Better Auth.
- Tabelas e colunas em `snake_case`; status, origens e tipos como enums do PostgreSQL.
- `clinic_settings` tem uma linha só, criada pela migração, com o conteúdo do site vazio e o agendamento online desligado até a clínica configurar. As regras começam com os padrões do planejamento: 2 horas de antecedência, 60 dias à frente, 24 horas para cancelar e horários de 30 em 30 minutos. O limite de 2 agendamentos ativos por telefone foi definido agora e pode ser ajustado.
- Serviços nascem inativos e só aparecem no site quando a clínica os ativa.
- Restrições `CHECK` garantem faixas válidas: duração de 5 a 720 minutos, preparo e limpeza até 240 minutos, telefone no formato internacional e imagens de até 2 MB em JPEG, PNG ou WebP.
- A anonimização de um paciente apaga todos os campos pessoais e troca o nome pelo rótulo "Paciente anonimizado"; uma restrição impede anonimizar pela metade.

### Testes com PostgreSQL de verdade

- **Decisão:** os testes de integração e de ponta a ponta rodam contra um PostgreSQL real, num banco recriado a cada execução, e o teste de concorrência dispara vários pedidos simultâneos para o mesmo horário.
- **Motivo:** a proteção contra horários duplicados está no banco; um banco simulado não provaria nada.

### Ferramentas

- Node.js 24 LTS na CI; o projeto aceita a partir da 22.12.
- Projeto em ESM (`"type": "module"`) e ESLint 10, já que o ESLint 9 deixou de receber suporte.
- Fontes Bricolage Grotesque (títulos) e Figtree (texto) vindas dos pacotes `@fontsource-variable`, servidas pelo próprio app: nenhuma requisição externa no site e nenhum download no build.
- Dependabot espera 3 dias antes de sugerir uma versão recém-publicada, o que evita a maioria dos pacotes comprometidos e retirados logo após a publicação. Alertas e correções de segurança dependem das configurações do repositório no GitHub e não esperam esse prazo.

### Identidade visual

As cores, as fontes e os logos aprovados da clínica estão descritos em [identidade-visual.md](identidade-visual.md). Os tokens ficam em `src/app/globals.css`, incluindo o token `highlight` (amarelo, usado só como destaque sobre o azul-marinho, nunca como texto em fundo claro), e os logos em `public/marca/`.

### Tema escuro

- **Decisão:** um botão no menu do painel e nas telas de acesso alterna entre o tema claro e o escuro (preto e ciano, a versão escura da marca). A escolha fica num cookie `theme`, e o layout raiz o lê para renderizar a classe `dark` no `<html>`. O padrão é o tema claro.
- **Motivo:** com o cookie, o servidor já entrega a página no tema certo, sem piscar e sem script inline, que a CSP com nonce barraria.
- **Consequência:** a preferência do sistema operacional não é seguida automaticamente; a pessoa escolhe uma vez no botão. Os logos com fundo sólido existem nas duas versões e o CSS mostra a do tema ativo.

## Cadastro de pacientes

- **Busca fora da URL:** o termo da busca viaja no corpo de uma Server Action (POST), nunca na barra de endereço. A página continua em `/admin/pacientes`, então nome, telefone ou CPF não ficam no histórico do navegador, nos logs do servidor nem em links copiados. A busca também não é gravada em log.
- **Páginas sem dados pessoais no título:** a ficha do paciente usa o título "Paciente", porque o título vai para o histórico do navegador.
- **Erros genéricos:** um erro inesperado do banco pode conter valores do paciente; cada ação do servidor devolve uma mensagem genérica (por exemplo, "Não foi possível salvar. Tente novamente.") e nada é registrado em log.
- **Campos de auditoria:** criar, editar e anonimizar gravam em `audit_logs` quem fez (`actor_user_id`), quando e qual ação. Na edição, `changes` guarda só os nomes dos campos alterados, nunca os valores.
- **Anonimização:** o botão só habilita depois de digitar exatamente `ANONIMIZAR`, e o servidor confere de novo. Pacientes com agendamentos futuros solicitados ou confirmados não podem ser anonimizados. Depois de anonimizado, o paciente sai da lista por padrão, para não confundir a dona da clínica, e volta pela caixa "Mostrar anonimizados" como "Paciente anonimizado" (com a etiqueta "Anonimizado"); a ficha mostra o aviso de dados apagados, sem edição.
- **Acesso:** toda página e toda ação do servidor chama `requireAdmin()` antes de qualquer consulta.

### Coleta ampliada no painel

- **Decisão:** a pedido da clínica, o cadastro do painel ampliou a coleta mínima do planejamento: além de nome, WhatsApp e e-mail, guarda CPF, RG, nascimento, gênero, como conheceu, indicado por e observações administrativas. O formulário público de agendamento continua com a coleta mínima.
- **Motivo:** a recepção precisa identificar o paciente e registrar a origem dos contatos no dia a dia.
- **Consequência:** o risco de dado sensível aumenta, principalmente no campo de observações. As mitigações são: o aviso no campo de observações, nenhum dado pessoal em URLs ou logs, a anonimização completa e registros de auditoria só com nomes de campos.

### Para a agenda

- Agendar ou remarcar deve travar a linha do paciente (`SELECT … FOR SHARE` ou `FOR UPDATE`) e recusar quando `anonymized_at` não for nulo. O `FOR UPDATE` da anonimização só atrasa a verificação da chave estrangeira; ele não a rejeita.
- `appointments.cancellation_reason` é texto livre e a anonimização não o limpa. A agenda deve mantê-lo sem dados pessoais ou limpá-lo ao anonimizar.

## Serviços

- **Endereço estável ao renomear:** o `slug` de serviços e categorias é gerado do nome na criação e nunca muda depois. Renomear altera só o texto exibido, então links e referências futuras (site público, agendamentos) continuam válidos.
- **Nada é apagado:** não há botão de excluir serviço nem categoria. Para tirar algo de uso, desmarque "Ativo". Assim os agendamentos antigos continuam apontando para o serviço que foi marcado.
- **Serviço flexível:** "Avaliação / encaixe" (categoria "Outros") é criado pela migração e serve para encaixes que não cabem em nenhum serviço do catálogo. Na agenda (entrega 3 de [docs/agenda.md](agenda.md)), a duração e um rótulo curto são definidos na hora do agendamento; a tela do serviço já mostra esse aviso. O painel nunca edita a marca `is_flexible`.
- **Preço em centavos:** o valor é guardado como inteiro (`price_cents`) e a "forma de exibir" (fixo, a partir de, sob consulta, oculto) decide o que aparece. Preço fixo e "a partir de" exigem valor.
- **Auditoria e erros:** criar e editar gravam em `audit_logs` só o nome dos campos alterados. Erros inesperados viram a mensagem genérica "Não foi possível salvar. Tente novamente.".
- **Acesso:** toda página e toda ação do servidor chama `requireAdmin()` antes de qualquer consulta.

## Expediente e bloqueios

- **Fuso horário da clínica:** `America/Sao_Paulo`, definido por uma constante no código (`CLINIC_TIME_ZONE`). A coluna `clinic_settings.timezone` existe com o mesmo valor padrão, mas ainda não é lida; quando a clínica precisar de outro fuso, a constante passa a vir dela. Todo instante é guardado em UTC (`timestamptz`) e o expediente é guardado como hora local (`time`).
- **Biblioteca de fuso:** Luxon, para converter hora local em UTC e o contrário sem somar 24 horas fixas, já que o fuso pode ter dias de 23 ou 25 horas.
- **Bloqueio de dia inteiro:** vai da meia-noite local do primeiro dia até a meia-noite local do dia seguinte ao último dia (o último dia entra inteiro).
- **Feriados nacionais:** o botão cria, para o ano escolhido, os 10 feriados nacionais (9 de data fixa e a Sexta-feira Santa, Páscoa menos 2 dias) como bloqueios de dia inteiro do tipo "Feriado". Um feriado é pulado quando já existe um bloqueio do tipo "Feriado" começando naquela data local, então clicar duas vezes não duplica nada. Feriados estaduais, municipais e pontos facultativos são cadastrados à mão como bloqueios.
- **Conflitos só avisam:** criar um bloqueio sobre atendimentos `requested` ou `confirmed` funciona e lista os horários afetados (dd/MM HH:mm, sem nome de paciente). Nada é cancelado ou remarcado automaticamente; a dona da clínica decide.
- **Até 6 intervalos por dia:** limite do formulário e do servidor, para manter a tela legível. Os intervalos do mesmo dia não podem se sobrepor.
- **Exclusão:** só bloqueios que ainda não começaram podem ser excluídos; os passados e em andamento ficam como histórico. Títulos de bloqueio não vão para `audit_logs`, e o campo avisa para não registrar dados de pacientes.
- **Acesso:** toda página e toda ação do servidor chama `requireAdmin()` antes de qualquer consulta.

## Agenda

- **Ordem das travas:** toda escrita (criar, editar, remarcar, mudar o status) roda numa transação que pega, nesta ordem, a trava consultiva `pg_advisory_xact_lock` com uma chave fixa da agenda, a linha do paciente `FOR SHARE` e, nas alterações, a linha do atendimento `FOR UPDATE`; só depois lê o serviço, grava e registra a auditoria. A ordem fixa evita impasses entre duas escritas. A trava consultiva enfileira as escritas da agenda, e a restrição de exclusão do banco (`appointments_no_overlap`) continua como a última palavra contra sobreposição.
- **Avisos e recusas:** fora do expediente, sobre um bloqueio e no passado são avisos: a ação devolve os avisos sem gravar nada, e a dona da clínica confirma com "Agendar mesmo assim". Sobreposição com outro atendimento, paciente anonimizado, serviço inativo e atendimento que não está mais solicitado ou confirmado são recusas, sem confirmação possível. A mensagem de sobreposição mostra só os horários do outro atendimento, nunca o paciente.
- **Envio repetido:** o formulário de novo agendamento gera no navegador, ao abrir, uma chave de idempotência. Um segundo envio com a mesma chave (clique duplo, nova tentativa depois dos avisos) devolve o atendimento já criado, mas só quando paciente, serviço e início são os mesmos; com outros dados, a ação pede para recarregar a página. A chave não é gerada no servidor porque o Voltar do navegador reaproveita a página já carregada.
- **Preparo e intervalo recalculados:** o intervalo ocupado (`occupied_from` e `occupied_until`) soma o preparo antes e o intervalo depois do serviço. Ele é recalculado com os valores atuais do serviço a cada remarcação ou troca de serviço, então uma mudança no catálogo vale a partir da próxima alteração de cada atendimento e não mexe nos que já estão marcados.
- **Calendário no fuso da clínica:** o FullCalendar usa o plugin `@fullcalendar/luxon3` com `timeZone: "America/Sao_Paulo"`, então a grade, o arrastar e o clique num horário seguem o fuso da clínica qualquer que seja o fuso do navegador. Os eventos chegam por uma Server Action com o período visível no corpo do pedido, nunca na URL.
- **Fora da grade:** as visões Dia e Semana mostram só as horas do expediente (do início mais cedo ao fim mais tarde; 07:00 a 20:00 sem expediente). Um atendimento marcado fora dessas horas aparece nas visões Mês e Lista, mas pode ficar fora da grade de Dia e Semana.
- **Setas em texto:** a fonte de ícones do FullCalendar é bloqueada pela CSP (`font-src`), então os botões de período anterior e próximo usam setas em texto.
- **Status com paciente anonimizado:** criar, editar e remarcar recusam paciente anonimizado, mas confirmar, concluir, marcar falta e cancelar continuam permitidos nos atendimentos passados dele, para que o histórico possa ser corrigido. Esses registros não têm dados pessoais.
- **Cancelamento só com código:** o motivo do cancelamento é um código de uma lista fechada (pedido do paciente, remarcado, clínica indisponível, outro), sem texto livre, e `audit_logs` guarda só ids, instantes, durações e códigos.
- **Bloqueios sem a trava da agenda:** as escritas de bloqueio não pegam a trava consultiva da agenda. Se um bloqueio e um atendimento forem confirmados no mesmo instante, um pode não enxergar o outro, e o aviso de bloqueio some. Isso afeta só avisos, nunca recusas: a sobreposição entre atendimentos continua barrada pela trava e pela restrição de exclusão.
- **Acesso:** toda página e toda ação do servidor chama `requireAdmin()` antes de qualquer consulta, e as ações devolvem o resultado em vez de redirecionar. O único redirecionamento que sobra é o do próprio `requireAdmin()`, que manda uma sessão expirada para a tela de login.

## Área da cliente e travas no banco

- **Um usuário do PostgreSQL para cada parte do app:** `app_auth` (login), `app_panel` (painel), `app_client` (área da cliente) e `app_platform` (clínicas do root e `pnpm admin`), criados pela migração `0011`. O `DATABASE_URL` do dono das tabelas fica só para migrações e testes. Assim, um erro de filtro no código não mostra dados de outra clínica: o banco recusa por conta própria (row-level security). Detalhes em [Várias clínicas](multiclinica.md#usuários-do-banco).
- **Sem `FORCE ROW LEVEL SECURITY`:** o FORCE também prende o dono das tabelas, que roda as migrações e, no Neon, não é superusuário; as migrações de dados deixariam de enxergar as linhas. Em troca, os testes conferem que nenhum usuário do app é dono de tabela nem tem `BYPASSRLS`, e o `pnpm db:migrate` para se algum deles tiver privilégio a mais.
- **Ajuste por transação:** a clínica (e, na área da cliente, a ficha e a conta) vai no `set_config(..., true)` da própria transação, então funciona com o pool de conexões do Neon e nunca vaza para o próximo pedido.
- **A cliente lê pouco:** ela não lê o expediente, os bloqueios nem os agendamentos das outras pessoas. Funções do banco (`SECURITY DEFINER`, migração `0013`) devolvem só o necessário: o início e o fim dos horários ocupados e o expediente da semana.
- **Agendamento online confirmado na hora:** o horário vago entra como `confirmed`, com origem `online` e autor `patient` no histórico. O campo `services.requires_approval` não vale para o online e saiu da tela de serviços; a coluna continua no banco. Na agenda da dona, o atendimento aparece marcado "Online".
- **Sessões:** 30 dias para a cliente, 12 horas para dona e root. A cliente não usa 2FA.
- **E-mails:** confirmação de cadastro e troca de senha saem pela MailerSend em produção (`MAILERSEND_API_KEY` e `EMAIL_FROM`). Sem a chave, cada e-mail vira um arquivo JSON em `EMAIL_OUTBOX_DIR` (padrão `.emails/`, fora do Git), e nada sai da máquina.
- **Ficha que já existe:** um cadastro online com o celular de uma ficha da clínica gera uma ficha provisória (`patients.pending_link_patient_id`), que fica fora da regra de nome e celular únicos enquanto a dona não decide. "É a mesma" (`confirmLink` em `src/modules/patients/links.ts`) move os agendamentos, os orçamentos, as vendas e o histórico para a ficha antiga, liga a conta a ela e apaga a provisória, numa transação só. Orçamentos e vendas vão junto em vez de bloquear a junção, para nada se perder se a dona já tiver aberto algum na ficha nova. Para mover o histórico, o `app_panel` pode mudar só a coluna `entity_id` de `audit_logs` (migração `0015`); o resto do histórico continua sem alteração. "Não é" (`rejectLink`) transforma a provisória numa ficha comum e, se o nome e o celular repetirem os da ficha antiga, pede para a dona mudar o nome antes.
