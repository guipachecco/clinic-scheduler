# Área da cliente e travas no banco

Desenho conversado com Guilherme em 05/11/2026. Base: multiclínica (`docs/multiclinica.md`), marca Zemana (`2026-11-05-marca-zemana-design.md`).

## Intenção

As clientes de cada dona (Karol, Sirlei, Karina, Grais) passam a entrar no sistema e marcar horário sozinhas. Com isso, o sistema passa a ter usuários vindos de fora, que se cadastram sozinhos. O isolamento entre clínicas, que hoje vive só no código, passa a ser garantido também pelo próprio banco, tanto para as clientes quanto para as donas. Cada tipo de acesso fica com o mínimo de permissão de que precisa.

## Objetivos

1. **Entrada da cliente:** cadastro, login e "esqueci minha senha" por e-mail, a partir do link da clínica.
2. **Marcar horário:** depois de entrar, a cliente escolhe o serviço, o dia e um horário livre. **Se o horário está vago, ele entra direto na agenda como confirmado.** _(Decisão de Guilherme.)_
3. **Meus horários:** a cliente vê os horários dela, futuros e passados, só para consulta.
4. **Travas no banco (caminho A):**
   - cada tipo de acesso usa um usuário próprio do PostgreSQL;
   - as tabelas ganham regras por linha (RLS): a dona só alcança a clínica dela, e a cliente só a ficha e os agendamentos dela;
   - a cliente não alcança tabela nenhuma do financeiro.
5. **Visual Zemana** com o nome da clínica, pensado primeiro para o celular. _(Decisão de Guilherme.)_

## Fora do escopo

- A cliente cancelar ou remarcar. **Só a dona desmarca.** _(Decisão de Guilherme.)_ A cliente fala com a dona para mudar.
- Lembretes e avisos por e-mail ou WhatsApp sobre o agendamento. Fora o e-mail de senha e o de confirmação de cadastro, nada é enviado.
- Marca própria por clínica (fica com a Zemana), anamnese, pagamento online, NFS-e.
- A cliente editar a própria ficha depois do cadastro.

## Anti-objetivos

- **Vazar dados de outra pessoa:** a cliente nunca vê nome, telefone ou serviço de outra cliente, nem pela tela, nem por erro, nem pela resposta de uma chamada. Dos outros horários, ela só sabe que estão ocupados.
- **RLS que não trava de verdade:**
  - os usuários do app não podem ser donos das tabelas nem ter `BYPASSRLS`;
  - as tabelas usam `FORCE ROW LEVEL SECURITY`;
  - sem a clínica informada, o banco devolve nada, nunca tudo.
- **Quebrar o painel:** tudo o que a dona e o root fazem hoje continua funcionando igual.
- **Marcar duas pessoas no mesmo horário:** a agenda continua protegida pela trava que já existe (`appointments_no_overlap` e `lockAgenda`).

## Restrições

- Next.js 16, Better Auth, Drizzle e PostgreSQL 17 como já usados. Produção planejada: Vercel e Neon, que aceitam usuários e RLS do Postgres.
- O 2FA continua obrigatório para dona e root. **A cliente não usa 2FA.**
- Textos da tela em português; código em inglês; `corepack pnpm`.
- Os ajustes que já existem por clínica valem para o online:
  - antecedência mínima (`minAdvanceMinutes`, 2 h);
  - até quantos dias à frente (`maxAdvanceDays`, 60);
  - passo dos horários (`slotStepMinutes`, 30);
  - limite de horários ativos por cliente (`maxActiveAppointmentsPerPhone`, 2);
  - liga/desliga da clínica (`clinics.onlineBookingEnabled`);
  - liga/desliga por serviço (`services.onlineBookingEnabled`);
  - forma de mostrar o preço (`priceDisplay`).

## Caminhos considerados

| Caminho                                                                             | Resultado                                                                        |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **A. RLS e usuário de banco por tipo de acesso, para donas e clientes (escolhido)** | Trava de verdade nos dois lados. Mexe na forma como todo módulo fala com o banco |
| B. RLS só na área da cliente                                                        | Metade do trabalho, mas não atende "faz para a dona também"                      |
| C. Só código e mais testes                                                          | Não protege se uma consulta esquecer o filtro                                    |

Guilherme escolheu o A em 05/11/2026.

## Como fica

### Quem é quem

- O papel `client` é novo, ao lado de `admin` (dona) e `root`. A regra `users_role_clinic_check` muda:
  - `root` não tem clínica;
  - `admin` tem clínica;
  - `client` não tem clínica na conta, porque a ligação fica na ficha.
