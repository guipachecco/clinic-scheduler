import { cn } from "@/lib/utils";

import { RiseIn } from "./motion";
import { displayClass, Sticker, TornEdge } from "./ui";

// Only what the system already does: no reminders, no app-store app, no
// online payments, no prices.
const FEATURES = [
  {
    title: "Agendamento pelo link",
    text: "Sua clínica ganha um link só dela. A cliente escolhe o serviço e um horário livre, sem aquele vai e vem de mensagem.",
    card: "bg-[#f5c700] text-[#2a0081]",
    tilt: "-rotate-2",
    icon: (
      <>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </>
    ),
  },
  {
    title: "Agenda e fichas",
    text: "Todos os horários num calendário só, e a ficha de cada cliente com contato e histórico de atendimentos.",
    card: "bg-[#ffd3f0] text-[#2a0081]",
    tilt: "rotate-[1.5deg]",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
      </>
    ),
  },
  {
    title: "Financeiro",
    text: "Anote o que entrou e o que saiu e acompanhe o caixa da clínica, sem planilha e sem caderninho.",
    card: "bg-white text-[#2a0081]",
    tilt: "-rotate-1",
    icon: (
      <>
        <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
        <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
      </>
    ),
  },
  {
    title: "Página da clínica",
    text: "Uma página caprichada com seus serviços, as avaliações das clientes e o cartão fidelidade.",
    card: "bg-[#2a0081] text-white",
    tilt: "rotate-2",
    icon: (
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    ),
  },
];

// Step 5: what Zemana does, as tilted colour cards on light blue.
export function Features() {
  return (
    <section
      aria-labelledby="landing-features"
      className="relative bg-[#b7e7fc] text-[#2a0081]"
    >
      <TornEdge className="text-[#b7e7fc]" />
      <div className="mx-auto w-full max-w-6xl px-4 pt-16 pb-24 sm:px-6 lg:pt-24 lg:pb-32">
        <Sticker className="-rotate-2 bg-[#ffd3f0]">O que a Zemana faz</Sticker>
        <h2
          id="landing-features"
          className={`${displayClass} mt-6 text-[clamp(3.25rem,16vw,7.5rem)]`}
        >
          Tudo num lugar só.
        </h2>
        <ul className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {FEATURES.map((feature, index) => (
            <li key={feature.title}>
              <RiseIn
                testId="feature-card"
                delay={index * 0.08}
                className="h-full"
              >
                <article
                  className={cn(
                    "relative h-full rounded-[1.75rem] border-[3px] border-[#2a0081] p-6 shadow-[6px_6px_0_0_#2a0081]",
                    feature.card,
                    feature.tilt,
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="absolute -top-4 right-5 rotate-6 rounded-full border-[3px] border-[#2a0081] bg-white px-3 py-0.5 font-heading text-sm font-extrabold text-[#2a0081]"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="flex size-14 items-center justify-center rounded-full border-[3px] border-current">
                    <svg
                      width="26"
                      height="26"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {feature.icon}
                    </svg>
                  </span>
                  <h3 className="mt-5 font-heading text-2xl leading-tight font-extrabold">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-base leading-relaxed">
                    {feature.text}
                  </p>
                </article>
              </RiseIn>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
