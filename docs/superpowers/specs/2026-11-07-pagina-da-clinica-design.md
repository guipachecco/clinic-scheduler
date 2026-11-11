# Página da clínica no celular: design

Data: 2026-11-07. Continua a área da cliente (`2026-11-05-area-da-cliente-e-travas-design.md`).

## Intenção

Hoje o link da clínica (`zemana.com.br/<endereço>`) abre uma tela com dois ou três botões. A dona divulga esse link no Instagram e no WhatsApp, e a cliente decide ali se marca. Ele precisa parecer uma página de verdade da clínica, no celular, como os apps de agendamento que as clientes já usam: fotos, serviços com preço, avaliações, horário, como chegar, como pagar e um agendamento rápido. Referência: prints do app de uma barbearia, enviados pelo dono do projeto.

## Decisões do dono do projeto

- **Visual:** mantém a arte da Zemana (cores, fontes, temas claro e escuro). Usa ícones de linha, nunca emojis.
- **Uma profissional por clínica:** não há etapa de escolher profissional.
- **Fotos do espaço:** a aba existe desde já e mostra um estado vazio. O envio de fotos fica para depois.
- **Comodidades:** a dona marca numa lista pronta (checklist). A Karol tem Wi-Fi.
- **Avaliações:** só quem tem login e **pelo menos 1 atendimento concluído** naquela clínica. Cada pessoa pode avaliar quantas vezes quiser.
- **Produtos à venda:** começam com alguns genéricos, que a própria dona muda.
- **Fidelidade:** cada clínica escolhe se usa.
- **Instagram:** cada clínica tem o seu. O da Karol é `https://www.instagram.com/karolpachecojk/`.
- **Para quem é:** a página é das clientes. Tudo que a dona configura fica no painel.

## Decisões minhas (o dono pode mudar)

- **Moderação:** a dona pode **esconder** e voltar a mostrar uma avaliação no painel. Uma avaliação escondida não aparece e não entra na média. Ninguém apaga avaliação, nem a cliente nem a dona.
- **Avaliação:** nota de 1 a 5 e comentário opcional de até 500 caracteres. Na página aparece o primeiro nome e a inicial do sobrenome, nunca o nome completo, o e-mail ou o telefone. A média e o total contam só as visíveis.
- **Fidelidade:** a dona define "a cada **N** atendimentos concluídos (2 a 50), a cliente ganha **X**" (texto livre, até 120 caracteres).
  - **Progresso:** atendimentos concluídos da cliente naquela clínica menos N × (prêmios já usados).
  - **Prêmio:** quando o progresso chega a N, a cliente vê "Você ganhou: X. Avise na próxima visita". Na ficha da paciente, a dona marca "Prêmio usado", o que registra um resgate e recomeça o cartão.
  - **Sem login:** quem não está logado vê só a regra.
- **Produtos genéricos:** o banco não ganha produtos sozinho. Com a lista vazia, o painel mostra o botão "Começar com exemplos", que cria 3 produtos genéricos que a dona edita ou apaga.
  - **O que é produto:** vitrine, sem venda online. Cada um tem nome, preço opcional, descrição curta opcional e a opção de ativo.
  - **Fotos:** foto de produto fica para depois, junto com as fotos do espaço. A página mostra uma área neutra com ícone.
- **Lista de comodidades:** fixa no código: Wi-Fi, Estacionamento, Acessibilidade, Ar-condicionado, Café e água, Banheiro, Espaço kids, Aceita pets.
- **Formas de pagamento:** vêm das formas ativas do financeiro (`payment_methods`), que a dona já cadastra.
- **Agendamento online:** o painel ganha o botão "Agendamento online: ligado/desligado" (antes só dava para mudar no banco).
- **Página sem login:** a página da clínica abre sem login. Login só é pedido ao tocar em Agendar, avaliar ou ver o cartão de fidelidade. Com o agendamento online desligado, a página aparece igual, mas o Agendar vira "Fale com a clínica" (WhatsApp).
- **Link do mapa:** só aceita `https://` (sem `javascript:` e similares). O endereço continua texto livre.

## O que a cliente vê

Uma coluna para celular de 360 px, com no máximo `max-w-md` no computador. Uma barra fixa embaixo com ícones: **Início · Agendar · Meus horários · Perfil**. Perfil leva para entrar ou criar conta quando não há login, e para os dados dela e sair quando há.

**Início (`/<slug>`)**

1. **Topo:** área das fotos do espaço, com fundo neutro e "Fotos em breve" enquanto não houver fotos. Sobre ela, a foto da dona (ou as iniciais), o nome da clínica, a área (`area_label`) e o status "Aberto agora · até 18:00", "Fechado · abre amanhã às 09:00" ou "Fechado hoje", calculado com o expediente e o fuso da clínica.
2. **Abas:** Serviços · Fotos · Fidelidade (só se ligada) · Produtos (só se houver ativos) · Sobre.
   - **Serviços:** serviços ativos e visíveis online. Cada um tem nome, preço (pelas regras de `price_display`), duração e o botão **Agendar**, que leva ao agendamento já com o serviço escolhido.
   - **Fotos:** estado vazio.
   - **Fidelidade:** a regra e, com login, o cartão com N carimbos e o progresso, ou o prêmio.
   - **Produtos:** lista com área de imagem neutra, nome, preço e descrição.
   - **Sobre:** `headline`, `about` e o nome e registro da profissional, quando existirem.
3. **Abaixo das abas, sempre visíveis:**
   - **Comodidades:** ícone e nome; a seção some se a lista estiver vazia.
   - **Avaliações:** média com estrelas, total e as 10 mais recentes. Com login e direito a avaliar, aparece o botão "Avaliar".
   - **Localização:** endereço e um botão de mapa, quando houver link.
   - **Horário de atendimento:** os 7 dias, com o dia de hoje marcado.
   - **Formas de pagamento:** em chips.
   - **Redes e contato:** WhatsApp, Instagram e e-mail como botões redondos com ícone, e o telefone com botão de copiar.