- **A cliente se liga à clínica pela ficha de paciente:** `patients.user_id` (pode ficar vazio), único por clínica. **Um login só para várias clínicas:** quem é cliente da Karol e da Sirlei tem duas fichas, uma em cada clínica, ligadas à mesma conta.

### Link e cadastro

- **Link da clínica:** `/<slug>`, por exemplo `/karol-pacheco`, que a dona divulga. Nomes usados pelo sistema (`admin`, `api`, `entrar`, `marca`, `_next`…) ficam proibidos como slug.
  - Clínica desativada ou com o online desligado: a página mostra "Agendamento online indisponível" e o contato da clínica (WhatsApp e e-mail, se houver).
  - Slug que não existe: página não encontrada.
- **Cadastro:** nome, celular (WhatsApp), e-mail e senha, com a mesma regra de senha do painel.
- **Confirmação de e-mail:** a conta só marca horário depois de confirmar o e-mail pelo link enviado. _(Decisão minha: o e-mail é o único caminho de recuperar a senha, então precisa estar certo.)_
- **Esqueci minha senha:** link por e-mail, que vale por pouco tempo (o padrão do Better Auth) e encerra as outras sessões.
- **Sessão da cliente:** dura 30 dias, e ela não precisa entrar toda vez. _(Decisão minha.)_ A sessão da dona continua de 12 h.
- **Limite de tentativas:** cadastro, login, reenvio de confirmação e "esqueci a senha" têm limite por IP, como o login do painel. A resposta do "esqueci" é sempre a mesma, exista ou não a conta.
- **Ficha da cliente:** ver "Ficha que já existe" abaixo.

### Marcar

1. **Serviço:** a cliente escolhe entre os serviços ativos com `onlineBookingEnabled`. Cada um mostra o nome, a duração e o preço conforme o `priceDisplay`. O serviço "flexível" não aparece.
2. **Dia:** um calendário de hoje até `maxAdvanceDays`. Dias sem nenhum horário livre aparecem apagados.
3. **Horário:** os horários livres do dia, de `slotStepMinutes` em `slotStepMinutes`. Um horário livre precisa cumprir quatro condições:
   - fica dentro do expediente;
   - não cai em bloqueio ou feriado;
   - não encosta em outro atendimento, considerando a duração e as folgas antes e depois (`buffer`);
   - respeita a antecedência mínima.

   **O cálculo dos horários livres ainda não existe no código** e é parte deste trabalho.

4. **Confirmar:** cria o agendamento com `status = confirmed` e `source = online`, dentro do `lockAgenda`, e registra no histórico com autor `patient`.
   - **Horário tomado:** se alguém pegou o horário um segundo antes, a cliente vê "Esse horário acabou de ser preenchido" e volta à lista atualizada.
   - **Limite de horários:** se ela já tem o limite de horários ativos, vê o aviso e não marca.
   - **Aprovação do serviço:** o campo `services.requiresApproval` **não vale para o online**. Horário vago entra direto, como Guilherme decidiu, e o campo some da tela de serviços. _(Decisão minha, decorrente da dele.)_
5. **Depois de marcar:** a cliente vê a confirmação com dia, hora, serviço e endereço da clínica, e as instruções de preparo, se o serviço tiver. Na agenda, a dona vê o horário marcado como "online".

### Meus horários

- **Lista:** os próximos horários primeiro, depois os passados, só da clínica do link aberto.
- **Sem ações:** não há botão de cancelar nem de remarcar, só o texto "Para desmarcar ou mudar, fale com <clínica>" e o WhatsApp da clínica.
- **Desmarcados:** os desmarcados pela dona aparecem como "Desmarcado".

### Travas no banco

**Usuários do PostgreSQL:**

| Usuário                            | Usado por                                       | Pode                                                                                                   |
| ---------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `clinic` (atual, dono das tabelas) | Só as migrações                                 | Tudo                                                                                                   |
| `app_auth`                         | Better Auth                                     | Só as tabelas de login: `users`, `sessions`, `accounts`, `verifications`, `two_factors`, `rate_limits` |
| `app_panel`                        | Painel da dona e do root dentro de uma clínica  | Tabelas da clínica, sempre filtradas pela clínica da requisição                                        |
| `app_client`                       | Área da cliente                                 | Pouco: veja abaixo                                                                                     |
| `app_platform`                     | Tela de clínicas do root e o `scripts/admin.ts` | Criar e listar clínicas e contas de dona, sem filtro de clínica                                        |

- Cada um tem a própria URL de conexão no ambiente (`DATABASE_URL_AUTH`, `_PANEL`, `_CLIENT`, `_PLATFORM`). `DATABASE_URL` fica para as migrações.
- Uma migração cria os usuários e as permissões, e as senhas vêm do ambiente.
- No `docker-compose`, as senhas de desenvolvimento ficam fixas, como hoje.

