import { displayClass, QuoteButton, Sparkle, Sticker, TornEdge } from "./ui";

// Step 6: the last call to ask for a quote.
export function FinalCta() {
  return (
    <section
      aria-labelledby="landing-final"
      className="relative bg-[#ffd3f0] text-[#2a0081]"
    >
      <TornEdge className="text-[#ffd3f0]" />
      <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center px-4 pt-20 pb-24 text-center sm:px-6 lg:pt-28 lg:pb-32">
        <Sparkle className="absolute top-10 left-6 size-8 sm:left-10 sm:size-10" />
        <Sparkle className="absolute right-6 bottom-16 size-6 sm:right-12 sm:size-9" />
        <Sticker className="rotate-3 bg-[#f5c700]">Sem compromisso</Sticker>
        <h2
          id="landing-final"
          className={`${displayClass} mt-6 text-[clamp(3.5rem,17vw,8.5rem)]`}
        >
          Bora organizar sua agenda?
        </h2>
        <p className="mt-6 max-w-lg text-lg leading-relaxed font-medium">
          Chama a gente no WhatsApp, conta como funciona a sua clínica e a gente
          prepara um orçamento pra você.
        </p>
        <svg
          viewBox="0 0 120 60"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="mt-4 h-12 w-24 -rotate-6"
        >
          <path d="M8 10c20 2 50 6 62 22 6 8 8 16 6 22" />
          <path d="M64 44l12 12 12-14" />
        </svg>
        <QuoteButton tone="yellow" className="mt-2" />
      </div>
    </section>
  );
}
