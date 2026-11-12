import { InsideTabs, type InsideTab } from "./inside-tabs";
import { RiseIn } from "./motion";
import { displayClass, Sticker, TornEdge } from "./ui";

const BASE = "/landing/por-dentro";

// The screenshots only show invented data.
const TABS: InsideTab[] = [
  {
    id: "agenda",
    label: "Agenda",
    caption: "Semana inteira numa tela só",
    desktop: {
      src: `${BASE}/agenda-desktop.webp`,
      alt: "Agenda da semana no computador, com os horários marcados de cada dia",
    },
    phone: {
      src: `${BASE}/agenda-celular.webp`,
      alt: "Agenda do dia no celular, com os atendimentos em ordem",
    },
  },
  {
    id: "orcamento",
    label: "Orçamento",
    caption: "Orçamento pronto pra mandar",
    desktop: {
      src: `${BASE}/orcamento-desktop.webp`,
      alt: "Tela de orçamento no computador, com os serviços, o valor e as parcelas",
    },
  },
  {
    id: "pagina",
    label: "Sua página",
    caption: "Sua página, do seu jeito",
    desktop: {
      src: `${BASE}/pagina-desktop.webp`,
      alt: "Página da clínica no computador, com os serviços, e o botão de agendar",
    },
    phone: {
      src: `${BASE}/pagina-celular.webp`,
      alt: "Página da clínica no celular, com os serviços e o botão de agendar",
    },
  },
  {
    id: "celular",
    label: "No celular",
    caption: "Tudo na palma da mão",
    phone: {
      src: `${BASE}/inicio-celular.webp`,
      alt: "Tela inicial do sistema no celular, com o resumo do dia",
    },
  },
];

// Real screenshots of the system, in tabs, just before the prices.
export function InsideSection() {
  return (
    <section
      aria-labelledby="landing-inside"
      className="relative bg-[#ffd3f0] text-[#2a0081]"
    >
      <TornEdge className="text-[#ffd3f0]" />
      <div className="mx-auto w-full max-w-6xl px-4 pt-16 pb-24 sm:px-6 lg:pt-24 lg:pb-32">
        <Sticker className="-rotate-2 bg-[#f5c700]">Por dentro</Sticker>
        <h2
          id="landing-inside"
          className={`${displayClass} mt-6 text-[clamp(3.25rem,16vw,7.5rem)]`}
        >
          Olha só como fica.
        </h2>
        <RiseIn>
          <InsideTabs tabs={TABS} />
        </RiseIn>
      </div>
    </section>
  );
}
