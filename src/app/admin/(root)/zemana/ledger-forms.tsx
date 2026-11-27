"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

import {
  addLedgerEntryAction,
  deleteLedgerEntryAction,
  setLedgerPaidAction,
  type LedgerActionResult,
} from "./actions";

const ERROR = "Não foi possível salvar. Tente novamente.";

export function LedgerForm({
  clinics,
  today,
}: {
  clinics: { id: string; name: string }[];
  today: string;
}) {
  const router = useRouter();
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueOn, setDueOn] = useState(today);
  const [paid, setPaid] = useState(false);
  const [clinicId, setClinicId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    let result: LedgerActionResult;
    try {
      result = await addLedgerEntryAction({
        direction,
        description,
        amount,
        dueOn,
        paid,
        clinicId,
      });
    } catch {
      result = { ok: false, formError: ERROR };
    }
    setSaving(false);
    if (result.ok) {
      setDescription("");
      setAmount("");
      setPaid(false);
      setErrors({});
      setFormError(null);
      router.refresh();
      return;
    }
    setErrors(result.fieldErrors ?? {});
    setFormError(result.formError ?? "Confira os campos destacados.");
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div
        role="radiogroup"
        aria-label="Tipo de lançamento"
        className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
      >
        {(
          [
            ["out", "Conta a pagar"],
            ["in", "Entrada"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={direction === value}
            onClick={() => setDirection(value)}
            className={cn(
              "h-10 rounded-lg text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
              direction === value
                ? "bg-card shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-1 md:col-span-2">
          <Label htmlFor="lanc-desc">
            {direction === "in" ? "De onde veio" : "O que é"}
          </Label>
          <Input
            id="lanc-desc"
            value={description}
            placeholder={
              direction === "in"
                ? "Mensalidade de novembro"
                : "Neon, Z-API, contador…"
            }
            aria-invalid={Boolean(errors.description)}
            onChange={(event) => setDescription(event.target.value)}
          />
          <FieldError id="lanc-desc-erro" message={errors.description} />
        </div>
        <div className="grid content-start gap-1">
          <Label htmlFor="lanc-valor">Valor (R$)</Label>
          <Input
            id="lanc-valor"
            inputMode="decimal"
            value={amount}
            placeholder="0,00"
            aria-invalid={Boolean(errors.amount)}
            onChange={(event) => setAmount(event.target.value)}
          />
          <FieldError id="lanc-valor-erro" message={errors.amount} />
        </div>
        <div className="grid content-start gap-1">
          <Label htmlFor="lanc-data">Vencimento</Label>
          <Input
            id="lanc-data"
            type="date"
            value={dueOn}
            aria-invalid={Boolean(errors.dueOn)}
            onChange={(event) => setDueOn(event.target.value)}
          />
          <FieldError id="lanc-data-erro" message={errors.dueOn} />
        </div>
        <div className="grid content-start gap-1 md:col-span-2">
          <Label htmlFor="lanc-clinica">Clínica (opcional)</Label>
          <NativeSelect
            id="lanc-clinica"
            value={clinicId}
            onChange={(event) => setClinicId(event.target.value)}
          >
            <option value="">Nenhuma</option>
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={paid}
          onChange={(event) => setPaid(event.target.checked)}
          className="size-4 accent-primary"
        />
        {direction === "in" ? "Já recebi" : "Já paguei"}
      </label>
      <FormError message={formError} />
      <Button type="submit" disabled={saving}>
        {saving ? "Salvando…" : "Lançar"}
      </Button>
    </form>
  );
}

export function LedgerRowActions({
  id,
  paid,
  direction,
  today,
}: {
  id: string;
  paid: boolean;
  direction: "in" | "out";
  today: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<LedgerActionResult>) {
    setBusy(true);
    const result = await action().catch(() => ({ ok: false }));
    setBusy(false);
    if (result.ok) router.refresh();
    else window.alert(ERROR);
  }

  return (
    <div className="flex flex-wrap justify-end gap-1 print:hidden">
      <Button
        type="button"
        size="sm"
        variant={paid ? "ghost" : "outline"}
        disabled={busy}
        onClick={() =>
          run(() => setLedgerPaidAction({ id, paidOn: paid ? null : today }))
        }
      >
        {paid ? "Desfazer" : direction === "in" ? "Recebi" : "Paguei"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={busy}
        className="text-destructive"
        onClick={() => {
          if (window.confirm("Excluir este lançamento?"))
            void run(() => deleteLedgerEntryAction(id));
        }}
      >
        Excluir
      </Button>
    </div>
  );
}
