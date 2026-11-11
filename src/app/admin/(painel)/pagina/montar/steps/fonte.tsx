"use client";

import { FONTS } from "@/modules/page-style/fonts";

import { ChoiceCard, type StepProps } from "./shared";

// Only the titles change; the text of the page keeps the panel's font.
export function FonteStep({ saved, patch, setPatch }: StepProps) {
  const current = patch.theme?.fontId ?? saved.theme.fontId ?? FONTS[0].id;
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm text-muted-foreground">
        Vale para os títulos da página.
      </legend>
      {FONTS.map((font) => (
        <ChoiceCard
          key={font.id}
          name="fonte"
          value={font.id}
          checked={current === font.id}
          onSelect={() => setPatch({ theme: { fontId: font.id } })}
        >
          <span
            className="text-xl font-bold"
            style={{ fontFamily: `${font.family}, system-ui, sans-serif` }}
          >
            {font.label}
          </span>
        </ChoiceCard>
      ))}
    </fieldset>
  );
}
