import { displayClass } from "../ui";

// The tilted rubber stamp. The text is one node so it reads as one phrase.
export function Stamp() {
  return (
    <p
      className={`${displayClass} w-min -rotate-[9deg] rounded-2xl border-[6px] border-double border-[#2a0081] bg-[#ffd3f0] px-4 py-3 text-center text-[clamp(2.1rem,10vw,3.25rem)] text-[#2a0081] shadow-[6px_6px_0_0_#2a0081]`}
    >
      Problema resolvido
    </p>
  );
}
