import { cn } from "@/lib/utils";

import { QUOTE_URL } from "./quote-link";

// Shared pieces of the landing page. The coloured sections use the Zemana
// brand colours directly (not theme tokens), so they look the same in the
// light and dark themes.

// Giant condensed headline type (Bricolage Grotesque at its narrowest width).
export const displayClass =
  "font-heading font-extrabold uppercase leading-[0.86] tracking-[-0.01em] [font-stretch:75%]";

// A tilted, outlined label in the spirit of a sticker on a notebook.
export function Sticker({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block rounded-full border-[3px] border-[#2a0081] px-4 py-1.5 font-heading text-sm font-extrabold tracking-wide text-[#2a0081] uppercase shadow-[3px_3px_0_0_#2a0081]",
        className,
      )}
    >
      {children}
    </span>
  );
}

// The irregular, torn top edge of a coloured section. It sits just above the
// section and is painted with the section's own colour (`className` sets the
// text colour, which the path fills with).
export function TornEdge({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 1200 28"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute bottom-[calc(100%-1px)] left-0 h-5 w-full sm:h-7",
        className,
      )}
    >
      <path
        fill="currentColor"
        d="M0 28V12l38 6 44-13 41 11 37-8 52 12 36-14 47 10 40-12 42 13 39-9 48 11 41-13 45 12 38-7 50 10 36-12 44 13 40-9 46 11 43-14 39 12 47-8 42 10 38-12 46 13 40-9 47 8V28Z"
      />
    </svg>
  );
}

// "Quero um orçamento": opens the owner's WhatsApp in a new tab.
export function QuoteButton({
  tone = "pink",
  className,
}: {
  tone?: "pink" | "yellow";
  className?: string;
}) {
  return (
    <a
      href={QUOTE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex min-h-14 items-center justify-center gap-2.5 rounded-full border-[3px] border-[#2a0081] px-7 font-heading text-lg font-extrabold text-[#2a0081] shadow-[5px_5px_0_0_#2a0081] transition-[transform,box-shadow] duration-100 outline-none focus-visible:ring-4 focus-visible:ring-[#2a0081]/40 active:translate-x-[3px] active:translate-y-[3px] active:shadow-[2px_2px_0_0_#2a0081]",
        tone === "pink" ? "bg-[#ffd3f0]" : "bg-[#f5c700]",
        className,
      )}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
      </svg>
      Quero um orçamento
    </a>
  );
}

// A small four-point sparkle doodle.
export function Sparkle({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 2c.6 5.4 4.6 9.4 10 10-5.4.6-9.4 4.6-10 10-.6-5.4-4.6-9.4-10-10 5.4-.6 9.4-4.6 10-10Z" />
    </svg>
  );
}