**Agendar (`/<slug>/marcar`)**

- **Serviço já escolhido:** se veio de um serviço, vai direto para o dia. Senão, mostra a lista de serviços.
- **Dias:** uma faixa com 5 a 7 dias visíveis e setas, mostrando o mês. Dias sem horário ficam apagados.
- **Horários:** os chips **Manhã / Tarde / Noite** pulam para o grupo. Os grupos são "até 12:00", "12:00 a 18:00" e "depois das 18:00", cada um com a contagem de horários e uma grade de 3 colunas.
- **Confirmação:** ao tocar num horário, sobe por baixo uma folha com o resumo (serviço, dia, hora de início e fim, preço), o campo "Alguma observação?" (se o agendamento já aceitar observação; se não aceitar, ele não entra nesta versão) e o botão **Confirmar agendamento**.
- **Regras:** as mesmas de hoje, sem mudança (a conferência no servidor, os limites e a confirmação de e-mail).

**Meus horários:** mantém o conteúdo atual com o visual novo. Cada atendimento concluído tem o botão "Avaliar".

**Avaliar:** nota em estrelas (botões acessíveis), o comentário e o botão Enviar. Depois de enviar, volta com "Obrigada pela avaliação!".

## O que a dona configura no painel

Uma nova seção no menu, **Minha página** (`/admin/pagina`), com ícone de linha:

- **Dados:** a frase de chamada, o "sobre", o WhatsApp, o e-mail, o endereço, o link do mapa e o Instagram (aceita `@usuario` ou o link; guarda só o usuário). Inclui o botão do agendamento online.
- **Comodidades:** o checklist.
- **Produtos (`/admin/pagina/produtos`):** listar, criar, editar, ativar/desativar e "Começar com exemplos".
- **Avaliações (`/admin/pagina/avaliacoes`):** lista com nota, comentário, nome completo da paciente (a dona pode ver) e data, e o botão Esconder/Mostrar.
- **Fidelidade:** liga/desliga, N e o prêmio.
- **Ficha da paciente:** com a fidelidade ligada, mostra o progresso dela e o botão "Prêmio usado" quando ela tiver um prêmio.

## Banco e segurança

Uma migração nova (`0017`), seguindo o modelo de papéis que já existe:

- **`clinics` ganha:** `instagram_handle` (texto, `^[A-Za-z0-9._]{1,30}$`), `amenities` (`text[]`, cada item da lista fixa, com check), `loyalty_enabled`, `loyalty_visits` (2 a 50) e `loyalty_reward` (até 120).
  - **UPDATE do `app_panel`:** passa a cobrir também `headline`, `about`, `whatsapp_phone`, `contact_email`, `address`, `maps_url`, `instagram_handle`, `amenities`, `online_booking_enabled` e os três de fidelidade. Sempre só na própria clínica.
  - **Link do mapa:** `maps_url` ganha um check `^https://`.
- **Tabela `products`:** clinic_id, nome, preço em centavos opcional, descrição, ativo, ordem e datas.
  - **`app_panel`:** acesso total na própria clínica.
  - **`app_client`:** lê só os ativos, só da clínica atual.
- **Tabela `reviews`:** clinic_id, patient_id, nota (1 a 5), comentário (até 500), hidden, created_at e hidden_at/hidden_by.
  - **`app_panel`:** lê, e altera só `hidden`, `hidden_at` e `hidden_by`.
  - **`app_client`:** insere só com o próprio `patient_id`, e só se existir um agendamento `completed` dessa paciente nessa clínica, garantido pela policy no banco e não só no código. Lê só as visíveis.
  - **Leitura pública:** a página sem login lê as avaliações por uma função `SECURITY DEFINER` que devolve só nota, comentário, data e o nome abreviado. A média e o total vêm de outra função.
- **Tabela `loyalty_redemptions`:** clinic_id, patient_id, created_at e created_by. O `app_panel` insere e lê. A cliente vê o progresso por uma função definer que devolve só os números dela.
- **Página pública:** a função definer `client_public_page(slug)` devolve os dados públicos da clínica ativa: os campos de exibição, as comodidades, o Instagram, as formas de pagamento ativas e a regra de fidelidade.
- **Foto da dona:** uma rota pública `/<slug>/foto` serve só a foto da dona da clínica ativa, por uma função definer. As fotos de paciente nunca saem por ela.
- **Padrão das funções definer:** `search_path = public, pg_temp`, `REVOKE ALL FROM PUBLIC` e `EXECUTE` só para o papel que usa. A página sem login usa o `app_client` com um usuário "ninguém", como o `getPublicClinic` já faz.

## Fora do escopo

- O envio de fotos do espaço e de produtos.
- A venda online de produtos.
- A cliente responder ou apagar uma avaliação.
- A dona responder uma avaliação.
- Notificações de avaliação nova.
- A lista de espera.
- O carrinho.
- A escolha de profissional.
- A hospedagem (etapa final, separada).

## Anti-objetivos

- Mostrar qualquer dado de saúde ou contato de uma cliente para outra.
- Uma avaliação de quem nunca foi atendida.
- A página quebrar ou ficar estranha quando a dona ainda não preencheu um campo: toda seção vazia some, exceto a aba Fotos, que mostra o estado vazio.

## Sucesso

- A Karol abre o próprio link no celular e a página parece um app.
- Uma cliente nova marca em poucos toques.
- Só quem foi atendida avalia.
- Nada de uma clínica aparece em outra.
- Os testes atuais continuam passando, e há testes novos para cada regra do banco acima.
