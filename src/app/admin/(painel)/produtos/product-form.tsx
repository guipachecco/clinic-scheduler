"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  productFormSchema,
  type ProductFormInput,
  type ProductFormValues,
} from "@/modules/products/fields";

import {
  createProductAction,
  deleteProductAction,
  updateProductAction,
} from "./actions";

const SAVE_ERROR = "Não foi possível salvar. Tente novamente.";

const EMPTY: ProductFormInput = {
  categoryId: "",
  name: "",
  description: "",
  price: "",
  showOnPage: true,
  isActive: true,
};

export type CategoryOption = { id: string; name: string; isActive: boolean };

type Props = { categories: CategoryOption[] } & (
  | { mode: "create" }
  | {
      mode: "edit";
      id: string;
      defaults: ProductFormInput;
      // Cited by a quote or sale: it can only be deactivated.
      inUse: boolean;
    }
);

type ProductFormApi = UseFormReturn<
  ProductFormInput,
  unknown,
  ProductFormValues
>;

function Checkbox({
  form,
  name,
  label,
}: {
  form: ProductFormApi;
  name: "isActive" | "showOnPage";
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

export function ProductForm(props: Props) {
  // With a single category to choose from, it is already chosen.
  const defaults =
    props.mode === "edit"
      ? props.defaults
      : {
          ...EMPTY,
          categoryId:
            props.categories.length === 1 ? props.categories[0]!.id : "",
        };
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const form = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productFormSchema),
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
          ? await updateProductAction(props.id, input)
          : await createProductAction(input);
    } catch {
      setFormError(SAVE_ERROR);
      return;
    }
    // The action returns success instead of redirecting, so navigation is ours.
    if (result.ok) {
      router.push("/admin/produtos");
      return;
    }
    const entries = Object.entries(result.fieldErrors);
    entries.forEach(([name, message], index) => {
      setError(
        name as keyof ProductFormInput,
        { message },
        { shouldFocus: index === 0 },
      );
    });
    setFormError(
      result.formError ?? (entries.length === 0 ? SAVE_ERROR : null),
    );
  }

  async function onDelete() {
    if (props.mode !== "edit") return;
    if (!window.confirm("Excluir este produto?")) return;
    setDeleting(true);
    setFormError(null);
    try {
      const result = await deleteProductAction(props.id);
      if (result.ok) {
        router.push("/admin/produtos");
        return;
      }
      setFormError(result.formError ?? SAVE_ERROR);
    } catch {
      setFormError(SAVE_ERROR);
    }
    setDeleting(false);
  }

  const idle =
    props.mode === "edit" ? "Salvar alterações" : "Cadastrar produto";
  const categoryError = errors.categoryId?.message;
  const nameError = errors.name?.message;
  const descriptionError = errors.description?.message;
  const priceError = errors.price?.message;

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
        <div className="grid content-start gap-2">
          <Label htmlFor="name">Nome</Label>
          <Input
            id="name"
            autoComplete="off"
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? "name-error" : undefined}
            {...register("name")}
          />
          <FieldError id="name-error" message={nameError} />
        </div>
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

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="price">Preço (R$)</Label>
          <Input
            id="price"
            autoComplete="off"
            inputMode="decimal"
            placeholder="0,00"
            aria-invalid={Boolean(priceError)}
            aria-describedby={priceError ? "price-error" : undefined}
            {...register("price")}
          />
          <FieldError id="price-error" message={priceError} />
        </div>
      </div>

      <div className="grid gap-1">
        <Checkbox form={form} name="showOnPage" label="Mostrar na página" />
        <Checkbox form={form} name="isActive" label="Ativo" />
      </div>

      <FormError message={formError} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={isSubmitting || deleting}>
          {isSubmitting ? "Salvando..." : idle}
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/produtos">Voltar aos produtos</Link>
        </Button>
        {props.mode === "edit" && !props.inUse ? (
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting || deleting}
            onClick={onDelete}
          >
            Excluir
          </Button>
        ) : null}
      </div>
    </form>
  );
}
