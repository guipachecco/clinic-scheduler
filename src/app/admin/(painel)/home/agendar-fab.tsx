import Link from "next/link";

// The yellow "Agendar" button of the panel: a normal button on computer
// (`agendarClass`) and a floating one above the bottom bar on phones
// (`FloatingAgendar`). Pages using the floating one keep `pb-24 md:pb-0`.
export const agendarClass =
  "items-center gap-2 rounded-full bg-highlight px-5 text-sm font-extrabold text-highlight-foreground shadow-lg transition-colors hover:bg-highlight/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-5"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function FloatingAgendar() {
  return (
    <Link
      href="/admin/agenda/novo"
      className={`fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 inline-flex min-h-12 md:hidden ${agendarClass}`}
    >
      <PlusIcon />
      Agendar
    </Link>
  );
}