**Como o banco sabe quem está pedindo:**

- Toda chamada ao banco da dona ou da cliente roda dentro de uma transação que começa com `set_config('app.clinic_id', …, true)`. Na cliente, entram também `app.patient_id` e `app.user_id`.
- Como o ajuste vale só para a transação, funciona com o pool do Neon.
- As funções dos módulos, que já recebem `clinicId`, passam a receber essa transação.

**Regras da dona (`app_panel`):**

- Em toda tabela que tem `clinic_id`: `clinic_id = current_setting('app.clinic_id', true)::uuid`, tanto para ler quanto para gravar.
- Sem o ajuste, o resultado é vazio.
- O root dentro de uma clínica é igual à dona daquela clínica.

**Regras da cliente (`app_client`)**, para ler:

- `clinics`: só a clínica do link, e só as colunas públicas (nome, endereço, contatos, ajustes de agendamento).
- `services`: os ativos e online da clínica, só as colunas públicas.
- `patients`: só a própria ficha (`id = app.patient_id`).
- `appointments`: só os próprios (`patient_id = app.patient_id`).
- **Expediente, bloqueios e horários ocupados:** a cliente lê por uma função do banco, `SECURITY DEFINER`, que recebe clínica e período e devolve só início e fim dos intervalos ocupados ou bloqueados, sem nome, serviço ou motivo. A cliente não tem acesso direto às tabelas de bloqueio nem aos agendamentos dos outros.
- Nenhum acesso a financeiro (orçamentos, vendas, parcelas, pagamentos, despesas, caixa), histórico, mídia ou contas de outras pessoas.

**Regras da cliente (`app_client`)**, para gravar:

- **Inserir agendamento:** só com `patient_id = app.patient_id`, `clinic_id = app.clinic_id`, `source = 'online'` e `status = 'confirmed'`. Não pode alterar nem apagar.
- **Inserir a própria ficha no cadastro:** com `user_id = app.user_id`.
- **Inserir registro no histórico** com autor `patient`.

**Teste de cobertura:** um teste lê o catálogo do Postgres e falha se alguma tabela com `clinic_id` não tiver RLS ligado e forçado, ou se algum usuário do app for dono de tabela ou tiver `BYPASSRLS`. Assim, uma tabela nova sem regra não passa.

### E-mail

- **Envio isolado:** um módulo pequeno de envio (`sendEmail`).
  - **Em produção:** Resend, com `RESEND_API_KEY` e `EMAIL_FROM`. Guilherme cria a conta e configura o domínio.
  - **Em desenvolvimento e nos testes:** nada sai. Os e-mails ficam gravados numa pasta local, de onde o teste no navegador lê o link.
- **Dois e-mails:** confirmação de cadastro e troca de senha. Ambos em português, com o logo Zemana e o nome da clínica.

### Visual

- **Cabeçalho:** logo Zemana horizontal, com o nome da clínica abaixo.
- **Layout:** uma coluna, pensada para 360 px.
- **Fluxo:** passos claros (serviço → dia → horário → confirmar) e botões grandes.
- **Tema:** as mesmas cores, fontes e modo escuro do resto do sistema.
- **Páginas:**
  - `/<slug>`: entrada, com marcar, entrar e cadastrar;
  - `/<slug>/cadastro`, `/<slug>/entrar` e `/<slug>/esqueci-senha`;
  - `/<slug>/marcar`;
  - `/<slug>/meus-horarios`.

  Os nomes exatos das rotas ficam com quem constrói.

- **Site público `/`:** continua como está.

## Testes que precisam existir

- **Integração, com usuários reais do Postgres:**
  - `app_panel` com a clínica A não lê nem grava linhas da B;
  - sem `app.clinic_id`, o resultado é vazio;
  - `app_client` recebe "permissão negada" no financeiro;
  - `app_client` não lê a ficha nem os agendamentos de outra cliente da mesma clínica;
  - a função de ocupados não devolve nomes;
  - a cliente não insere agendamento para outra pessoa nem com outro status;
  - o teste de cobertura do catálogo.
- **Agendamento online:**
  - dois pedidos ao mesmo tempo para o mesmo horário: um entra e o outro recebe "acabou de ser preenchido";
  - limite de horários ativos;
  - antecedência mínima;
  - a agenda aberta só até `maxAdvanceDays` à frente;
  - serviço ou clínica com o online desligado.
- **Horários livres:** testes de unidade do cálculo (expediente, bloqueio, folgas, feriado, passo, fuso de São Paulo).
- **No navegador:**
  - cadastro;
  - confirmação do e-mail pela pasta local;
  - marcar um horário que aparece na agenda da dona;
  - esqueci a senha;
  - cliente da Karol abrindo o link da Sirlei entra sem ver os horários da Karol;
  - nada de rolagem lateral em 360 px.
