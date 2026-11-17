# Administração geral: recursos e monitoramento

Telas só do root, no cabeçalho roxo da administração geral: **Clínicas**, **Recursos** e **Monitoramento**.

## Recursos (`/admin/recursos`)

Uma linha por clínica e um interruptor por módulo (Produtos, Financeiro, Agendamento online, Fidelidade, Anamnese, Avaliações). O clique salva na hora (`setClinicModule`, com registro em `audit_logs`). Desligar não apaga dados, como na edição da clínica. A coluna **Conexões** mostra o que depende da dona: Sinal Pix (conta Asaas aprovada), Mercado Pago conectado e modelo de anamnese.

## Monitoramento (`/admin/monitoramento`)

- **Banco agora:** 5 idas e voltas ao banco (`select 1`); a mediana vira uma amostra de latência.
- **Latência (72 h):** amostras de quando a tela abre e de `/api/saude`. Aponte um monitor de disponibilidade gratuito (UptimeRobot, Better Stack) para `https://<domínio>/api/saude`: responde `{ ok, dbMs }` (503 se o banco cair) e grava no máximo uma amostra a cada 4 minutos, por mais que seja chamado.
- **Erros:** `onRequestError` em `src/instrumentation.ts` grava falhas não tratadas de páginas, ações e APIs; todo `logger.error` também entra (tipo "Registro"). Mensagem passa pela mesma redação do logger, o caminho perde a query string e ids viram `:id`. Nada do corpo, cabeçalhos ou cookies. Guardados 30 dias.
- **O que está sendo criado** e **Uso por clínica:** só contagens, pelas funções `platform_clinic_usage()` e `platform_daily_created(dias)` (migração 0040, `SECURITY DEFINER`, executáveis só por `app_platform`). O `app_platform` continua sem acesso às tabelas das clínicas.
- **Banco de dados:** tamanho, conexões, cache, transações e as maiores tabelas, das views de estatística do Postgres.

As tabelas `platform_errors` e `platform_health_checks` são só do `app_platform` (RLS ligado); o painel e a área da cliente não as enxergam.

Latência das páginas para as visitantes (tempo de resposta completo) continua no painel da Vercel; aqui é a latência do banco.
