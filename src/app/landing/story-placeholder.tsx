import { displayClass, Sticker, TornEdge } from "./ui";

// Steps 2 to 4 of the story in one still section. Task 4 replaces this slot
// with <ScrollStory /> (the pencil writing in a paper agenda, the giant X, the
// "PROBLEMA RESOLVIDO" stamp and the phone with the app).
export function StoryPlaceholder() {
  return (
    <section
      id="como-funciona"
      className="relative scroll-mt-4 bg-[#2a0081] text-white"
    >
      <TornEdge className="text-[#2a0081]" />
      <div className="mx-auto w-full max-w-6xl px-4 pt-20 pb-24 sm:px-6 lg:pt-28 lg:pb-32">
        <Sticker className="rotate-2 bg-[#b7e7fc]">Antes da Zemana</Sticker>
        <h2
          className={`${displayClass} mt-6 max-w-4xl text-[clamp(3rem,14vw,7.5rem)] text-[#f5c700]`}
        >
          Caderno, rasura e “tem horário amanhã?”
        </h2>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/90">
          A agenda de papel enche de rabisco, o mesmo horário vai pra duas
          clientes e o WhatsApp não para de vibrar. A Zemana põe ordem nisso.
        </p>
        <p
          className={`${displayClass} mt-10 inline-block -rotate-6 rounded-xl border-[5px] border-double border-[#f5c700] px-5 py-3 text-4xl text-[#f5c700] sm:text-5xl`}
        >
          Problema resolvido
        </p>
      </div>
    </section>
  );
}
