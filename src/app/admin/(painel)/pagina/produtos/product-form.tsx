"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  addExampleProductsAction,
  createProductAction,
  deleteProductAction,
  updateProductAction,
} from "../actions";

const SAVE_ERROR = "Não foi possível salvar. Tente novamente.";

type Values = {
  name: string;
  price: string;
  description: string;
  isActive: boolean;
};

type Props =
  { mode: "create" } | { mode: "edit"; id: string; defaults: Values };

const EMPTY: Values = { name: "", price: "", description: "", isActive: true };

export function ProductForm(props: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(
    props.mode === "edit" ? props.defaults : EMPTY,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const prefix = props.mode === "edit" ? `produto-${props.id}` : "produto-novo";

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setErrors({});
    setSaved(false);
    try {
      const result =
        props.mode === "edit"
          ? await updateProductAction(props.id, values)
          : await createProductAction(values);
      if (result.ok) {
        if (props.mode === "create") setValues(EMPTY);
        setSaved(true);
        router.refresh();
      } else {
        setErrors(result.fieldErrors);
        const hasFieldErrors = Object.keys(result.fieldErrors).length > 0;
        setFormError(result.formError ?? (hasFieldErrors ? null : SAVE_ERROR));
      }
    } catch {
      setFormError(SAVE_ERROR);
    } finally {
      setPending(false);
    }
  }

  async function onDelete() {
    if (props.mode !== "edit") return;
    if (!window.confirm("Excluir este produto?")) return;
    setPending(true);
    setFormError(null);
    try {
      const result = await deleteProductAction(props.id);
      if (result.ok) router.refresh();
      else setFormError(result.formError ?? SAVE_ERROR);
    } catch {
      setFormError(SAVE_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-nome`}>Nome</Label>
        <Input
          id={`${prefix}-nome`}
          value={values.name}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? `${prefix}-nome-erro` : undefined}
          onChange={(event) => set("name", event.target.value)}
        />
        <FieldError id={`${prefix}-nome-erro`} message={errors.name} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-preco`}>Preço</Label>
        <Input
          id={`${prefix}-preco`}
          inputMode="decimal"
          placeholder="0,00"
          value={values.price}
          aria-invalid={Boolean(errors.price)}
          aria-describedby={errors.price ? `${prefix}-preco-erro` : undefined}
          onChange={(event) => set("price", event.target.value)}
        />
        <FieldError id={`${prefix}-preco-erro`} message={errors.price} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${prefix}-descricao`}>Descrição</Label>
        <Textarea
          id={`${prefix}-descricao`}
          value={values.description}
          aria-invalid={Boolean(errors.description)}
          aria-describedby={
            errors.description ? `${prefix}-descricao-erro` : undefined
          }
          onChange={(event) => set("description", event.target.value)}
        />
        <FieldError
          id={`${prefix}-descricao-erro`}
          message={errors.description}
        />
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={values.isActive}
          onChange={(event) => set("isActive", event.target.checked)}
        />
        Aparece na página
      </label>
      <FormError message={formError} />
      <p role="status" className="text-sm font-medium text-primary">
        {saved ? "Produto salvo." : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {props.mode === "edit" ? "Salvar produto" : "Adicionar produto"}
        </Button>
        {props.mode === "edit" ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onDelete}
          >
            Excluir
          </Button>
        ) : null}
      </div>
    </form>
  );
}

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
