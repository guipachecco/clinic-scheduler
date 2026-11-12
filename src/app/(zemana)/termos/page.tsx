import type { Metadata } from "next";
import Link from "next/link";

import { authLinkClass } from "../auth-shell";
import { ContactLink, LegalPage, LegalSection } from "../legal";

export const metadata: Metadata = {
  title: "Termos de uso",
  description:
    "As regras de uso da Zemana para clientes das clínicas e para profissionais.",
  alternates: { canonical: "/termos" },
};

// Terms of use for both audiences: the clinics' clients and the professionals.
export default function TermsPage() {
  return (
    <LegalPage title="Termos de uso">
      <p>
        Estes termos valem para quem usa a Zemana: as clientes que marcam
        horários pelo link de uma clínica e as profissionais que usam o painel.
        Ao criar uma conta ou usar o sistema, você concorda com eles e com a{" "}
        <Link href="/privacidade" className={authLinkClass}>
          Política de privacidade
        </Link>
        .
      </p>

      <LegalSection title="O que a Zemana faz">
        <p>
          A Zemana oferece a agenda online, as fichas das clientes, o financeiro
          e a página de cada clínica. O atendimento em si (serviços, preços,
          horários, pagamento e resultados) é de responsabilidade da clínica ou
          profissional, não da Zemana.
        </p>
      </LegalSection>

      <LegalSection title="Para as clientes">
        <ul>
          <li>
            Use dados verdadeiros no cadastro e mantenha a sua senha em segredo.
          </li>
          <li>
            Um horário marcado online pode depender da confirmação da clínica.
            Para desmarcar ou remarcar, siga as regras da clínica.
          </li>
          <li>
            As avaliações devem ser sobre um atendimento que você recebeu, sem
            ofensas, dados de terceiros ou propaganda. A clínica pode ocultar
            avaliações.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Para as profissionais">
        <ul>
          <li>
            A conta é pessoal, protegida por verificação em duas etapas, e não
            deve ser compartilhada.
          </li>
          <li>
            Você é a responsável (controladora) pelos dados das suas clientes:
            registre só o que for necessário para o atendimento e atenda os
            pedidos delas sobre os próprios dados, com a ajuda da Zemana.
          </li>
          <li>
            O que você publica na página da clínica (textos, fotos, preços e
            produtos) deve ser verdadeiro e seu, ou usado com autorização.
          </li>
          <li>
            Os preços dos planos estão na página principal da Zemana. A cobrança
            e as demais condições são combinadas diretamente com a Zemana.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Uso proibido">
        <p>
          Não é permitido tentar acessar dados de outras pessoas ou clínicas,
          atrapalhar o funcionamento do sistema, enviar conteúdo ilegal ou usar
          a Zemana para enviar mensagens em massa. A Zemana pode suspender
          contas que fizerem isso.
        </p>
      </LegalSection>

      <LegalSection title="Disponibilidade">
        <p>
          A Zemana trabalha para manter o sistema no ar e os dados seguros, mas
          pode haver pausas para manutenção ou falhas de fornecedores. A Zemana
          não responde por prejuízos indiretos causados por essas pausas, dentro
          do que a lei permite.
        </p>
      </LegalSection>

      <LegalSection title="Encerramento">
        <p>
          A cliente pode pedir à clínica que anonimize a sua ficha. A
          profissional pode encerrar o uso combinando com a Zemana, inclusive
          sobre o que fazer com os dados da clínica.
        </p>
      </LegalSection>

      <LegalSection title="Mudanças e contato">
        <p>
          Estes termos podem mudar; a data no topo mostra a versão atual. Vale a
          lei brasileira. Dúvidas: <ContactLink />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
