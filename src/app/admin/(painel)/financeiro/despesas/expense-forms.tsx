"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

import {
  cancelExpenseAction,
  createExpenseAction,
  type ActionResult,
} from "../actions";

const ERROR = "Não foi possível salvar. Tente novamente.";

type Option = { id: string; name: string };

export function ExpenseForm({
  categories,
  methods,
  today,
}: {
  categories: Option[];
  methods: Option[];
  today: string;
}) {
  const router = useRouter();
  const [spentOn, setSpentOn] = useState(today);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    let result: ActionResult;
    try {
      result = await createExpenseAction({
        spentOn,
        amount,
        categoryId,
        paymentMethodId: methodId,
        description,
      });
    } catch {
      result = { ok: false, formError: ERROR };
    }
    setSaving(false);
    if (result.ok) {
      setAmount("");
      setDescription("");
      setErrors({});
      setFormError(null);
      router.refresh();
      return;
    }
    setErrors(result.fieldErrors ?? {});
    setFormError(result.formError ?? "Confira os campos destacados.");
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-2">
      <div className="grid content-start gap-1">
        <Label htmlFor="despesa-data">Data</Label>
        <Input
          id="despesa-data"
          type="date"
          value={spentOn}
          aria-invalid={Boolean(errors.spentOn)}
          onChange={(event) => setSpentOn(event.target.value)}
        />
        <FieldError id="despesa-data-erro" message={errors.spentOn} />
      </div>
      <div className="grid content-start gap-1">
        <Label htmlFor="despesa-valor">Valor</Label>
        <Input
          id="despesa-valor"
          inputMode="decimal"
          value={amount}
          aria-invalid={Boolean(errors.amount)}
          onChange={(event) => setAmount(event.target.value)}
        />
        <FieldError id="despesa-valor-erro" message={errors.amount} />
      </div>
      <div className="grid content-start gap-1">
        <Label htmlFor="despesa-categoria">Categoria</Label>
        <NativeSelect
          id="despesa-categoria"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        <FieldError id="despesa-categoria-erro" message={errors.categoryId} />
      </div>
      <div className="grid content-start gap-1">
        <Label htmlFor="despesa-forma">Forma de pagamento</Label>
        <NativeSelect
          id="despesa-forma"
          value={methodId}
          onChange={(event) => setMethodId(event.target.value)}
        >
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </NativeSelect>
        <FieldError id="despesa-forma-erro" message={errors.paymentMethodId} />
      </div>
      <div className="grid content-start gap-1 md:col-span-2">
        <Label htmlFor="despesa-descricao">Descrição (opcional)</Label>
        <Input
          id="despesa-descricao"
          value={description}
          maxLength={200}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="grid gap-2 md:col-span-2">
        <FormError message={formError} />
        <Button type="submit" disabled={saving} className="w-fit">
          {saving ? "Salvando..." : "Lançar despesa"}
        </Button>
      </div>
    </form>
  );
}

export function CancelExpenseButton({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={async () => {
          const reason = window.prompt("Motivo do cancelamento:");
          if (!reason) return;
          let result: ActionResult;
          try {
            result = await cancelExpenseAction(id, reason);
          } catch {
            result = { ok: false, formError: ERROR };
          }
          if (result.ok) router.refresh();
          else setError(result.formError ?? ERROR);
        }}
      >
        Cancelar
      </Button>
      <FormError message={error} />
    </span>
  );
}
