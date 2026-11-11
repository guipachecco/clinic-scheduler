# Várias clínicas

Desde 04/11/2026 o sistema atende várias clínicas no mesmo banco. A Grais é a primeira: a migração `0007_multi_clinic` moveu todos os dados que já existiam para ela.

## Quem vê o quê

| Conta                     | Como é criada                                          | O que vê                                                                                                  |
| ------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Dona da clínica (`admin`) | `pnpm admin create`, informando o endereço da clínica  | Só a própria clínica. Se a clínica for desativada, o painel dela fecha                                    |
| Root                      | `pnpm admin create-root`                               | Todas as clínicas. Escolhe qual abrir em `/admin/clinicas`, onde também cria e desativa clínicas          |
| Cliente (`client`)        | A própria cliente, em "Criar conta" no link da clínica | Só a própria ficha e os próprios horários, e só na clínica do link aberto. Nunca abre o painel (`/admin`) |

## Área da cliente

Cada clínica tem um link próprio, `/<endereço>` (por exemplo, `/grais`), que vira o QR code da clínica. Por ele a cliente:

- **cria a conta** com nome, celular, e-mail e senha, e confirma o e-mail pelo link que recebe;
- **marca um horário** entre os serviços que aceitam agendamento online, nos horários livres do expediente. O horário entra direto como confirmado, com origem "Online";
- **vê os próprios horários** em "Meus horários". Desmarcar e remarcar ficam com a dona: a tela mostra "Para desmarcar ou mudar, fale com <clínica>" e o WhatsApp da clínica;
- **troca a senha** pelo link "Esqueci minha senha".

A conta é uma só para todas as clínicas: a cliente não pertence a nenhuma. Cada clínica a conhece pela própria ficha dela (`patients.user_id`). Ao abrir o link de outra clínica, ela completa o cadastro ali e ganha uma ficha nova, sem ver nada da primeira clínica.

Sem agendamento online ligado, o link mostra "Agendamento online indisponível" e os contatos da clínica. Alguns endereços são reservados pelo sistema (`admin`, `api`, `entrar`, `marca` e outros) e não podem virar endereço de clínica.

## Ficha que já existe: a dona confirma

Quando a cliente se cadastra com um celular que já está numa ficha da clínica:

1. **Ficha provisória:** ela ganha uma ficha provisória, ligada à conta dela. Já pode marcar por ela, mas não vê nada da ficha antiga.
2. **Aviso no painel:** a dona vê "<nome> se cadastrou online. É a mesma pessoa desta ficha?" no início do painel e na ficha antiga.
3. **"É a mesma":** os horários, os orçamentos, as vendas e o histórico da ficha provisória passam para a ficha antiga, a conta da cliente fica ligada a ela e a provisória some. A cliente passa a ver também os horários antigos. Se a ficha antiga já estiver ligada a outra conta, o botão fica desligado.
4. **"Não é":** a provisória vira uma ficha comum. Se o nome e o celular forem iguais aos da ficha antiga, o painel pede para a dona mudar o nome da ficha nova antes.

Tudo isso roda numa transação só e fica registrado no histórico (`audit_logs`), só com ids.

## Como os dados ficam separados

- **Toda tabela da clínica tem `clinic_id`:** pacientes, serviços, categorias, expediente, bloqueios, agendamentos, imagens, anamneses (só o painel acessa; `app_client` não) e histórico. A tabela `clinics` substituiu a antiga `clinic_settings`, de linha única.
- **Toda função dos módulos recebe o `clinicId`** como primeiro parâmetro e filtra por ele. O `clinicId` vem sempre da sessão (`requireAdmin()`), nunca do formulário.
- **O banco também confere:** agendamentos apontam para paciente e serviço da mesma clínica, e serviços para categoria da mesma clínica, por chaves estrangeiras compostas `(clinic_id, id)`. Um agendamento que misture clínicas é recusado mesmo se o código errar.
- **Cada parte do app entra no banco com um usuário próprio,** e o PostgreSQL limita o que cada um alcança (veja abaixo). Mesmo que uma consulta esqueça o filtro, o banco só devolve as linhas da clínica aberta.
- **A trava contra horário sobreposto vale dentro de cada clínica.** Duas clínicas podem ter atendimentos no mesmo horário. A constraint usa a extensão `btree_gist`.
- **Os locks de escrita da agenda, do expediente e dos feriados são por clínica,** para que uma clínica não espere a outra.
- **Nomes e endereços se repetem entre clínicas:** a mesma pessoa pode ser paciente de duas clínicas, e duas clínicas podem ter um serviço com o mesmo nome.

## Usuários do banco

| Usuário               | Usado por                                       | Pode                                                                                                                                                                       |
| --------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dono (`DATABASE_URL`) | Só as migrações e os testes                     | Tudo. É o dono das tabelas                                                                                                                                                 |
| `app_auth`            | Login (Better Auth)                             | Só as tabelas de login: `users`, `sessions`, `accounts`, `verifications`, `two_factors`, `rate_limits`                                                                     |
| `app_panel`           | Painel da dona, e do root dentro de uma clínica | As tabelas da clínica, sempre filtradas pela clínica da sessão. No histórico, só lê e grava; muda apenas a ficha a que uma linha se refere, ao juntar fichas ("É a mesma") |
| `app_client`          | Área da cliente                                 | A parte pública da clínica do link, os serviços online, a própria ficha (sem os campos internos) e os próprios horários. Nada de financeiro, histórico, imagens ou contas  |
| `app_platform`        | Tela de clínicas do root e `pnpm admin`         | Criar e listar clínicas e contas de dona, sem filtro de clínica                                                                                                            |

Cada transação do painel começa com `set_config('app.clinic_id', …, true)` (função `inClinic` em `src/db/client.ts`); na área da cliente entram também a ficha e a conta dela (`asClient`). Sem esse ajuste, o banco não devolve nenhuma linha. O que a cliente precisa ver além das próprias linhas, como os horários ocupados, vem de funções do banco que devolvem só início e fim, sem nomes.

Nenhum usuário do app é dono de tabela nem tem `BYPASSRLS`; os testes de `tests/integration/db-roles.test.ts` e `client-access.test.ts` conferem isso e as permissões de cada um.

## Ao criar uma clínica

A clínica nasce com a categoria "Outros" e o serviço flexível "Avaliação / encaixe", como a primeira recebeu na migração `0005`. O endereço (`slug`) vira o link e o QR code da clínica, então não deve mudar depois de divulgado.

## O que ainda é igual para todas

- **Marca:** a Zemana, em todas as telas (menu lateral, login, ícone, área da cliente e e-mails). O painel só mostra o nome da clínica aberta; não há tela de Aparência nem cores por clínica (ver [identidade visual](identidade-visual.md)).
- **Fuso horário:** o painel usa `America/Sao_Paulo` (constante em `src/modules/schedule/time.ts`). O agendamento online lê a coluna `clinics.timezone`, que hoje vale `America/Sao_Paulo` para todas.
