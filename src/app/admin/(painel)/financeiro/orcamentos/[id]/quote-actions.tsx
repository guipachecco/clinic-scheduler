"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_INSTALLMENTS,
  PAYMENT_PLAN_LABELS,
  type PaymentPlanValue,
} from "@/modules/finance/fields";

import {
  approveQuoteAction,
  duplicateQuoteAction,
  quoteStatusAction,
  type ActionResult,
} from "../../actions";

const ERROR = "Não foi possível concluir. Tente novamente.";

export function QuoteActions({
  quoteId,
  status,
  expired,
  whatsappUrl,
  today,
}: {
  quoteId: string;
  status: "draft" | "sent" | "approved" | "rejected" | "cancelled";
  expired: boolean;
  whatsappUrl: string | null;
  today: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(
    work: () => Promise<ActionResult>,
    after?: (r: ActionResult) => void,
  ) {
    setBusy(true);
    setError(null);
    let result: ActionResult;
    try {
      result = await work();
    } catch {
      result = { ok: false, formError: ERROR };
    }
    setBusy(false);
    if (!result.ok) {
      setError(result.formError ?? ERROR);
      return;
    }
    if (after) after(result);
    else router.refresh();
  }

  const open = status === "draft" || status === "sent";

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        {status === "draft" ? (
          <Button asChild variant="outline">
            <Link
              href={`/admin/financeiro/orcamentos/${quoteId}/editar` as Route}
            >
              Editar
            </Link>
          </Button>
        ) : null}
        {open && whatsappUrl ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() => {
              // Opens WhatsApp with the message ready; marks the quote as sent.
              window.open(whatsappUrl, "_blank", "noopener,noreferrer");
              if (status === "draft")
                void act(() => quoteStatusAction(quoteId, "sent"));
            }}
          >
            Enviar pelo WhatsApp
          </Button>
        ) : null}
        {status === "draft" ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void act(() => quoteStatusAction(quoteId, "sent"))}
          >
            Marcar como enviado
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void act(
              () => duplicateQuoteAction(quoteId),
              (r) =>
                router.push(`/admin/financeiro/orcamentos/${r.id}` as Route),
            )
          }
        >
          Duplicar
        </Button>
        {status === "sent" ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void act(() => quoteStatusAction(quoteId, "rejected"))
            }
          >
            Cliente recusou
          </Button>
        ) : null}
        {open ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Cancelar este orçamento?")) {
                void act(() => quoteStatusAction(quoteId, "cancelled"));
              }
            }}
          >
            Cancelar orçamento
          </Button>
        ) : null}
      </div>
      <FormError message={error} />
      {open ? (
        <ApproveForm quoteId={quoteId} expired={expired} today={today} />
      ) : null}
    </div>
  );
}

function ApproveForm({
  quoteId,
  expired,
  today,
}: {
  quoteId: string;
  expired: boolean;
  today: string;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<PaymentPlanValue>("upfront");
  const [count, setCount] = useState("2");
  const [firstDueDate, setFirstDueDate] = useState(today);
  const [downPayment, setDownPayment] = useState("");
  const [acknowledgeExpired, setAcknowledgeExpired] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);
    let result: ActionResult;
    try {
      result = await approveQuoteAction(quoteId, {
        plan,
        firstDueDate,
        installmentsCount: plan === "installments" ? count : "1",
        amounts:
          plan === "installments" && downPayment.trim() !== ""
            ? [downPayment]
            : [],
        dueDates: [],
        acknowledgeExpired,
      });
    } catch {
      result = { ok: false, formError: ERROR };
    }
    setSaving(false);
    if (result.ok && result.id) {
      router.push(`/admin/financeiro/vendas/${result.id}` as Route);
      return;
    }
    setErrors(result.fieldErrors ?? {});
    setFormError(
      result.formError ??
        result.fieldErrors?.amounts ??
        (result.fieldErrors ? "Confira os campos destacados." : ERROR),
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-labelledby="aprovar"
      className="grid gap-4 rounded-2xl border bg-card p-4"
    >
      <h2 id="aprovar" className="font-heading text-lg font-semibold">
        Cliente aprovou
      </h2>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Como vai pagar</legend>
        <div className="flex flex-wrap gap-4">
          {(Object.keys(PAYMENT_PLAN_LABELS) as PaymentPlanValue[]).map(
            (value) => (
              <label
                key={value}
                className="flex h-11 items-center gap-2 text-sm"
              >
                <input
                  type="radio"
                  name="plano"
                  value={value}
                  checked={plan === value}
                  onChange={() => setPlan(value)}
                  className="size-5 accent-primary"
                />
                {PAYMENT_PLAN_LABELS[value]}
              </label>
            ),
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {plan === "upfront"
            ? "Uma parcela com o total."
            : plan === "installments"
              ? "Parcelas mensais combinadas com a cliente. Para um sinal, informe o valor da 1ª parcela."
              : "Uma parcela por sessão, que vence no dia do atendimento."}
        </p>
      </fieldset>

      {plan !== "per_session" ? (
        <div className="grid gap-4 md:grid-cols-3">
          {plan === "installments" ? (
            <div className="grid content-start gap-2">
              <Label htmlFor="aprovar-parcelas">Parcelas</Label>
              <Input
                id="aprovar-parcelas"
                inputMode="numeric"
                value={count}
                max={MAX_INSTALLMENTS}
                aria-invalid={Boolean(errors.installmentsCount)}
                onChange={(event) => setCount(event.target.value)}
              />
              <FieldError
                id="aprovar-parcelas-erro"
                message={errors.installmentsCount}
              />
            </div>
          ) : null}
          <div className="grid content-start gap-2">
            <Label htmlFor="aprovar-vencimento">
              {plan === "upfront" ? "Vencimento" : "1º vencimento"}
            </Label>
            <Input
              id="aprovar-vencimento"
              type="date"
              value={firstDueDate}
              aria-invalid={Boolean(errors.firstDueDate)}
              onChange={(event) => setFirstDueDate(event.target.value)}
            />
            <FieldError
              id="aprovar-vencimento-erro"
              message={errors.firstDueDate}
            />
          </div>
          {plan === "installments" ? (
            <div className="grid content-start gap-2">
              <Label htmlFor="aprovar-entrada">
                Valor da 1ª parcela (opcional)
              </Label>
              <Input
                id="aprovar-entrada"
                inputMode="decimal"
                placeholder="dividir igual"
                value={downPayment}
                aria-invalid={Boolean(errors["amounts.0"])}
                onChange={(event) => setDownPayment(event.target.value)}
              />
              <FieldError
                id="aprovar-entrada-erro"
                message={errors["amounts.0"]}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {expired ? (
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={acknowledgeExpired}
            onChange={(event) => setAcknowledgeExpired(event.target.checked)}
            className="size-5 accent-primary"
          />
          O orçamento venceu. Aprovar mesmo assim.
        </label>
      ) : null}
      <FormError message={formError} />
      <Button type="submit" disabled={saving} className="w-fit">
        {saving ? "Aprovando..." : "Aprovar e criar a venda"}
      </Button>
    </form>
  );
}
