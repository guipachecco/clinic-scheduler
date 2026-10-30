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
- A anonimização de um paciente apaga telefone, e-mail e nome normalizado e troca o nome por um rótulo; uma restrição impede anonimizar pela metade.

### Testes com PostgreSQL de verdade

- **Decisão:** os testes de integração e de ponta a ponta rodam contra um PostgreSQL real, num banco recriado a cada execução, e o teste de concorrência dispara vários pedidos simultâneos para o mesmo horário.
- **Motivo:** a proteção contra horários duplicados está no banco; um banco simulado não provaria nada.

### Ferramentas

- Node.js 24 LTS na CI; o projeto aceita a partir da 22.12.
- Projeto em ESM (`"type": "module"`) e ESLint 10, já que o ESLint 9 deixou de receber suporte.
- Fontes Archivo (títulos) e Figtree (texto) vindas dos pacotes `@fontsource-variable`, servidas pelo próprio app: nenhuma requisição externa no site e nenhum download no build.
- Dependabot espera 3 dias antes de sugerir uma versão recém-publicada, o que evita a maioria dos pacotes comprometidos e retirados logo após a publicação. Alertas e correções de segurança dependem das configurações do repositório no GitHub e não esperam esse prazo.

### Identidade visual

As cores, as fontes e os logos aprovados da clínica estão descritos em [identidade-visual.md](identidade-visual.md). Os tokens ficam em `src/app/globals.css`, incluindo o token `highlight` (amarelo, usado só como destaque sobre o azul-marinho, nunca como texto em fundo claro), e os logos em `public/marca/`.
