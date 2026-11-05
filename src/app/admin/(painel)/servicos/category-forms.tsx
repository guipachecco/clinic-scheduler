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
  categoryFormSchema,
  type CategoryFormInput,
  type CategoryFormValues,
} from "@/modules/services/fields";

import { createCategoryAction, updateCategoryAction } from "./actions";

const SAVE_ERROR = "Não foi possível salvar. Tente novamente.";

const EMPTY: CategoryFormInput = { name: "", sortOrder: "0", isActive: true };

type Props =
  | { mode: "create" }
  | { mode: "edit"; id: string; defaults: CategoryFormInput };

// A small inline form to add a category or to edit one (name, order, active).
export function CategoryForm(props: Props) {
  const router = useRouter();
  const prefix = props.mode === "edit" ? `categoria-${props.id}` : "categoria";
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<CategoryFormInput, unknown, CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: props.mode === "edit" ? props.defaults : EMPTY,
  });
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = form;

  async function onSubmit() {
    setFormError(null);
    // Raw values go to the server, which parses them again with the schema.
    const input = getValues();
    let result;
    try {
      result =
        props.mode === "edit"
          ? await updateCategoryAction(props.id, input)
          : await createCategoryAction(input);
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
        name as keyof CategoryFormInput,
        { message },
        { shouldFocus: index === 0 },
      );
    });
    setFormError(
      result.formError ?? (entries.length === 0 ? SAVE_ERROR : null),
    );
  }

  const nameError = errors.name?.message;
  const orderError = errors.sortOrder?.message;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="grid gap-4 md:grid-cols-2"
    >
      <div className="grid content-start gap-2">
        <Label htmlFor={`${prefix}-name`}>Nome da categoria</Label>
        <Input
          id={`${prefix}-name`}
          autoComplete="off"
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? `${prefix}-name-error` : undefined}
          {...register("name")}
        />
        <FieldError id={`${prefix}-name-error`} message={nameError} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={`${prefix}-order`}>Ordem</Label>
        <Input
          id={`${prefix}-order`}
          type="number"
          min={0}
          max={1000000}
          inputMode="numeric"
          aria-invalid={Boolean(orderError)}
          aria-describedby={orderError ? `${prefix}-order-error` : undefined}
          {...register("sortOrder")}
        />
        <FieldError id={`${prefix}-order-error`} message={orderError} />
      </div>
      <label
        htmlFor={`${prefix}-active`}
        className="flex h-11 items-center gap-3 text-sm md:col-span-2"
      >
        <input
          id={`${prefix}-active`}
          type="checkbox"
          className="size-5 accent-primary"
          {...register("isActive")}
        />
        Categoria ativa
      </label>
      <div className="grid gap-3 md:col-span-2">
        <FormError message={formError} />
        <Button type="submit" disabled={isSubmitting} className="w-fit">
          {isSubmitting
            ? "Salvando..."
            : props.mode === "edit"
              ? "Salvar categoria"
              : "Criar categoria"}
        </Button>
      </div>
    </form>
  );
}