- **Painel:** todos os testes atuais continuam passando com o painel rodando como `app_panel`.

## Decisões de construção (minhas, depois da revisão)

- **Quem descobre clínica e ficha:** antes de ligar o RLS, o servidor chama duas funções `SECURITY DEFINER`, com permissão dada só ao `app_client`:
  - `client_context(slug, user_id)` devolve `clinic_id` e `patient_id`, ou vazio;
  - `register_client_patient(...)` cria a ficha da cliente naquela clínica.

  O `user_id` vem sempre da sessão do Better Auth no servidor, nunca do navegador.

- **Cadastro seguro:**
  - o cadastro é uma Server Action própria, que grava `role = 'client'` no servidor; os campos `role` e `clinicId` continuam `input: false`;
  - o endpoint público `/sign-up/email` segue desligado;
  - uma conta `client` que abra `/admin` cai em página não encontrada (o `requireAdmin` já faz isso).
- **Outra clínica:** se a cliente já tem conta e abre o link de outra clínica, ela entra com o mesmo login e confirma nome e celular. Isso cria a ficha naquela clínica.
- **E-mail sem confirmar:** a cliente consegue entrar, mas ainda não marca. Ela vê "Confirme seu e-mail" e um botão de reenviar.
- **Duração da sessão por papel:** um gancho na criação da sessão (`databaseHooks.session.create.before`) ajusta a validade: 30 dias para `client` e 12 h para `admin` e `root`.
- **Limite de horários ativos:** conta por ficha da cliente, que é o que ela controla. O campo continua com o nome atual.
- **Slug:** `clinics.slug` já existe e é único. A migração confere se nenhuma clínica atual usa um nome reservado, e a criação de clínica passa a recusar esses nomes.
- **Root dentro de uma clínica:** usa `app_panel`, com `app.clinic_id` da clínica escolhida.
- **Tabelas de login:** o `app_auth` lê e grava `users` e `sessions` sem RLS, porque o login precisa disso. O `app_panel` e o `app_client` não têm permissão nenhuma nessas tabelas.
- **Agenda:** é uma por clínica, sem profissionais separados, como hoje (o `lockAgenda` é por clínica).
- **Histórico:** o autor `patient` já existe em `audit_actor_type`.

## Ficha que já existe: a dona confirma _(decisão de Guilherme)_

Quando a cliente se cadastra (ou entra numa clínica nova) com um celular que já está numa ficha daquela clínica sem conta ligada:

1. **Ficha provisória:** a cliente ganha uma ficha provisória, ligada à conta dela. Ela já pode marcar por essa ficha e só vê o que marcou por ela.
   - A ficha provisória não conta na regra de "nome e celular únicos por clínica" enquanto estiver pendente.
   - Quem constrói escolhe como (por exemplo, índice parcial e um campo de vínculo pendente).
2. **Aviso no painel:** a dona vê "<nome> se cadastrou online. É a mesma pessoa desta ficha?". O aviso aparece no início do painel e na ficha existente.
3. **"É a mesma":**
   - os agendamentos e o histórico da provisória passam para a ficha existente, e a conta da cliente fica ligada a ela;
   - a provisória some;
   - a cliente passa a ver também os horários antigos.
4. **"Não é":**
   - a provisória vira uma ficha comum;
   - se o nome e o celular forem iguais aos da outra ficha, o painel pede que a dona ajuste o nome antes de concluir.
5. **O que conta como "mesmo celular":** o celular em E.164 igual, qualquer que seja o nome.
6. **Sem aviso:** sem ficha com aquele celular, a cliente ganha uma ficha comum direto, e não aparece aviso nenhum.
7. **Segurança:** a cliente nunca vê nada da ficha existente antes de a dona confirmar.

Nos testes, isso ganha quatro casos:

- cadastro com celular já existente gera a ficha provisória e o aviso;
- antes de a dona confirmar, a cliente não vê os horários antigos;
- "é a mesma" junta os horários das duas fichas;
- "não é" mantém as fichas separadas.

## O que fica para quem construir

- Os nomes exatos das rotas, das funções e das variáveis de ambiente.
- A ordem das migrações e como dividir a troca do painel para `app_panel` em partes que se testam.
- O desenho exato das telas, dentro do visual Zemana.
- Como guardar os e-mails locais em desenvolvimento.
- Atualizar `docs/multiclinica.md`, `docs/decisoes-tecnicas.md`, o README e o `.env.example`, com o novo roteiro de publicação dos usuários de banco.
