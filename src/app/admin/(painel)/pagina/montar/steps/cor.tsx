"use client";

import { useState } from "react";

import { FieldError } from "@/components/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { HEX_COLOR } from "@/modules/branding/derive";

import { normalizeColor } from "../wizard";

import type { StepProps } from "./shared";

export const COLOR_SHORTCUTS = [
  { value: "#7a3cff", label: "Roxo" },
  { value: "#2f6f9f", label: "Azul" },
  { value: "#0a7d5a", label: "Verde" },
  { value: "#c2577a", label: "Rosa" },
  { value: "#d9480f", label: "Laranja" },
  { value: "#1f1b1a", label: "Preto" },
] as const;

export function CorStep({ saved, patch, setPatch, fieldErrors }: StepProps) {
  const color = patch.theme?.primaryColor ?? saved.theme.primaryColor ?? "";
  const [text, setText] = useState(color);
  const valid = HEX_COLOR.test(color);
  const error = fieldErrors["theme.primaryColor"];

  function choose(value: string) {
    setText(value);
    setPatch({ theme: { primaryColor: normalizeColor(value) } });
  }

  return (
    <div className="grid gap-5">
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">Cores prontas</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {COLOR_SHORTCUTS.map((shortcut) => (
            <label
              key={shortcut.value}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium",
                "has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
              )}
            >
              <input
                type="radio"
                name="cor"
                value={shortcut.value}
                checked={color === shortcut.value}
                onChange={() => choose(shortcut.value)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className="size-6 shrink-0 rounded-full border"
                style={{ backgroundColor: shortcut.value }}
              />
              {shortcut.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-2">
        <Label htmlFor="cor-seletor">Ou escolha qualquer cor</Label>
        <input
          id="cor-seletor"
          type="color"
          value={valid ? color : "#7a3cff"}
          onChange={(event) => choose(event.target.value)}
          className="h-11 w-24 cursor-pointer rounded-lg border bg-card p-1"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="cor-codigo">Código da cor</Label>
        <Input
          id="cor-codigo"
          value={text}
          placeholder="#7a3cff"
          autoComplete="off"
          spellCheck={false}
          className="max-w-40 font-mono"
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? "cor-codigo-ajuda cor-erro" : "cor-codigo-ajuda"
          }
          onChange={(event) => {
            setText(event.target.value);
            const value = normalizeColor(event.target.value);
            // Empty means "keep the saved color".
            setPatch(value === "" ? {} : { theme: { primaryColor: value } });
          }}
        />
        <p id="cor-codigo-ajuda" className="text-sm text-muted-foreground">
          No formato #rrggbb, por exemplo #0a7d5a.
        </p>
        <FieldError id="cor-erro" message={error} />
      </div>
    </div>
  );
}
