import type { Metadata } from "next";

import { ContactLink, LegalPage, LegalSection } from "../legal";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description:
    "Como a Zemana e as clínicas que usam a Zemana tratam os dados pessoais, conforme a LGPD.",
  alternates: { canonical: "/privacidade" },
};

// Privacy policy (LGPD, Lei 13.709/2018). It describes only what the system
// really stores and the providers it really uses.
export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidade">
      <p>
        A Zemana é um sistema de agenda online para profissionais de beleza e
        saúde. Esta política explica quais dados pessoais passam pela Zemana,
        para quê, com quem são compartilhados e como você exerce seus direitos
        pela Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).
      </p>

      <LegalSection title="Quem é responsável pelos dados">
        <ul>
          <li>
            <strong>Dados das clientes de uma clínica</strong> (cadastro, ficha
            e horários): a responsável (controladora) é a clínica ou
            profissional em que você é atendida. A Zemana guarda e processa
            esses dados em nome dela (operadora), seguindo as instruções dela.
          </li>
          <li>
            <strong>Dados das contas das profissionais e deste site</strong>: a
            responsável é a Zemana.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Quais dados tratamos">
        <ul>
          <li>
            <strong>Conta:</strong> nome, e-mail e senha (guardada de forma
            cifrada, que nem a Zemana consegue ler). Contas das profissionais
            também têm a verificação em duas etapas.
          </li>
          <li>
            <strong>Ficha na clínica:</strong> nome, telefone e e-mail, e o que
            a profissional decidir registrar, como apelido, data de nascimento,
            CPF, RG, telefone fixo, quem indicou e observações.
          </li>
          <li>
            <strong>Atendimentos:</strong> horários marcados, serviços, valores,
            pagamentos, cancelamentos e motivos, pontos de fidelidade e as
            avaliações que você escrever.
          </li>
          <li>
            <strong>Dados técnicos:</strong> endereço IP e navegador de cada
            sessão, registros de segurança das ações feitas no sistema e
            contagem de visitas sem identificar quem visitou.
          </li>
        </ul>
        <p>
          As observações da profissional podem incluir informações de saúde
          ligadas ao atendimento, que são dados sensíveis. Elas só são vistas
          pela clínica que as registrou.
        </p>
      </LegalSection>

      <LegalSection title="Para que usamos">
        <ul>
          <li>
            Marcar, confirmar, remarcar e cancelar horários, e mostrar a você os
            seus horários (execução do serviço que você pediu).
          </li>
          <li>
            Permitir que a profissional organize a agenda, as fichas, o
            financeiro e a página da clínica (execução de contrato e legítimo
            interesse da clínica).
          </li>
          <li>Enviar e-mails de confirmação de conta e de troca de senha.</li>
          <li>
            Proteger as contas contra acesso indevido e cumprir obrigações
            legais (segurança e exercício regular de direitos).
          </li>
        </ul>
        <p>
          A Zemana não vende dados, não usa os dados das clientes para
          publicidade e não mistura os dados de uma clínica com os de outra.
        </p>
      </LegalSection>

      <LegalSection title="O que fica público">
        <p>
          A página de cada clínica é pública: nome, serviços, preços, horários,
          endereço e contatos que a profissional escolheu mostrar. As avaliações
          aparecem com o primeiro nome e a inicial do sobrenome de quem avaliou
          (por exemplo, &ldquo;Ana S.&rdquo;), e a profissional pode ocultá-las.
        </p>
      </LegalSection>

      <LegalSection title="Com quem compartilhamos">
        <p>
          Só com os fornecedores necessários para o sistema funcionar, que
          tratam os dados apenas para isso:
        </p>
        <ul>
          <li>Vercel: hospedagem do site.</li>
          <li>Neon: banco de dados, guardado em São Paulo.</li>
          <li>MailerSend: envio dos e-mails do sistema.</li>
          <li>Cloudflare: endereço (DNS) do site.</li>
        </ul>
        <p>
          Alguns desses fornecedores podem processar dados fora do Brasil, com
          as garantias de proteção exigidas pela LGPD. Também podemos
          compartilhar dados quando a lei ou uma autoridade exigir.
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          Usamos apenas cookies necessários: o que mantém você conectada à sua
          conta e o que guarda a sua escolha de tema claro ou escuro. A contagem
          de visitas não usa cookies.
        </p>
      </LegalSection>

      <LegalSection title="Por quanto tempo guardamos">
        <p>
          Enquanto a conta ou a relação com a clínica existir e, depois disso,
          pelo tempo exigido por lei. A pedido, a clínica pode anonimizar a sua
          ficha: o nome e os contatos são apagados e ficam apenas números sem
          identificação, como o total de atendimentos.
        </p>
      </LegalSection>

      <LegalSection title="Segurança">
        <p>
          A conexão é sempre cifrada (HTTPS), as senhas são cifradas, as contas
          das profissionais têm verificação em duas etapas, e o banco de dados
          separa cada clínica para que uma nunca veja os dados de outra.
        </p>
      </LegalSection>

      <LegalSection title="Seus direitos">
        <p>
          Você pode pedir a confirmação de que tratamos seus dados, o acesso a
          eles, a correção, a anonimização ou a eliminação, a portabilidade, a
          informação sobre com quem foram compartilhados e a revisão do seu
          consentimento, quando ele for a base do tratamento.
        </p>
        <p>
          Sobre os dados da sua ficha, fale primeiro com a sua clínica; a Zemana
          ajuda a clínica a atender o pedido. Para todo o resto, ou se não
          conseguir falar com a clínica, fale com a Zemana pelo <ContactLink />.
          Você também pode reclamar à Autoridade Nacional de Proteção de Dados
          (ANPD).
        </p>
      </LegalSection>

      <LegalSection title="Menores de idade">
        <p>
          A conta é para maiores de 18 anos. O cadastro de menores é feito pela
          clínica, com a autorização de quem é responsável por eles.
        </p>
      </LegalSection>

      <LegalSection title="Mudanças nesta política">
        <p>Se esta política mudar, a data no topo é atualizada.</p>
      </LegalSection>
    </LegalPage>
  );
}
