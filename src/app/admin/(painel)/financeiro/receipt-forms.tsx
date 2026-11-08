"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatCents } from "@/modules/services/fields";

import {
  createReceiptAction,
  reverseReceiptAction,
  type ActionResult,
} from "./actions";

const ERROR = "Não foi possível salvar. Tente novamente.";
const toText = (cents: number) => formatCents(cents).replace("R$ ", "");

async function call(work: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await work();
  } catch {
    return { ok: false, formError: ERROR };
  }
}

const summaryError = (result: ActionResult) =>
  result.formError ??
  (Object.keys(result.fieldErrors ?? {}).length > 0
    ? "Confira os campos destacados."
    : ERROR);

export type MethodOption = { id: string; name: string };

// Records money received outside a sale. With an appointment ("Receber" on
// its page) the description and the client come from it; without one ("Nova
// entrada") she says what was paid. Opens as a button unless `startOpen`.
export function ReceiptForm({
  appointmentId,
  defaultAmountCents,
  methods,
  today,
  label = "Receber",
  startOpen = false,
  afterSaveHref,
}: {
  appointmentId?: string;
  defaultAmountCents?: number | null;
  methods: MethodOption[];
  today: string;
  label?: string;
  startOpen?: boolean;
  // Where to go once saved (the cash book, for "Nova entrada").
  afterSaveHref?: Route;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(
    defaultAmountCents ? toText(defaultAmountCents) : "",
  );
  const [receivedOn, setReceivedOn] = useState(today);
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const prefix = appointmentId ? `receber-${appointmentId}` : "nova-entrada";

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)} className="w-fit">
        {label}
      </Button>
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await call(() =>
      createReceiptAction({
        appointmentId: appointmentId ?? "",
        description,
        amount,
        receivedOn,
        paymentMethodId: methodId,
        notes,
      }),
    );
    setSaving(false);
    if (result.ok) {
      if (afterSaveHref) {
        router.push(afterSaveHref);
        return;
      }
      setOpen(startOpen);
      router.refresh();
      return;
    }
    setErrors(result.fieldErrors ?? {});
    setFormError(summaryError(result));
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid w-full gap-3 rounded-xl border bg-muted/30 p-3 sm:grid-cols-2"
    >
      {appointmentId ? null : (
        <div className="grid content-start gap-1 sm:col-span-2">
          <Label htmlFor={`${prefix}-descricao`}>O que foi pago</Label>
          <Input
            id={`${prefix}-descricao`}
            value={description}
            maxLength={80}
            placeholder="Esmalte, manicure avulsa..."
            aria-invalid={Boolean(errors.description)}
            onChange={(event) => setDescription(event.target.value)}
          />
          <FieldError
            id={`${prefix}-descricao-erro`}
            message={errors.description}
          />
        </div>
      )}
      <div className="grid content-start gap-1">
        <Label htmlFor={`${prefix}-valor`}>Valor</Label>
        <Input
          id={`${prefix}-valor`}
          inputMode="decimal"
          value={amount}
          placeholder="35,00"
          aria-invalid={Boolean(errors.amount)}
          onChange={(event) => setAmount(event.target.value)}
        />
        <FieldError id={`${prefix}-valor-erro`} message={errors.amount} />
      </div>
      <div className="grid content-start gap-1">
        <Label htmlFor={`${prefix}-forma`}>Forma de pagamento</Label>
        <NativeSelect
          id={`${prefix}-forma`}
          value={methodId}
          aria-invalid={Boolean(errors.paymentMethodId)}
          onChange={(event) => setMethodId(event.target.value)}
        >
          {methods.map((method) => (
            <option key={method.id} value={method.id}>
              {method.name}
            </option>
          ))}
        </NativeSelect>
        <FieldError
          id={`${prefix}-forma-erro`}
          message={errors.paymentMethodId}
        />
      </div>
      <div className="grid content-start gap-1">
        <Label htmlFor={`${prefix}-data`}>Data</Label>
        <Input
          id={`${prefix}-data`}
          type="date"
          value={receivedOn}
          aria-invalid={Boolean(errors.receivedOn)}
          onChange={(event) => setReceivedOn(event.target.value)}
        />
        <FieldError id={`${prefix}-data-erro`} message={errors.receivedOn} />
      </div>
      <div className="grid content-start gap-1">
        <Label htmlFor={`${prefix}-obs`}>Observação (opcional)</Label>
        <Input
          id={`${prefix}-obs`}
          value={notes}
          maxLength={200}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando..." : "Confirmar recebimento"}
        </Button>
        {startOpen ? null : (
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Fechar
          </Button>
        )}
        <FormError message={formError} />
      </div>
    </form>
  );
}

// Asks for a reason, then reverses the receipt.
export function ReverseReceiptButton({ receiptId }: { receiptId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={async () => {
          const reason = window.prompt("Motivo do estorno:");
          if (!reason) return;
          const result = await call(() =>
            reverseReceiptAction(receiptId, reason),
          );
          if (result.ok) router.refresh();
          else setError(summaryError(result));
        }}
      >
        Estornar
      </Button>
      <FormError message={error} />
    </span>
  );
}
