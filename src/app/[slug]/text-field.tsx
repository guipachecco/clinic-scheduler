"use client";

import type { UseFormRegisterReturn } from "react-hook-form";

import { FieldError } from "@/components/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applyMask } from "@/lib/input-mask";

// A labelled input with its error, as in the panel's forms. With `mask`, the
// value is formatted as she types (phone, CPF).
export function TextField({
  id,
  label,
  error,
  registration,
  mask,
  ...input
}: {
  id: string;
  label: string;
  error?: string;
  registration: UseFormRegisterReturn;
  mask?: (value: string) => string;
} & Omit<React.ComponentProps<"input">, "id">) {
  const onChange = mask
    ? (event: React.ChangeEvent<HTMLInputElement>) => {
        applyMask(event, mask, (value) => {
          event.target.value = value;
        });
        return registration.onChange(event);
      }
    : registration.onChange;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...input}
        {...registration}
        onChange={onChange}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}
