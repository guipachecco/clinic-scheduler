# Clinic Scheduler

Sistema web de agendamentos para uma clínica de biomedicina: site institucional, agendamento online pelo paciente e painel administrativo para a profissional.

## Status

| Etapa | Descrição                                                    | Situação                                                                 |
| ----- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 1     | Planejamento: requisitos, stack, arquitetura, banco e riscos | Concluída ([docs/planejamento-etapa-1.md](docs/planejamento-etapa-1.md)) |
| 2     | Fundação: projeto, banco, autenticação, testes e CI          | Em revisão ([decisões técnicas](docs/decisoes-tecnicas.md))              |
| 3     | MVP: site, serviços, agendamento e painel                    | A fazer                                                                  |
| 4     | Qualidade: testes dos fluxos, segurança e responsividade     | A fazer                                                                  |
| 5     | Publicação: produção, domínio, backups e monitoramento       | A fazer                                                                  |

O que já funciona: login do painel com verificação em duas etapas obrigatória, cadastro de pacientes no painel (cadastro, busca por nome, apelido, telefone ou CPF, edição e anonimização, descrito em [docs/cadastro-de-pacientes.md](docs/cadastro-de-pacientes.md)), identidade visual da clínica aplicada (cores, logo e fontes Archivo e Figtree), banco com todas as tabelas do MVP e a trava contra horários sobrepostos, testes automáticos e CI. O site público ainda mostra só "Site em construção".

## Tecnologias

Next.js 16 (App Router) com TypeScript estrito, PostgreSQL 17 com Drizzle ORM, Better Auth (login e 2FA), Tailwind CSS e shadcn/ui (com as fontes Archivo e Figtree empacotadas pelo próprio app), Zod e React Hook Form, Vitest e Playwright, pnpm, ESLint, Prettier, GitHub Actions e Dependabot. Os motivos de cada escolha estão no [planejamento](docs/planejamento-etapa-1.md#stack).

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
pnpm admin create           # pede e-mail, nome e senha (mínimo de 12 caracteres)
```

O `pnpm admin` precisa de um terminal interativo (o do VS Code serve), porque a senha é digitada sem aparecer na tela.

## Execução

```bash
pnpm dev
```

- Site: http://localhost:3000
- Painel: http://localhost:3000/admin

No primeiro acesso ao painel, depois da senha, o sistema pede a configuração da verificação em duas etapas. Tenha no celular um aplicativo autenticador (Google Authenticator, Microsoft Authenticator ou outro), leia o QR code e guarde os códigos de recuperação. Sem 2FA ativo, o painel não abre. Faça esse primeiro acesso logo depois de criar a conta: até lá, quem tiver a senha consegue cadastrar o próprio celular.

Use sempre o mesmo endereço do `BETTER_AUTH_URL` (por exemplo, `localhost` e não `127.0.0.1`), porque o login recusa pedidos vindos de outra origem.

## Configuração

As variáveis ficam no `.env` (desenvolvimento) ou no painel da hospedagem (produção). O app confere tudo ao iniciar e para com uma mensagem clara se faltar algo. O `.env` nunca vai para o Git.

| Variável             | Para que serve                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | Conexão com o PostgreSQL (`postgres://usuario:senha@host:porta/banco`)                            |
| `BETTER_AUTH_SECRET` | Assina as sessões e criptografa o segredo do 2FA. Mínimo de 32 caracteres e um valor por ambiente |
| `BETTER_AUTH_URL`    | Endereço do site. Em produção, obrigatoriamente com `https://`                                    |
| `LOG_LEVEL`          | Nível dos logs: `debug`, `info` (padrão), `warn` ou `error`                                       |

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
| `pnpm admin create`                 | Cria uma conta de administração                                            |
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
- CSP com nonce por requisição, HSTS, bloqueio de iframe, `nosniff`, `Referrer-Policy` e `Permissions-Policy`.
- Logs em JSON sem nome, telefone, e-mail, tokens ou parâmetros de consultas ao banco.
- Variáveis de ambiente validadas na inicialização e segredos fora do Git.

O sistema aplica privacidade desde a concepção, mas isso não o torna adequado à LGPD por si só. Base legal, aviso de privacidade, retenção e contratos com fornecedores precisam de validação jurídica (ver [Privacidade e LGPD](docs/planejamento-etapa-1.md#privacidade-e-lgpd)).

## Implantação

A publicação é a Etapa 5. O plano aprovado é Vercel Pro (funções em São Paulo, `gru1`) com Neon (PostgreSQL em `aws-sa-east-1`), e o roteiro completo (domínio, backups, monitoramento e teste de restauração) entra neste README nessa etapa. Em resumo, produção vai precisar de:

1. Um PostgreSQL 17 gerenciado e um usuário da aplicação sem privilégios de superusuário.
2. As variáveis da tabela de configuração cadastradas na hospedagem, com um `BETTER_AUTH_SECRET` exclusivo e o `BETTER_AUTH_URL` com `https://`.
3. `pnpm db:migrate` com o `DATABASE_URL` de produção antes de cada versão que traga migrações.
4. `pnpm admin create` uma única vez, apontando para o banco de produção.

## Documentação

- [Planejamento da Etapa 1](docs/planejamento-etapa-1.md): requisitos, stack, arquitetura, modelo de dados, segurança, LGPD e riscos.
- [Decisões técnicas](docs/decisoes-tecnicas.md): escolhas feitas na implementação e seus motivos.
- [Identidade visual](docs/identidade-visual.md): cores, fontes, logos e como usá-los no sistema.
