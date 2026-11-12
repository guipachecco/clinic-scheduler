"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

import { recordUsageAction, reverseUsageAction } from "../actions";

const SAVE_ERROR = "Não foi possível salvar. Tente novamente.";

export type UsageProductOption = { id: string; name: string };
export type UsageSaleOption = {
  saleItemId: string;
  saleNumber: number;
  productId: string;
  remaining: number;
};

// "Produtos usados": registers a product used in the appointment. The sale
// picker only exists when the page sends open sale items (finance on); the
// oldest open item of the chosen product comes selected.
export function UsageForm({
  appointmentId,
  products,
  openItems,
}: {
  appointmentId: string;
  products: UsageProductOption[];
  openItems: UsageSaleOption[];
}) {
  const router = useRouter();
  const oldestOf = (productId: string) =>
    openItems.find((item) => item.productId === productId)?.saleItemId ?? "";
  const [chosenProduct, setProductId] = useState(products[0]?.id ?? "");
  // A product deactivated meanwhile leaves the list: fall back to the first.
  const productId = products.some((product) => product.id === chosenProduct)
    ? chosenProduct
    : (products[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  // null: the oldest open item of the product (also after a refresh that
  // closed the chosen one); "": "Sem venda".
  const [saleChoice, setSaleChoice] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const saleOptions = openItems.filter((item) => item.productId === productId);
  const saleItemId =
    saleChoice === "" ||
    (saleChoice !== null &&
      saleOptions.some((item) => item.saleItemId === saleChoice))
      ? saleChoice
      : oldestOf(productId);

  if (products.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum produto ativo. Cadastre em Produtos.
      </p>
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);
    let result;
    try {
      result = await recordUsageAction(appointmentId, {
        productId,
        quantity,
        saleItemId: saleOptions.length > 0 ? saleItemId : "",
      });
    } catch {
      result = null;
    }
    setSaving(false);
    if (!result) {
      setFormError(SAVE_ERROR);
      return;
    }
    if (result.ok) {
      setQuantity("1");
      setSaleChoice(null);
      router.refresh();
      return;
    }
    setErrors(result.fieldErrors);
    setFormError(
      result.formError ??
        (Object.keys(result.fieldErrors).length === 0 ? SAVE_ERROR : null),
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-[1fr_8rem]">
        <div className="grid content-start gap-2">
          <Label htmlFor="usage-product">Produto</Label>
          <NativeSelect
            id="usage-product"
            value={productId}
            aria-invalid={Boolean(errors.productId)}
            onChange={(event) => {
              setProductId(event.target.value);
              setSaleChoice(null);
            }}
          >
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </NativeSelect>
          <FieldError id="usage-product-error" message={errors.productId} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="usage-quantity">Quantidade</Label>
          <Input
            id="usage-quantity"
            inputMode="numeric"
            autoComplete="off"
            value={quantity}
            aria-invalid={Boolean(errors.quantity)}
            aria-describedby={
              errors.quantity ? "usage-quantity-error" : undefined
            }
            onChange={(event) => setQuantity(event.target.value)}
          />
          <FieldError id="usage-quantity-error" message={errors.quantity} />
        </div>
        {saleOptions.length > 0 ? (
          <div className="grid content-start gap-2 md:col-span-2">
            <Label htmlFor="usage-sale">Venda</Label>
            <NativeSelect
              id="usage-sale"
              value={saleItemId}
              aria-invalid={Boolean(errors.saleItemId)}
              onChange={(event) => setSaleChoice(event.target.value)}
            >
              {saleOptions.map((item) => (
                <option key={item.saleItemId} value={item.saleItemId}>
                  Conta na venda nº {item.saleNumber} (faltam {item.remaining})
                </option>
              ))}
              <option value="">Sem venda</option>
            </NativeSelect>
            <FieldError id="usage-sale-error" message={errors.saleItemId} />
          </div>
        ) : null}
      </div>
      <FormError message={formError} />
      <div>
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando..." : "Registrar"}
        </Button>
      </div>
    </form>
  );
}

export function UndoUsageButton({
  appointmentId,
  movementId,
}: {
  appointmentId: string;
  movementId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const result = await reverseUsageAction(appointmentId, movementId);
      if (result.ok) router.refresh();
      else setError(result.formError ?? SAVE_ERROR);
    } catch {
      setError(SAVE_ERROR);
    }
    setPending(false);
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={onClick}
      >
        Desfazer
      </Button>
      <FormError message={error} />
    </span>
  );
}
