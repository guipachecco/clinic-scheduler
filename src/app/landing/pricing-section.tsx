import { cn } from "@/lib/utils";

import { RiseIn } from "./motion";
import { pricingFor, type ShownPlan } from "./pricing";
import { displayClass, Sticker, TornEdge } from "./ui";

// Per-plan look: Agenda is yellow, Completo is purple with a yellow shadow.
const LOOK: Record<
  ShownPlan["id"],
  { card: string; tilt: string; name: string; tag: string; button: string }
> = {
  agenda: {
    card: "bg-[#f5c700] text-[#2a0081] shadow-[6px_6px_0_0_#2a0081]",
    tilt: "-rotate-[1.5deg]",
    name: "",
    tag: "bg-white",
    button: "bg-white",
  },
  completo: {
    card: "bg-[#2a0081] text-white shadow-[6px_6px_0_0_#f5c700]",
    tilt: "rotate-[1.5deg]",
    name: "text-[#f5c700]",
    tag: "bg-[#f5c700]",
    button: "bg-[#ffd3f0]",
  },
};

// The plans and their prices. The launch price shows until the switch-over
// date; the page revalidates hourly so the change needs no deploy.
export function PricingSection() {
  const { launch, plans } = pricingFor(new Date());

  return (
    <section
      aria-labelledby="landing-pricing"
      className="relative bg-[#b7e7fc] text-[#2a0081]"
    >
      <TornEdge className="text-[#b7e7fc]" />
      <div className="mx-auto w-full max-w-6xl px-4 pt-16 pb-24 sm:px-6 lg:pt-24 lg:pb-32">
        <Sticker className="rotate-2 bg-white">Preços</Sticker>
        <h2
          id="landing-pricing"
          className={`${displayClass} mt-6 text-[clamp(3.25rem,16vw,7.5rem)]`}
        >
          Sem letra miúda.
        </h2>
        <p className="mt-4 max-w-xl text-base font-semibold">
          Pra beleza, estética e saúde. Sem fidelidade, cancele quando quiser.
        </p>
        <ul className="mt-12 grid gap-10 md:grid-cols-2 md:gap-8">
          {plans.map((plan, index) => {
            const look = LOOK[plan.id];
            return (
              <li key={plan.id}>
                <RiseIn
                  testId="plan-card"
                  delay={index * 0.08}
                  className="h-full"
                >
                  <article
                    className={cn(
                      "relative flex h-full flex-col rounded-[1.75rem] border-[3px] border-[#2a0081] p-6",
                      look.card,
                      look.tilt,
                    )}
                  >
                    <span
                      className={cn(
                        "absolute -top-4 right-5 rotate-6 rounded-full border-[3px] border-[#2a0081] px-3 py-0.5 font-heading text-sm font-extrabold text-[#2a0081] uppercase",
                        look.tag,
                      )}
                    >
                      {plan.audience}
                    </span>
                    <h3
                      className={cn(
                        displayClass,
                        "text-5xl sm:text-[3.25rem]",
                        look.name,
                      )}
                    >
                      {plan.name}
                    </h3>
                    <p className="mt-2 text-base leading-relaxed">
                      {plan.description}
                    </p>
                    <div className="mt-4 min-h-6 text-base font-semibold opacity-70">
                      {plan.regularPrice ? (
                        <s>
                          <span>{plan.regularPrice}</span>/mês
                        </s>
                      ) : null}
                    </div>
                    <p className="font-heading leading-[0.9] font-extrabold">
                      <span className="text-[clamp(3rem,15vw,4.75rem)] [font-stretch:75%]">
                        {plan.price}
                      </span>
                      <span className="ml-1 text-xl">/mês</span>
                    </p>
                    <ul className="mt-5 mb-6 flex-1 space-y-1 text-base leading-snug">
                      {plan.includes.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span aria-hidden="true" className="text-[#ba1650]">
                            ✦
                          </span>
                          {item}
                        </li>
                      ))}
                    </ul>
                    <a
                      href={plan.ctaHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "inline-flex min-h-14 items-center justify-center rounded-full border-[3px] border-[#2a0081] px-7 font-heading text-lg font-extrabold text-[#2a0081] shadow-[5px_5px_0_0_#2a0081] transition-[transform,box-shadow] duration-100 outline-none focus-visible:ring-4 focus-visible:ring-[#2a0081]/40 active:translate-x-[3px] active:translate-y-[3px] active:shadow-[2px_2px_0_0_#2a0081]",
                        look.button,
                      )}
                    >
                      {plan.ctaLabel}
                    </a>
                  </article>
                </RiseIn>
              </li>
            );
          })}
        </ul>
        <div className="mt-12 flex flex-wrap justify-center gap-4">
          <Sticker className="-rotate-1 bg-[#ffd3f0]">1º mês grátis</Sticker>
          {launch ? (
            <Sticker className="rotate-1 bg-[#f5c700]">
              Preço de lançamento até 31/12: garanta esse preço
            </Sticker>
          ) : null}
        </div>
      </div>
    </section>
  );
}
