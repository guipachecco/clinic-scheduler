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
  productCategoryFormSchema,
  type ProductCategoryFormInput,
  type ProductCategoryFormValues,
} from "@/modules/products/fields";

import {
  addExampleProductsAction,
  createProductCategoryAction,
  updateProductCategoryAction,
} from "./actions";

const SAVE_ERROR = "Não foi possível salvar. Tente novamente.";

const EMPTY: ProductCategoryFormInput = { name: "" };

type Props =
  | { mode: "create" }
  | { mode: "edit"; id: string; defaults: ProductCategoryFormInput };

// A small inline form to add a category or to rename one.
export function ProductCategoryForm(props: Props) {
  const router = useRouter();
  const prefix = props.mode === "edit" ? `categoria-${props.id}` : "categoria";
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<
    ProductCategoryFormInput,
    unknown,
    ProductCategoryFormValues
  >({
    resolver: zodResolver(productCategoryFormSchema),
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
    const input = getValues();
    let result;
    try {
      result =
        props.mode === "edit"
          ? await updateProductCategoryAction(props.id, input)
          : await createProductCategoryAction(input);
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
        name as keyof ProductCategoryFormInput,
        { message },
        { shouldFocus: index === 0 },
      );
    });
    setFormError(
      result.formError ?? (entries.length === 0 ? SAVE_ERROR : null),
    );
  }

  const nameError = errors.name?.message;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4">
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
      <FormError message={formError} />
      <Button type="submit" disabled={isSubmitting} className="w-fit">
        {isSubmitting
          ? "Salvando..."
          : props.mode === "edit"
            ? "Salvar categoria"
            : "Criar categoria"}
      </Button>
    </form>
  );
}

// Offered when the clinic has no product yet.
export function ExampleProductsButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const result = await addExampleProductsAction();
      if (result.ok) router.refresh();
      else setError(result.formError ?? SAVE_ERROR);
    } catch {
      setError(SAVE_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid justify-items-start gap-2">
      <Button type="button" disabled={pending} onClick={onClick}>
        Começar com exemplos
      </Button>
      <FormError message={error} />
    </div>
  );
}
