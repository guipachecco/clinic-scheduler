"use client";

import { FieldError } from "@/components/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { StepProps } from "./shared";

const HEADLINE_MAX = 120;
const ABOUT_MAX = 2000;

export function TextoStep({ saved, patch, setPatch, fieldErrors }: StepProps) {
  const headline =
    patch.headline !== undefined
      ? (patch.headline ?? "")
      : (saved.headline ?? "");
  const about =
    patch.about !== undefined ? (patch.about ?? "") : (saved.about ?? "");
  const headlineError = fieldErrors.headline;
  const aboutError = fieldErrors.about;

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="frase">Frase de apresentação</Label>
        <Input
          id="frase"
          value={headline}
          maxLength={HEADLINE_MAX}
          placeholder="Ex.: Corte e barba com hora marcada"
          aria-invalid={Boolean(headlineError)}
          aria-describedby={
            headlineError ? "frase-ajuda frase-erro" : "frase-ajuda"
          }
          onChange={(event) =>
            setPatch({ ...patch, headline: event.target.value })
          }
        />
        <p id="frase-ajuda" className="text-sm text-muted-foreground">
          Aparece logo abaixo do nome. Até {HEADLINE_MAX} letras.
        </p>
        <FieldError id="frase-erro" message={headlineError} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sobre">Sobre o seu negócio</Label>
        <Textarea
          id="sobre"
          value={about}
          maxLength={ABOUT_MAX}
          rows={5}
          aria-invalid={Boolean(aboutError)}
          aria-describedby={aboutError ? "sobre-erro" : undefined}
          onChange={(event) =>
            setPatch({ ...patch, about: event.target.value })
          }
        />
        <FieldError id="sobre-erro" message={aboutError} />
      </div>
    </div>
  );
}
