"use client";

import {
  BUSINESS_TYPE_LABELS,
  BUSINESS_TYPES,
} from "@/modules/business-type/vocabulary";

import { businessTypePatch } from "../wizard";

import { ChoiceCard, type StepProps } from "./shared";

const HINTS = {
  clinic: "Fala “paciente” no painel.",
  barbershop: "Fala “cliente” no painel.",
  nail_salon: "Fala “cliente” no painel.",
  other: "Fala “cliente” no painel.",
} as const;

export function TipoStep({
  published,
  draft,
  saved,
  patch,
  setPatch,
}: StepProps) {
  const current = patch.businessType ?? saved.businessType;
  return (
    <fieldset className="grid gap-2">
      <legend className="sr-only">Tipo de negócio</legend>
      <p className="mb-1 text-sm text-muted-foreground">
        Sugerimos cor, letra e botões de partida. Você muda tudo depois.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {BUSINESS_TYPES.map((type) => (
          <ChoiceCard
            key={type}
            name="tipo"
            value={type}
            checked={current === type}
            onSelect={() => setPatch(businessTypePatch(type, published, draft))}
          >
            <span className="grid gap-0.5">
              <span className="text-base font-semibold">
                {BUSINESS_TYPE_LABELS[type]}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {HINTS[type]}
              </span>
            </span>
          </ChoiceCard>
        ))}
      </div>
    </fieldset>
  );
}
