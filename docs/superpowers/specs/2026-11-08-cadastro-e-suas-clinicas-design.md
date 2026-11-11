# Cadastro pela Zemana e "Suas clínicas" (modelo A) — design

Data: 2026-11-08.

## Intenção

Hoje, em `zemana.com.br/entrar`, a cliente não tem como criar conta: a conta só nasce pelo link de uma clínica. E a tela "Suas clínicas" mostra só o nome e dois botões. Agora as clínicas têm fotos, e a tela pode ser o lugar onde a cliente vê o que importa de cada clínica.

## Decisões do dono

**Cadastro pela lista de clínicas ("Isso mesmo"):**

1. **Link em `/entrar`:** "Ainda não tem conta? Criar conta".
2. **Lista:** "Criar conta" abre `/clinicas`, uma lista das clínicas da Zemana. Cada cartão mostra a capa, a foto da dona (ou as iniciais), o nome e a área.
3. **Escolha:** um toque leva ao cadastro que já existe na clínica (`/<endereço>/cadastro`), com a volta para "Suas clínicas". A conta e a ficha nascem juntas, como hoje.
4. **Outra clínica:** "Suas clínicas" ganha "Adicionar outra clínica", que leva à mesma lista. Com a conta já criada, ela só completa a ficha na clínica (o formulário que já existe), sem criar outra senha.

**"Suas clínicas", modelo A (aprovado: "Modelo A"):**

- **Topo:** "Olá, <primeiro nome>" e o título "Suas clínicas".
- **Cabeça de cada cartão:** a capa (a primeira foto da clínica, ou uma área neutra se não tiver fotos), com a nota das avaliações num selo. Abaixo vêm a foto da dona sobreposta, o nome e a área.
- **Próximo horário:** um destaque rosa com o próximo horário marcado dela naquela clínica ("Qui, 14/11 às 14h · Esmaltação"). Sem horário, aparece "Nenhum horário marcado".
- **Fidelidade:** quando a clínica tem fidelidade, aparece "Fidelidade 3 de 10" com bolinhas, ou o prêmio se ela já ganhou.
- **Ações:**
  - botões **Agendar** (principal) e **Meus horários**;
  - links **Ver página** e **WhatsApp** (só se a clínica tiver WhatsApp).
- **Fim da lista:** "Adicionar outra clínica".
- **Sem nenhuma clínica:** a mensagem atual, mais o botão "Escolher clínica".

## Decisões minhas (o dono pode mudar)

- **Lista em `/clinicas`:**
  - entram todas as clínicas **ativas**, inclusive as com agendamento online desligado (o cadastro delas já funciona);
  - a ordem é alfabética;
  - `clinicas` entra nos endereços reservados (nenhuma clínica de produção usa esse nome);
  - a página é pública e entra no mapa do site.
- **Lista "Adicionar outra clínica":** não repete as clínicas em que ela já é cliente.
- **Dados de cada clínica na tela "Suas clínicas":**
  - vêm de uma função do banco (`client_my_clinics`), refeita na migração 0021;
  - ela devolve só o que é da própria cliente (o próximo horário e a fidelidade dela) e o que já é público (nome, área, capa, nota, WhatsApp);
  - o próximo horário conta só os pedidos e os confirmados, a partir de agora;
  - a fidelidade usa a mesma conta da página da clínica.
- **Lista pública:** vem de outra função nova, `client_public_clinics()`, que só tem dados públicos.
- **Segurança:** o id da cliente sai da sessão, nunca do pedido, como já é hoje. Nenhuma ficha, contato ou dado de outras clientes sai das funções.
- **Visual:** mantém a marca Zemana (roxo, rosa, amarelo) e os ícones de linha, sem emoji. Funciona nos temas claro e escuro e em 360 px.

## Abordagens consideradas

1. **Reaproveitar o cadastro de cada clínica (escolhida):** nenhuma regra nova de conta, cada ficha continua separada, e o caminho é o mesmo do link.
2. **Conta sem clínica, escolhida depois:** permitiria contas soltas sem ficha, mas precisaria de um passo novo de criar ficha e deixaria contas vazias no banco.

## Não-objetivos

- Busca ou filtro na lista (são poucas clínicas).
- Desmarcar pela tela "Suas clínicas": isso continua em "Meus horários".
- Tela no painel para as donas enviarem fotos (fica para depois).

## O que fica para o construtor

O texto exato, a divisão em componentes e os detalhes visuais, seguindo o modelo A aprovado.
