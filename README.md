# Clinic Scheduler

Sistema web de agendamentos para uma clínica de biomedicina: site institucional, agendamento online pelo paciente e painel administrativo para a profissional.

## Status

| Etapa | Descrição                                                    | Situação                                                                 |
| ----- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 1     | Planejamento: requisitos, stack, arquitetura, banco e riscos | Concluída ([docs/planejamento-etapa-1.md](docs/planejamento-etapa-1.md)) |
| 2     | Fundação: projeto, banco, autenticação, testes e CI          | Em revisão ([decisões técnicas](docs/decisoes-tecnicas.md))              |
| 3     | MVP: site, serviços, agendamento e painel                    | Em andamento ([agenda](docs/agenda.md))                                  |
| 4     | Qualidade: testes dos fluxos, segurança e responsividade     | A fazer                                                                  |
| 5     | Publicação: produção, domínio, backups e monitoramento       | A fazer                                                                  |

O que já funciona: login do painel com verificação em duas etapas obrigatória, cadastro de pacientes no painel (cadastro, busca por nome, apelido, telefone ou CPF, edição e anonimização, descrito em [docs/cadastro-de-pacientes.md](docs/cadastro-de-pacientes.md)), catálogo de serviços no painel (categorias e serviços com duração, preparo, intervalo e forma de exibir o preço, mais o serviço flexível "Avaliação / encaixe"; nada é apagado, só desativado), expediente semanal e bloqueios de agenda no painel (horários de atendimento por dia da semana, folgas, férias e feriados, com a lista de feriados nacionais pronta para adicionar), início do painel com o resumo do dia, a próxima cliente e a lista de hoje, agenda no painel (no celular, a agenda do dia vira lista, com a faixa da semana e os horários livres; visões de dia, semana, mês e lista no fuso da clínica, novo agendamento com busca de paciente, remarcação arrastando no calendário ou pela ficha do atendimento, avisos de fora do expediente, sobre bloqueio ou no passado que pedem confirmação, recusa de horários sobrepostos, confirmação, conclusão, falta e cancelamento com motivo, e o histórico de atendimentos na ficha do paciente), financeiro no painel (orçamento, aprovação à vista, parcelada ou por sessão, agendamento do pacote de uma vez, baixa e estorno de pagamentos, despesas, caixa e valores a receber, descrito em [docs/financeiro.md](docs/financeiro.md)), várias clínicas no mesmo sistema (cada uma só enxerga os próprios dados; o root cria clínicas e escolhe qual abrir no painel, descrito em [docs/multiclinica.md](docs/multiclinica.md)), área da cliente no link de cada clínica (`/<endereço>`: cadastro com confirmação de e-mail, agendamento online nos horários livres, "Meus horários" e troca de senha, com a dona confirmando quando o cadastro bate com uma ficha que já existe, descrito em [docs/multiclinica.md](docs/multiclinica.md#área-da-cliente)), página da clínica, que a dona configura em "Minha página" no painel (dados, Instagram, comodidades, agendamento online ligado ou desligado, produtos, avaliações e fidelidade) e a cliente vê no link da clínica, descrita em [docs/decisoes-tecnicas.md](docs/decisoes-tecnicas.md#página-da-clínica), um usuário do banco para cada parte do app com row-level security, marca Zemana em todas as telas e para todas as clínicas (cores, logo e fontes Bricolage Grotesque e Figtree, descrita em [docs/identidade-visual.md](docs/identidade-visual.md)), banco com todas as tabelas do MVP e a trava contra horários sobrepostos, testes automáticos e CI. A página da Zemana fica em `/` (conta o que o sistema faz, mostra os planos Agenda e Completo, com preço de lançamento até 31/12/2026 e um mês grátis, uma galeria "Olha só como fica." com fotos do sistema e botões que abrem o WhatsApp com o plano escolhido), a cliente entra em `/entrar` e vê "Suas clínicas" em `/minhas-clinicas`.

## Tecnologias

Next.js 16 (App Router) com TypeScript estrito, PostgreSQL 17 com Drizzle ORM, Better Auth (login e 2FA), Tailwind CSS e shadcn/ui (com as fontes Bricolage Grotesque e Figtree empacotadas pelo próprio app), Zod e React Hook Form, Luxon (datas no fuso da clínica), Vitest e Playwright, pnpm, ESLint, Prettier, GitHub Actions e Dependabot. Os motivos de cada escolha estão no [planejamento](docs/planejamento-etapa-1.md#stack).

## Pré-requisitos

- [Node.js](https://nodejs.org/) 24 LTS (22.12 ou mais nova também funciona). O arquivo `.nvmrc` indica a versão usada na CI.
- pnpm 10, ativado pelo Corepack, que já vem com o Node.js: `corepack enable`.
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) para subir o PostgreSQL local. Quem preferir pode instalar o PostgreSQL 17 direto na máquina e ajustar o `DATABASE_URL`.
- Git. No VS Code, aceite as extensões recomendadas (ESLint, Prettier e Tailwind CSS) quando o editor sugerir.

## Instalação

```bash
git clone https://github.com/guipachecco/clinic-scheduler.git
cd clinic-scheduler
corepack enable
pnpm install
```

Crie o arquivo de configuração a partir do modelo:

```bash
cp .env.example .env        # no Windows (PowerShell): Copy-Item .env.example .env
```

Gere um segredo e cole no `BETTER_AUTH_SECRET` do `.env`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Suba o banco, crie as tabelas e a conta de administração:

```bash
docker compose up -d        # PostgreSQL local em localhost:5432
pnpm db:migrate             # aplica as migrações da pasta drizzle/
pnpm admin create-root      # sua conta root, que vê todas as clínicas
pnpm admin create           # conta da dona: pede o endereço da clínica (ex.: grais), e-mail, nome e senha
```

O `pnpm admin` precisa de um terminal interativo (o do VS Code serve), porque a senha é digitada sem aparecer na tela.

## Execução

```bash
pnpm dev
```

- Site: http://localhost:3000
- Painel: http://localhost:3000/admin
- Área da cliente de uma clínica: http://localhost:3000/<endereço> (por exemplo, http://localhost:3000/grais). Sem `MAILERSEND_API_KEY`, os e-mails de confirmação e de troca de senha ficam em arquivos JSON na pasta `.emails/`; abra o arquivo e copie o link.

No primeiro acesso ao painel, depois da senha, o sistema pede a configuração da verificação em duas etapas. Tenha no celular um aplicativo autenticador (Google Authenticator, Microsoft Authenticator ou outro), leia o QR code e guarde os códigos de recuperação. Sem 2FA ativo, o painel não abre. Faça esse primeiro acesso logo depois de criar a conta: até lá, quem tiver a senha consegue cadastrar o próprio celular.

Use sempre o mesmo endereço do `BETTER_AUTH_URL` (por exemplo, `localhost` e não `127.0.0.1`), porque o login recusa pedidos vindos de outra origem.

## Configuração

As variáveis ficam no `.env` (desenvolvimento) ou no painel da hospedagem (produção). O app confere tudo ao iniciar e para com uma mensagem clara se faltar algo. O `.env` nunca vai para o Git.

| Variável                                                                                  | Para que serve                                                                                                                                              |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                            | Conexão do dono das tabelas (`postgres://usuario:senha@host:porta/banco`), usada só pelo `pnpm db:migrate` e pelos testes. O site não lê esta variável      |
| `DATABASE_URL_AUTH`, `DATABASE_URL_PANEL`, `DATABASE_URL_CLIENT`, `DATABASE_URL_PLATFORM` | Uma conexão para cada usuário do app (`app_auth`, `app_panel`, `app_client`, `app_platform`). O `pnpm db:migrate` define a senha de cada um a partir da URL |
| `BETTER_AUTH_SECRET`                                                                      | Assina as sessões e criptografa o segredo do 2FA. Mínimo de 32 caracteres e um valor por ambiente                                                           |
| `BETTER_AUTH_URL`                                                                         | Endereço do site. Em produção, obrigatoriamente com `https://`                                                                                              |
| `LOG_LEVEL`                                                                               | Nível dos logs: `debug`, `info` (padrão), `warn` ou `error`                                                                                                 |
| `MAILERSEND_API_KEY`                                                                      | Chave da MailerSend, que envia os e-mails da área da cliente. Obrigatória em produção                                                                       |
| `EMAIL_FROM`                                                                              | Remetente dos e-mails, de um domínio verificado na MailerSend (ex.: `Zemana <nao-responda@seudominio.com.br>`). Obrigatório quando há `MAILERSEND_API_KEY`  |
| `EMAIL_OUTBOX_DIR`                                                                        | Sem `MAILERSEND_API_KEY`, nada é enviado: cada e-mail vira um arquivo JSON nesta pasta (padrão `.emails/`, fora do Git)                                     |

Os quatro usuários do banco e o que cada um pode fazer:

| Usuário        | Usado por                               | Pode                                                                                                                           |
| -------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `app_auth`     | Login (Better Auth)                     | Só as tabelas de login e de limite de tentativas                                                                               |
| `app_panel`    | Painel da dona e do root numa clínica   | As tabelas da clínica aberta, filtradas pelo banco. No histórico (`audit_logs`), só muda a ficha de uma linha ao juntar fichas |
| `app_client`   | Área da cliente                         | A parte pública da clínica, os serviços online, a própria ficha e os próprios horários. Nada de financeiro                     |
| `app_platform` | Tela de clínicas do root e `pnpm admin` | Criar e listar clínicas e contas de dona                                                                                       |

Os detalhes estão em [Várias clínicas](docs/multiclinica.md#usuários-do-banco).

Trocar o `BETTER_AUTH_SECRET` encerra todas as sessões e invalida o 2FA já configurado. Depois da troca, rode `pnpm admin reset-2fa <email>` para cada conta.

## Comandos

| Comando                             | O que faz                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev`                          | Servidor de desenvolvimento                                                |
| `pnpm build` e `pnpm start`         | Build e servidor de produção                                               |
| `pnpm lint`                         | ESLint                                                                     |
| `pnpm typecheck`                    | Gera os tipos das rotas e roda o TypeScript                                |
| `pnpm format` / `pnpm format:check` | Formata o código com Prettier / só confere                                 |
| `pnpm test:unit`                    | Testes de unidade (não precisam de banco)                                  |
| `pnpm test:integration`             | Testes com PostgreSQL de verdade, incluindo concorrência                   |
| `pnpm test`                         | Testes de unidade e de integração                                          |
| `pnpm test:e2e`                     | Testes no navegador com Playwright, sobre o build de produção              |
| `pnpm db:migrate`                   | Aplica as migrações pendentes                                              |
| `pnpm db:generate`                  | Gera uma migração a partir de mudanças em `src/db/schema`                  |
| `pnpm db:studio`                    | Abre o Drizzle Studio para consultar o banco local                         |
| `pnpm admin create`                 | Cria a conta da dona de uma clínica (pede o endereço da clínica)           |
| `pnpm admin create-root`            | Cria uma conta root, que escolhe a clínica em `/admin/clinicas`            |
| `pnpm admin reset-password <email>` | Define uma nova senha e encerra as sessões da conta                        |
| `pnpm admin reset-2fa <email>`      | Remove o 2FA (celular perdido); o próximo login pede uma nova configuração |

## Testes

Os testes de integração e de ponta a ponta usam o PostgreSQL do `docker compose`, em bancos próprios (`clinic_scheduler_test` e `clinic_scheduler_e2e_test`). Esses bancos são apagados e recriados a cada execução; por segurança, o script só aceita nomes terminados em `_test`. Para usar outro servidor, defina `TEST_DATABASE_URL` e `E2E_DATABASE_URL`.

```bash
pnpm test:unit
pnpm test:integration
pnpm exec playwright install chromium   # uma vez: baixa o navegador dos testes
pnpm test:e2e
```

O que os testes cobrem hoje:

- **Trava de horários no banco:** sobreposição recusada, encaixe exato permitido, preparo e limpeza contados como tempo ocupado, cancelados sem bloquear, remarcação para horário ocupado recusada e, entre vários pedidos simultâneos para o mesmo horário, só um gravado.
- **Contas do painel:** criação pelo script, login pelo Better Auth, cadastro público bloqueado, troca de senha e remoção do 2FA encerrando as sessões.
- **Navegador:** cabeçalhos de segurança e nonce da CSP em todos os scripts, painel fechado sem login, 2FA obrigatório no primeiro acesso, login com o código do aplicativo e código errado recusado.
- **Unidade:** validação das variáveis de ambiente, montagem da CSP, identificação de erros do banco e remoção de dados pessoais dos logs.

A CI do GitHub Actions roda tudo isso em cada PR e em cada push na `main`. O Dependabot abre PRs semanais de atualização das dependências.

## Estrutura

```text
src/
  app/                 telas e rotas (site público, /admin e /api/auth)
  components/          componentes de interface (ui/ vem do shadcn/ui)
  db/                  conexão, esquema (schema/), migrações e erros do banco
  lib/                 autenticação, variáveis de ambiente, logger e CSP
  modules/             regras por domínio (por enquanto, contas e sessão)
  proxy.ts             CSP com nonce e redirecionamento rápido do painel
drizzle/               migrações SQL versionadas
scripts/               comandos de terminal (migrações e contas do painel)
tests/                 testes de integração com PostgreSQL
e2e/                   testes do Playwright
docs/                  planejamento e decisões técnicas
```

## Banco de dados e migrações

- O esquema fica em `src/db/schema`. Depois de mudá-lo, rode `pnpm db:generate` e revise o SQL gerado em `drizzle/` antes do commit.
- Migrações já aplicadas nunca são editadas: toda mudança vira uma migração nova.
- Regras que o Drizzle não descreve, como a constraint `appointments_no_overlap`, ficam em migrações escritas à mão (`pnpm exec drizzle-kit generate --custom --name=<nome>`).
- Horários são gravados em UTC (`timestamptz`) e exibidos no fuso `America/Sao_Paulo`.
- Nunca use cópia de dados reais de pacientes em desenvolvimento ou testes.

## Segurança e privacidade

O que a fundação já faz:

- Painel sem cadastro público: contas criadas só pelo terminal.
- Senha com hash forte (scrypt) e mínimo de 12 caracteres; 2FA obrigatório por aplicativo autenticador, com códigos de recuperação e bloqueio de 15 minutos após 10 códigos errados.
- Sessão encerrada 12 horas depois do login, em cookie `httpOnly`, `SameSite=Lax` e, em produção, `Secure`.
- Em produção, no máximo 5 tentativas de login por minuto por IP, com a contagem guardada no PostgreSQL.
- Sessão conferida no servidor em cada página e ação do painel, não só no proxy.
- Cada parte do app entra no banco com um usuário próprio, e a row-level security do PostgreSQL só deixa ver as linhas da clínica aberta (e, na área da cliente, só a própria ficha e os próprios horários). Nenhum desses usuários é dono de tabela nem tem `BYPASSRLS`.
- Conta de cliente com sessão de 30 dias e sem acesso ao painel; e-mail confirmado antes de marcar horário.
- CSP com nonce por requisição, HSTS, bloqueio de iframe, `nosniff`, `Referrer-Policy` e `Permissions-Policy`.
- Logs em JSON sem nome, telefone, e-mail, tokens ou parâmetros de consultas ao banco.
- Variáveis de ambiente validadas na inicialização e segredos fora do Git.

O sistema aplica privacidade desde a concepção, mas isso não o torna adequado à LGPD por si só. Base legal, aviso de privacidade, retenção e contratos com fornecedores precisam de validação jurídica (ver [Privacidade e LGPD](docs/planejamento-etapa-1.md#privacidade-e-lgpd)).

## Implantação

A publicação é a Etapa 5. O plano aprovado é Vercel Pro (funções em São Paulo, `gru1`) com Neon (PostgreSQL em `aws-sa-east-1`), e o roteiro completo (domínio, backups, monitoramento e teste de restauração) entra neste README nessa etapa. Em resumo, produção vai precisar de:

1. Um PostgreSQL 17 gerenciado. No Neon, o `DATABASE_URL` é o usuário dono do banco (o `neondb_owner`, que não é superusuário), com a conexão direta, sem o pooler.
2. Os quatro usuários do app criados pela migração, não pelo painel do Neon: o `pnpm db:migrate` cria `app_auth`, `app_panel`, `app_client` e `app_platform` (migração `0011`) e define a senha de cada um a partir das URLs `DATABASE_URL_AUTH`, `DATABASE_URL_PANEL`, `DATABASE_URL_CLIENT` e `DATABASE_URL_PLATFORM`. Use uma senha nova e forte em cada URL (`postgres://app_panel:<senha>@<host>/<banco>?sslmode=require`); as URLs do app podem usar o host com pooler do Neon. Nunca torne um desses usuários dono do banco ou das tabelas nem dê `BYPASSRLS`: isso desliga a separação entre clínicas. Antes de mexer no banco, o `pnpm db:migrate` confere se cada URL usa o usuário certo e tem senha. Depois de aplicar as migrações e antes de definir qualquer senha, confere os quatro usuários e para com um aviso, sem dar login a nenhum, se algum for superusuário, tiver `BYPASSRLS`, `CREATEROLE` ou `CREATEDB`, for membro de outro papel ou for dono de alguma tabela, view, sequência, função ou schema deste banco, ou do próprio banco. O aviso cita só os nomes dos usuários, nunca URLs ou senhas.
3. As variáveis da tabela de configuração cadastradas na hospedagem, menos o `DATABASE_URL`: o site só se conecta com os quatro usuários do app, e a senha do dono fica apenas onde se roda o `pnpm db:migrate`. Cadastre um `BETTER_AUTH_SECRET` exclusivo, o `BETTER_AUTH_URL` com `https://`, a `MAILERSEND_API_KEY` e o `EMAIL_FROM` de um domínio verificado na MailerSend.
4. `pnpm db:migrate` com o `DATABASE_URL` e as quatro `DATABASE_URL_*` de produção antes de cada versão que traga migrações. Para trocar a senha de um usuário do app, mude a URL e rode o `pnpm db:migrate` de novo.
5. `pnpm admin create` uma única vez, apontando para o banco de produção.

## Documentação

- [Planejamento da Etapa 1](docs/planejamento-etapa-1.md): requisitos, stack, arquitetura, modelo de dados, segurança, LGPD e riscos.
- [Decisões técnicas](docs/decisoes-tecnicas.md): escolhas feitas na implementação e seus motivos.
- [Identidade visual](docs/identidade-visual.md): cores, fontes, logos e como usá-los no sistema.
- [Financeiro](docs/financeiro.md): orçamentos, vendas, parcelas, pagamentos, despesas e caixa.
- [Várias clínicas](docs/multiclinica.md): como os dados de cada clínica ficam separados e o papel do root.
