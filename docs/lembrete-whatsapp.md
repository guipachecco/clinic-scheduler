# Lembrete por WhatsApp 1 dia antes

A cliente que marca pelo link da clínica vê, na confirmação, o checkbox **"Me avise 1 dia antes pelo WhatsApp"**. A dona, ao marcar ou alterar um horário no painel, vê **"Avisar a paciente 1 dia antes pelo WhatsApp"**. Os dois começam desmarcados: o lembrete só sai com o "sim" de quem marca.

Todo dia às 10h (horário de Brasília) o sistema manda a mensagem para os horários **confirmados** de amanhã que têm o lembrete ligado. Sai do número da Zemana, pela API oficial do WhatsApp (WhatsApp Cloud API, da Meta), com o nome da clínica no texto:

> Olá, Maria! Lembrete da Clínica Teste: seu horário é amanhã, quinta-feira, 19/11, às 14:30 (Design de sobrancelha). Se não puder ir, avise a clínica com antecedência.

- Remarcou depois do lembrete? Se o novo horário também for amanhã, sai outro lembrete com o horário novo.
- Horário aguardando o sinal por Pix não recebe lembrete até ser confirmado.
- Cada envio fica no histórico do atendimento (`audit_logs`, ação `appointment.reminder_sent`), e a ficha do atendimento no painel mostra "Lembrete por WhatsApp: 1 dia antes" ou "enviado".
- Se a Meta recusar uma mensagem, o erro vai para o log (sem o telefone) e para a tela de Monitoramento do root; aquele horário fica sem lembrete.

## Como ligar (uma vez, para todas as clínicas)

1. **Conta Meta Business.** Em [business.facebook.com](https://business.facebook.com), crie (ou use) o portfólio empresarial da Zemana e verifique a empresa (CNPJ). Sem a verificação, a Meta limita a poucas conversas por dia.
2. **App e número.** Em [developers.facebook.com](https://developers.facebook.com) → Criar app → tipo "Empresa" → adicione o produto **WhatsApp**. Em WhatsApp → Configuração da API, adicione o número da Zemana. Ele **não pode** estar em uso no aplicativo WhatsApp comum ou no WhatsApp Business do celular (se estiver, apague a conta no celular antes). Anote o **Phone Number ID** (um número comprido, não é o telefone).
3. **Token permanente.** Em Configurações do negócio → Usuários do sistema → Adicionar (função Administrador) → Gerar token, escolhendo o app e as permissões `whatsapp_business_messaging` e `whatsapp_business_management`, validade "Nunca". Esse é o `WHATSAPP_TOKEN`. O token temporário da tela de teste expira em 24 horas: não use.
4. **Modelo de mensagem.** Em WhatsApp Manager → Modelos de mensagem → Criar modelo:
   - Categoria: **Utilidade**
   - Nome: `lembrete_horario`
   - Idioma: Português (BR)
   - Corpo (as variáveis precisam ficar nesta ordem):

     ```
     Olá, {{1}}! Lembrete da {{2}}: seu horário é amanhã, {{3}}, às {{4}} ({{5}}). Se não puder ir, avise a clínica com antecedência.
     ```

   - Exemplos para a Meta aprovar: `Maria`, `Clínica Exemplo`, `quinta-feira, 19/11`, `14:30`, `Limpeza de pele`.

   A aprovação costuma levar de minutos a algumas horas. Se mudar o texto, crie outro modelo e troque o `WHATSAPP_TEMPLATE`.

5. **Pagamento.** Em WhatsApp Manager → Visão geral, cadastre um cartão. A Meta cobra por mensagem de modelo entregue (as de utilidade são as mais baratas; veja a tabela de preços da Meta para o Brasil).
6. **Vercel.** Em Settings → Environment Variables (Production), defina:

   | Variável                   | Valor                                                                                                             |
   | -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
   | `WHATSAPP_TOKEN`           | o token do passo 3                                                                                                |
   | `WHATSAPP_PHONE_NUMBER_ID` | o Phone Number ID do passo 2                                                                                      |
   | `CRON_SECRET`              | um valor aleatório de 32+ caracteres (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |

   `WHATSAPP_TEMPLATE` (padrão `lembrete_horario`), `WHATSAPP_TEMPLATE_LANGUAGE` (padrão `pt_BR`) e `WHATSAPP_GRAPH_VERSION` (padrão `v23.0`) só precisam ser definidas se forem diferentes.

7. Faça um novo deploy. O checkbox aparece no site e o cron fica em Settings → Cron Jobs, onde dá para rodar na hora ("Run") para testar.

Enquanto `WHATSAPP_TOKEN` não estiver definido no site de verdade, o checkbox fica escondido e nada muda para as clientes.

## Como funciona por dentro

| Onde                                  | O quê                                                                                                                                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drizzle/0041_whatsapp_reminder.sql`  | Colunas `whatsapp_reminder` (pediu o lembrete) e `reminder_sent_for` (o `starts_at` para o qual o lembrete saiu) em `appointments`                                                                                                                |
| `vercel.json`                         | Cron `0 13 * * *` (13:00 UTC = 10h em Brasília) chamando `/api/cron/lembretes`. No plano Hobby a Vercel pode rodar a qualquer minuto dentro dessa hora                                                                                            |
| `src/app/api/cron/lembretes/route.ts` | Só aceita `Authorization: Bearer <CRON_SECRET>`; responde só as contagens (`sent`, `failed`)                                                                                                                                                      |
| `src/modules/reminders/reminders.ts`  | Lista as clínicas ativas (`app_platform`) e, dentro de cada uma (`app_panel`, com RLS), os horários de amanhã no fuso da clínica. Marca o horário antes de enviar, então duas execuções juntas não mandam duas vezes; se o envio falhar, desmarca |
| `src/modules/reminders/whatsapp.ts`   | Envio pela Cloud API (`POST graph.facebook.com/<versão>/<phone-number-id>/messages`, tipo `template`). Sem token, grava em `WHATSAPP_OUTBOX_DIR`                                                                                                  |
| `src/modules/reminders/message.ts`    | "Amanhã" no fuso da clínica, as 5 variáveis do modelo (só o primeiro nome da cliente) e a limpeza que a Meta exige (sem quebra de linha nem espaços repetidos)                                                                                    |

Em desenvolvimento, sem as chaves, as mensagens ficam em `.whatsapp/` (fora do Git). Para disparar a rodada localmente, defina um `CRON_SECRET` no `.env` e:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/lembretes
```
