"use client";

import {
  type ButtonFill,
  type ButtonShape,
  buttonRadius,
} from "@/modules/page-style/buttons";

import { ChoiceCard, type StepProps } from "./shared";

const SHAPES: { value: ButtonShape; label: string }[] = [
  { value: "pill", label: "Redondo" },
  { value: "rounded", label: "Levemente arredondado" },
  { value: "square", label: "Quadrado" },
];

const FILLS: { value: ButtonFill; label: string }[] = [
  { value: "solid", label: "Cheio" },
  { value: "outline", label: "Só o contorno" },
];

export function BotoesStep({ saved, patch, setPatch }: StepProps) {
  const shape = patch.theme?.buttonShape ?? saved.theme.buttonShape ?? "pill";
  const fill = patch.theme?.buttonFill ?? saved.theme.buttonFill ?? "solid";

  return (
    <div className="grid gap-5">
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Formato</legend>
        {SHAPES.map((option) => (
          <ChoiceCard
            key={option.value}
            name="formato"
            value={option.value}
            checked={shape === option.value}
            onSelect={() =>
              setPatch({ theme: { ...patch.theme, buttonShape: option.value } })
            }
          >
            <span
              aria-hidden="true"
              className="h-7 w-14 shrink-0 border-2 border-foreground/60 bg-muted"
              style={{ borderRadius: buttonRadius(option.value) }}
            />
            {option.label}
          </ChoiceCard>
        ))}
      </fieldset>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Preenchimento</legend>
        <div className="grid grid-cols-2 gap-2">
          {FILLS.map((option) => (
            <ChoiceCard
              key={option.value}
              name="preenchimento"
              value={option.value}
              checked={fill === option.value}
              onSelect={() =>
                setPatch({
                  theme: { ...patch.theme, buttonFill: option.value },
                })
              }
            >
              {option.label}
            </ChoiceCard>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
