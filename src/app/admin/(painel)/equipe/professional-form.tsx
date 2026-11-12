"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_SORT_ORDER,
  professionalFormSchema,
  type ProfessionalFormInput,
  type ProfessionalFormValues,
} from "@/modules/professionals/fields";

import { createProfessionalAction, updateProfessionalAction } from "./actions";

const SAVE_ERROR = "Não foi possível salvar. Tente novamente.";

const EMPTY: ProfessionalFormInput = {
  name: "",
  registration: "",
  sortOrder: "",
  isActive: true,
};

type Props =
  | { mode: "create" }
  | { mode: "edit"; id: string; defaults: ProfessionalFormInput };

// Adds a professional to the team, or edits one, inline on the team page.
export function ProfessionalForm(props: Props) {
  const router = useRouter();
  const prefix =
    props.mode === "edit" ? `profissional-${props.id}` : "profissional";
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfessionalFormInput, unknown, ProfessionalFormValues>({
    resolver: zodResolver(professionalFormSchema),
    defaultValues: props.mode === "edit" ? props.defaults : EMPTY,
  });

  async function onSubmit() {
    setFormError(null);
    const input = getValues();
    let result;
    try {
      result =
        props.mode === "edit"
          ? await updateProfessionalAction(props.id, input)
          : await createProfessionalAction(input);
    } catch {
      setFormError(SAVE_ERROR);
      return;
    }
    if (result.ok) {
      if (props.mode === "create") reset(EMPTY);
      router.refresh();
      return;
    }
    const entries = Object.entries(result.fieldErrors);
    entries.forEach(([name, message], index) => {
      setError(
        name as keyof ProfessionalFormInput,
        { message },
        { shouldFocus: index === 0 },
      );
    });
    setFormError(
      result.formError ?? (entries.length === 0 ? SAVE_ERROR : null),
    );
  }

  const field = (name: keyof ProfessionalFormInput) => {
    const message = errors[name]?.message;
    return {
      id: `${prefix}-${name}`,
      error: message,
      describedBy: message ? `${prefix}-${name}-error` : undefined,
    };
  };
  const name = field("name");
  const registration = field("registration");
  const sortOrder = field("sortOrder");
  const isActive = field("isActive");

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor={name.id}>Nome</Label>
          <Input
            id={name.id}
            autoComplete="off"
            aria-invalid={Boolean(name.error)}
            aria-describedby={name.describedBy}
            {...register("name")}
          />
          <FieldError id={`${name.id}-error`} message={name.error} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={registration.id}>Registro profissional</Label>
          <Input
            id={registration.id}
            autoComplete="off"
            placeholder="Opcional"
            aria-invalid={Boolean(registration.error)}
            aria-describedby={registration.describedBy}
            {...register("registration")}
          />
          <FieldError
            id={`${registration.id}-error`}
            message={registration.error}
          />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={sortOrder.id}>Ordem na lista</Label>
          <Input
            id={sortOrder.id}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_SORT_ORDER}
            placeholder="0"
            aria-invalid={Boolean(sortOrder.error)}
            aria-describedby={sortOrder.describedBy ?? `${sortOrder.id}-hint`}
            {...register("sortOrder")}
          />
          <p
            id={`${sortOrder.id}-hint`}
            className="text-xs text-muted-foreground"
          >
            A primeira ativa da lista recebe os agendamentos online.
          </p>
          <FieldError id={`${sortOrder.id}-error`} message={sortOrder.error} />
        </div>
        <div className="grid content-start gap-2">
          <label
            htmlFor={isActive.id}
            className="flex h-11 items-center gap-3 text-sm font-medium sm:mt-7"
          >
            <input
              id={isActive.id}
              type="checkbox"
              className="size-5 accent-primary"
              aria-invalid={Boolean(isActive.error)}
              aria-describedby={isActive.describedBy}
              {...register("isActive")}
            />
            Ativa (aparece na agenda)
          </label>
          <FieldError id={`${isActive.id}-error`} message={isActive.error} />
        </div>
      </div>
      <FormError message={formError} />
      <Button type="submit" disabled={isSubmitting} className="w-fit">
        {isSubmitting
          ? "Salvando..."
          : props.mode === "edit"
            ? "Salvar"
            : "Adicionar à equipe"}
      </Button>
    </form>
  );
}
