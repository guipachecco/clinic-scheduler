"use client";

import { cn } from "@/lib/utils";
import type { PageDraft, PublishedPage } from "@/modules/page-builder/draft";

// What every step receives from the wizard.
export type StepProps = {
  published: PublishedPage;
  draft: PageDraft;
  // The page as saved so far: published values with the stored draft on top.
  saved: PublishedPage;
  // This step's unsaved changes; the wizard saves them on Próximo or Voltar.
  patch: PageDraft;
  setPatch: (patch: PageDraft) => void;
  // True while an image goes up: the wizard holds navigation meanwhile.
  setBusy: (busy: boolean) => void;
  fieldErrors: Record<string, string>;
};

// One choice of a radio group drawn as a card: big enough to tap, with a
// clear selected state and the native radio for keyboard and screen readers.
export function ChoiceCard({
  name,
  value,
  checked,
  onSelect,
  className,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm font-medium transition-colors",
        "has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        className="size-5 shrink-0 accent-primary"
      />
      {children}
    </label>
  );
}
