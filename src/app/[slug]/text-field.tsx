"use client";

import type { UseFormRegisterReturn } from "react-hook-form";

import { FieldError } from "@/components/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// A labelled input with its error, as in the panel's forms.
export function TextField({
  id,
  label,
  error,
  registration,
  ...input
}: {
  id: string;
  label: string;
  error?: string;
  registration: UseFormRegisterReturn;
} & Omit<React.ComponentProps<"input">, "id">) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...input}
        {...registration}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}
