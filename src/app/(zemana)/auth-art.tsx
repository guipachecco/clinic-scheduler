import { BrandImage } from "@/components/brand-image";
import { displayClass, Sparkle, Sticker } from "@/app/landing/ui";

// The decorated side of the sign-in pages on wide screens: the landing's
// yellow, giant condensed letters, stickers and doodles. Phones never see it
// (their one-column layout stays as it is). It is decoration only: the page's
// real title and text are next to the form.
export function AuthArt({
  lines,
  sticker,
  note,
}: {
  // The big headline, one entry per line.
  lines: string[];
  sticker: string;
  note: string;
}) {
  return (
    <div
      aria-hidden="true"
      className="relative hidden bg-[#f5c700] text-[#2a0081] lg:block"
    >
      <div className="absolute inset-0 overflow-hidden">
        <Sparkle className="absolute top-12 right-16 size-10" />
        <Sparkle className="absolute bottom-24 left-10 size-7" />
        <Sparkle className="absolute top-1/2 right-10 size-5 text-white" />

        {/* Tilted band across the bottom, like the hero's ticker. */}
        <div
          className={`${displayClass} absolute -right-8 bottom-10 -left-8 flex -rotate-3 items-center justify-center gap-5 border-y-[3px] border-[#2a0081] bg-[#ffd3f0] py-3 text-2xl whitespace-nowrap xl:text-3xl`}
        >
          Agenda
          <Sparkle className="size-5" />
          Fichas
          <Sparkle className="size-5" />
          Financeiro
          <Sparkle className="size-5" />
          Avaliações
        </div>
      </div>

      <div className="relative mx-auto flex h-full max-w-2xl flex-col justify-center gap-8 px-10 pt-14 pb-40 xl:px-14">
        <Sticker className="w-fit -rotate-3 bg-[#ffd3f0]">{sticker}</Sticker>
        <p className={`${displayClass} text-[clamp(4rem,6vw,7.5rem)]`}>
          {lines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>
        <div className="flex items-center gap-5">
          <div className="flex size-20 shrink-0 -rotate-6 items-center justify-center rounded-full border-[3px] border-[#2a0081] bg-[#2a0081] shadow-[5px_5px_0_0_#ffd3f0]">
            <BrandImage kind="symbol" size={48} onBrand />
          </div>
          <p className="max-w-xs text-lg leading-snug font-semibold">{note}</p>
        </div>
      </div>

      {/* Torn right edge, biting into the form side. */}
      <svg
        viewBox="0 0 28 1200"
        preserveAspectRatio="none"
        className="pointer-events-none absolute top-0 left-[calc(100%-1px)] z-10 h-full w-6 text-[#f5c700]"
      >
        <path
          fill="currentColor"
          transform="matrix(0 1 -1 0 28 0)"
          d="M0 28V12l38 6 44-13 41 11 37-8 52 12 36-14 47 10 40-12 42 13 39-9 48 11 41-13 45 12 38-7 50 10 36-12 44 13 40-9 46 11 43-14 39 12 47-8 42 10 38-12 46 13 40-9 47 8V28Z"
        />
      </svg>
    </div>
  );
}
