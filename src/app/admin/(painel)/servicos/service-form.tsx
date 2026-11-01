"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  PRICE_DISPLAYS,
  serviceFormSchema,
  type ServiceFormInput,
  type ServiceFormValues,
} from "@/modules/services/fields";

import { createServiceAction, updateServiceAction } from "./actions";

const SAVE_ERROR = "Não foi possível salvar. Tente novamente.";

const EMPTY: ServiceFormInput = {
  categoryId: "",
  name: "",
  description: "",
  durationMinutes: "",
  bufferBeforeMinutes: "0",
  bufferAfterMinutes: "0",
  price: "",
  priceDisplay: "fixed",
  preparationInstructions: "",
  sortOrder: "0",
  isActive: true,
  requiresApproval: false,
  onlineBookingEnabled: true,
};

export type CategoryOption = { id: string; name: string; isActive: boolean };

type Props = { categories: CategoryOption[] } & (
  { mode: "create" } | { mode: "edit"; id: string; defaults: ServiceFormInput }
);

type ServiceFormApi = UseFormReturn<
  ServiceFormInput,
  unknown,
  ServiceFormValues
>;

type TextField = {
  name: keyof ServiceFormInput;
  label: string;
  type?: string;
  inputMode?: "decimal" | "numeric";
  placeholder?: string;
  min?: number;
  max?: number;
};

function TextInput({
  field,
  form,
}: {
  field: TextField;
  form: ServiceFormApi;
}) {
  const error = form.formState.errors[field.name]?.message;
  const errorId = `${field.name}-error`;
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={field.name}>{field.label}</Label>
      <Input
        id={field.name}
        type={field.type ?? "text"}
        autoComplete="off"
        inputMode={field.inputMode}
        placeholder={field.placeholder}
        min={field.min}
        max={field.max}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        {...form.register(field.name)}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function Checkbox({
  form,
  name,
  label,
}: {
  form: ServiceFormApi;
  name: "isActive" | "requiresApproval" | "onlineBookingEnabled";
  label: string;
}) {
  return (
    <label
      htmlFor={name}
      className="flex h-11 items-center gap-3 text-sm font-medium"
    >
      <input
        id={name}
        type="checkbox"
        className="size-5 accent-primary"
        {...form.register(name)}
      />
      {label}
    </label>
  );
}

export function ServiceForm(props: Props) {
  const defaults = props.mode === "edit" ? props.defaults : EMPTY;
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ServiceFormInput, unknown, ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: defaults,
  });
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = form;

  async function onSubmit() {
    setFormError(null);
    // Raw text goes to the server, which parses it again with the same schema.
    const input = getValues();
    let result;
    try {
      result =
        props.mode === "edit"
          ? await updateServiceAction(props.id, input)
          : await createServiceAction(input);
    } catch {
      setFormError(SAVE_ERROR);
      return;
    }
    // On success the action redirects, so a returned value is always a failure.
    if (!result) return;
    const entries = Object.entries(result.fieldErrors);
    entries.forEach(([name, message], index) => {
      setError(
        name as keyof ServiceFormInput,
        { message },
        { shouldFocus: index === 0 },
      );
    });
    setFormError(
      result.formError ?? (entries.length === 0 ? SAVE_ERROR : null),
    );
  }

  const idle =
    props.mode === "edit" ? "Salvar alterações" : "Cadastrar serviço";
  const categoryError = errors.categoryId?.message;
  const descriptionError = errors.description?.message;
  const displayError = errors.priceDisplay?.message;
  const preparationError = errors.preparationInstructions?.message;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="categoryId">Categoria</Label>
          <NativeSelect
            id="categoryId"
            aria-invalid={Boolean(categoryError)}
            aria-describedby={categoryError ? "categoryId-error" : undefined}
            {...register("categoryId")}
          >
            <option value="">Escolha a categoria</option>
            {props.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.isActive
                  ? category.name
                  : `${category.name} (inativa)`}
              </option>
            ))}
          </NativeSelect>
          <FieldError id="categoryId-error" message={categoryError} />
        </div>
        <TextInput form={form} field={{ name: "name", label: "Nome" }} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Descrição</Label>
        <Textarea
          id="description"
          aria-invalid={Boolean(descriptionError)}
          aria-describedby={descriptionError ? "description-error" : undefined}
          {...register("description")}
        />
        <FieldError id="description-error" message={descriptionError} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <TextInput
          form={form}
          field={{
            name: "durationMinutes",
            label: "Duração (min)",
            type: "number",
            inputMode: "numeric",
            min: 5,
            max: 720,
          }}
        />
        <TextInput
          form={form}
          field={{
            name: "bufferBeforeMinutes",
            label: "Preparo antes (min)",
            type: "number",
            inputMode: "numeric",
            min: 0,
            max: 240,
          }}
        />
        <TextInput
          form={form}
          field={{
            name: "bufferAfterMinutes",
            label: "Intervalo depois (min)",
            type: "number",
            inputMode: "numeric",
            min: 0,
            max: 240,
          }}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TextInput
          form={form}
          field={{
            name: "price",
            label: "Preço (R$)",
            inputMode: "decimal",
            placeholder: "0,00",
          }}
        />
        <div className="grid content-start gap-2">
          <Label htmlFor="priceDisplay">Forma de exibir o preço</Label>
          <NativeSelect
            id="priceDisplay"
            aria-invalid={Boolean(displayError)}
            aria-describedby={displayError ? "priceDisplay-error" : undefined}
            {...register("priceDisplay")}
          >
            {PRICE_DISPLAYS.map((display) => (
              <option key={display.value} value={display.value}>
                {display.label}
              </option>
            ))}
          </NativeSelect>
          <FieldError id="priceDisplay-error" message={displayError} />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="preparationInstructions">Orientações de preparo</Label>
        <Textarea
          id="preparationInstructions"
          aria-invalid={Boolean(preparationError)}
          aria-describedby={
            preparationError ? "preparationInstructions-error" : undefined
          }
          {...register("preparationInstructions")}
        />
        <FieldError
          id="preparationInstructions-error"
          message={preparationError}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TextInput
          form={form}
          field={{
            name: "sortOrder",
            label: "Ordem",
            type: "number",
            inputMode: "numeric",
            min: 0,
            max: 1000000,
          }}
        />
      </div>

      <div className="grid gap-1">
        <Checkbox form={form} name="isActive" label="Ativo" />
        <Checkbox
          form={form}
          name="requiresApproval"
          label="Exige confirmação"
        />
        <Checkbox
          form={form}
          name="onlineBookingEnabled"
          label="Aceita agendamento online"
        />
      </div>

      <FormError message={formError} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : idle}
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/servicos">Voltar ao catálogo</Link>
        </Button>
      </div>
    </form>
  );
}
