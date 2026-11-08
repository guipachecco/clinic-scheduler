import { BrandImage } from "@/components/brand-image";

import { BouncingLogo, SpinningRing } from "./motion";
import { displayClass, QuoteButton, Sparkle, Sticker } from "./ui";

const TICKER = [
  "Agendamento online",
  "Agenda",
  "Fichas das clientes",
  "Financeiro",
  "Página da clínica",
  "Avaliações",
  "Fidelidade",
];

// Step 1 of the story: yellow, giant letters, the bouncing logo and the
// quote button. Ends with a tilted ticker band.
export function Hero() {
  return (
    <section className="relative bg-[#f5c700] text-[#2a0081]">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 pt-8 pb-20 sm:px-6 lg:grid-cols-[1.35fr_1fr] lg:items-center lg:pt-16 lg:pb-28">
        <div>
          <Sticker className="-rotate-3 bg-[#ffd3f0]">
            Agenda online pra beleza e saúde
          </Sticker>
          <h1
            className={`${displayClass} mt-6 text-[clamp(4.25rem,22vw,9.5rem)] lg:text-[clamp(6rem,11vw,10rem)]`}
          >
            <span className="block">Sua </span>
            <span className="block">agenda, </span>
            <span className="relative block w-fit">
              sem bagunça.
              <svg
                viewBox="0 0 300 20"
                preserveAspectRatio="none"
                fill="none"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="round"
                aria-hidden="true"
                className="absolute -bottom-3 left-0 h-4 w-full text-[#2a0081] sm:-bottom-4 sm:h-5"
              >
                <path d="M4 12c22-8 40 6 62-1s40-8 62 0 42 7 64-1 40-8 62 0 32 5 42 1" />
              </svg>
            </span>
          </h1>
          <p className="mt-9 max-w-xl text-lg leading-relaxed font-medium sm:text-xl">
            A Zemana organiza os horários, as clientes e o caixa da sua clínica.
            Sua cliente marca pelo link, e você fica livre pra atender.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <QuoteButton />
            <a
              href="#como-funciona"
              className="inline-flex min-h-11 items-center gap-1.5 font-heading text-base font-bold underline decoration-[3px] underline-offset-[6px] outline-none focus-visible:ring-4 focus-visible:ring-[#2a0081]/40"
            >
              Ver como funciona
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M19 12l-7 7-7-7" />
              </svg>
            </a>
          </div>
        </div>

        <div className="relative mx-auto size-64 sm:size-80 lg:size-[26rem]">
          <Sparkle className="absolute -top-2 left-2 size-9 text-[#2a0081]" />
          <Sparkle className="absolute right-0 bottom-6 size-7 text-[#2a0081]" />
          <Sparkle className="absolute top-10 -right-3 size-5 text-white" />
          <SpinningRing>
            <svg viewBox="0 0 200 200" aria-hidden="true" className="size-full">
              <defs>
                <path
                  id="landing-ring"
                  d="M100 100m-86 0a86 86 0 1 1 172 0a86 86 0 1 1-172 0"
                />
              </defs>
              <text
                fill="#2a0081"
                fontSize="13.4"
                fontWeight="800"
                letterSpacing="2.4"
                className="font-heading"
              >
                <textPath href="#landing-ring">
                  SEM BAGUNÇA · SEM RASURA · SEM CADERNINHO · AGENDA EM DIA ·
                </textPath>
              </text>
            </svg>
          </SpinningRing>
          <div className="absolute inset-[16%] flex items-center justify-center">
            <BouncingLogo>
              <div className="flex aspect-square w-[10.5rem] items-center justify-center rounded-full border-[4px] border-[#2a0081] bg-[#2a0081] shadow-[8px_8px_0_0_#ffd3f0] sm:w-[13rem] lg:w-[17rem]">
                <BrandImage
                  kind="symbol"
                  size={120}
                  onBrand
                  className="w-[58%]!"
                />
              </div>
            </BouncingLogo>
          </div>
        </div>
      </div>

      <div className="relative left-1/2 z-10 -mb-6 w-[112%] -translate-x-1/2 -rotate-2 overflow-hidden border-y-[3px] border-[#2a0081] bg-[#ffd3f0] py-3 text-[#2a0081]">
        <div className="landing-ticker flex w-max">
          {[0, 1].map((copy) => (
            <ul
              key={copy}
              aria-hidden={copy === 1 ? true : undefined}
              className="flex shrink-0 items-center"
            >
              {TICKER.map((item) => (
                <li
                  key={item}
                  className={`${displayClass} flex items-center gap-5 pr-5 text-2xl whitespace-nowrap sm:text-3xl`}
                >
                  {item}
                  <Sparkle className="size-5" />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}
