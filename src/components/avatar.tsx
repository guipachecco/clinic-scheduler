import { cn } from "@/lib/utils";

const TONES = [
  "bg-brand-accent text-brand-accent-foreground",
  "bg-primary text-primary-foreground",
  "bg-highlight text-highlight-foreground",
];

// Same color for the same person on every visit.
function toneOf(seed: string) {
  let sum = 0;
  for (const char of seed) sum += char.charCodeAt(0);
  return TONES[sum % TONES.length];
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

// A circle with the person's initials, in one of the Zemana tints.
export function Avatar({
  name,
  seed,
  muted = false,
  className,
}: {
  name: string;
  seed: string;
  muted?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-full font-heading text-sm font-extrabold",
        muted ? "bg-muted text-muted-foreground" : toneOf(seed),
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
