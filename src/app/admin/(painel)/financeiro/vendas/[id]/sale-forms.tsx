"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { recurringDates } from "@/modules/finance/recurrence";
import { formatCents } from "@/modules/services/fields";

import {
  cancelSaleAction,
  receivePaymentAction,
  reversePaymentAction,
  reviseSaleAction,
  scheduleSessionsAction,
  type ActionResult,
} from "../../actions";

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

// "Receber": records a payment for one installment.
export function PaymentForm({
  installmentId,
  outstandingCents,
  methods,
  today,
  label = "Receber",
}: {
  installmentId: string;
  outstandingCents: number;
  methods: MethodOption[];
  today: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(toText(outstandingCents));
  const [paidOn, setPaidOn] = useState(today);
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const prefix = `receber-${installmentId}`;

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await call(() =>
      receivePaymentAction({
        installmentId,
        amount,
        paidOn,
        paymentMethodId: methodId,
        notes,
      }),
    );
    setSaving(false);
    if (result.ok) {
      setOpen(false);
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
      <div className="grid content-start gap-1">
        <Label htmlFor={`${prefix}-valor`}>Valor</Label>
        <Input
          id={`${prefix}-valor`}
          inputMode="decimal"
          value={amount}
          aria-invalid={Boolean(errors.amount)}
          onChange={(event) => setAmount(event.target.value)}
        />
        <FieldError id={`${prefix}-valor-erro`} message={errors.amount} />
      </div>
      <div className="grid content-start gap-1">
        <Label htmlFor={`${prefix}-data`}>Data</Label>
        <Input
          id={`${prefix}-data`}
          type="date"
          value={paidOn}
          aria-invalid={Boolean(errors.paidOn)}
          onChange={(event) => setPaidOn(event.target.value)}
        />
        <FieldError id={`${prefix}-data-erro`} message={errors.paidOn} />
      </div>
      <div className="grid content-start gap-1">
        <Label htmlFor={`${prefix}-forma`}>Forma de pagamento</Label>
        <NativeSelect
          id={`${prefix}-forma`}
          value={methodId}
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
        <Label htmlFor={`${prefix}-obs`}>Observação (opcional)</Label>
        <Input
          id={`${prefix}-obs`}
          value={notes}
          maxLength={200}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Salvando..." : "Confirmar recebimento"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setOpen(false)}
        >
          Fechar
        </Button>
        <FormError message={formError} />
      </div>
    </form>
  );
}

// Asks for a reason, then reverses the payment.
export function ReverseButton({ paymentId }: { paymentId: string }) {
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
            reversePaymentAction(paymentId, reason),
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

export type ScheduleItem = {
  id: string;
  serviceName: string;
  remaining: number;
  durationMinutes: number;
};

type Slot = { key: number; date: string; startTime: string };
let slotKey = 1;

// Schedules the remaining sessions of an item at once.
export function ScheduleForm({
  items,
  today,
}: {
  items: ScheduleItem[];
  today: string;
}) {
  const router = useRouter();
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const item = items.find((i) => i.id === itemId);
  const [repeat, setRepeat] = useState<"1" | "2" | "monthly" | "manual">("1");
  const [firstDate, setFirstDate] = useState(today);
  const [time, setTime] = useState("09:00");
  const [count, setCount] = useState(String(items[0]?.remaining ?? 1));
  const [duration, setDuration] = useState(
    String(items[0]?.durationMinutes ?? 60),
  );
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [problems, setProblems] = useState<ActionResult["problems"]>([]);
  const [acknowledge, setAcknowledge] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function propose() {
    const n = Math.max(1, Math.min(Number(count) || 1, item?.remaining ?? 1));
    let dates: string[];
    try {
      dates =
        repeat === "manual"
          ? Array.from({ length: n }, () => firstDate)
          : recurringDates(
              firstDate,
              repeat === "monthly"
                ? { kind: "monthly" }
                : { kind: "weekly", everyWeeks: Number(repeat) },
              n,
            );
    } catch {
      setFormError("Informe uma data válida.");
      return;
    }
    setFormError(null);
    setProblems([]);
    setAcknowledge(false);
    setSlots(dates.map((date) => ({ key: slotKey++, date, startTime: time })));
  }

  async function save() {
    if (!slots) return;
    setSaving(true);
    setFormError(null);
    const result = await call(() =>
      scheduleSessionsAction({
        saleItemId: itemId,
        durationMinutes: duration,
        slots: slots.map(({ date, startTime }) => ({ date, startTime })),
        acknowledgeWarnings: acknowledge,
      }),
    );
    setSaving(false);
    if (result.ok) {
      setSlots(null);
      router.refresh();
      return;
    }
    setProblems(result.problems ?? []);
    setFormError(
      result.problems?.length
        ? result.problems.some((p) => p.kind === "conflict")
          ? "Alguns horários conflitam. Ajuste as datas destacadas; nada foi salvo."
          : "Algumas datas pedem confirmação. Confira e marque a confirmação abaixo."
        : summaryError(result),
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground">
        Todas as sessões já estão agendadas.
      </p>
    );
  }
  const hasWarnings = problems?.some((p) => p.kind === "warning");

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="grid content-start gap-1">
          <Label htmlFor="agendar-item">Serviço</Label>
          <NativeSelect
            id="agendar-item"
            value={itemId}
            onChange={(event) => {
              const next = items.find((i) => i.id === event.target.value);
              setItemId(event.target.value);
              setCount(String(next?.remaining ?? 1));
              setDuration(String(next?.durationMinutes ?? 60));
              setSlots(null);
            }}
          >
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.serviceName} ({i.remaining} a agendar)
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid content-start gap-1">
          <Label htmlFor="agendar-repetir">Repetir</Label>
          <NativeSelect
            id="agendar-repetir"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value as typeof repeat)}
          >
            <option value="1">Toda semana</option>
            <option value="2">A cada 2 semanas</option>
            <option value="monthly">Todo mês</option>
            <option value="manual">Escolher cada data</option>
          </NativeSelect>
        </div>
        <div className="grid content-start gap-1">
          <Label htmlFor="agendar-quantas">Quantas sessões</Label>
          <Input
            id="agendar-quantas"
            inputMode="numeric"
            value={count}
            onChange={(event) => setCount(event.target.value)}
          />
        </div>
        <div className="grid content-start gap-1">
          <Label htmlFor="agendar-data">Primeira data</Label>
          <Input
            id="agendar-data"
            type="date"
            value={firstDate}
            onChange={(event) => setFirstDate(event.target.value)}
          />
        </div>
        <div className="grid content-start gap-1">
          <Label htmlFor="agendar-hora">Horário</Label>
          <Input
            id="agendar-hora"
            type="time"
            step={300}
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </div>
        <div className="grid content-start gap-1">
          <Label htmlFor="agendar-duracao">Duração (min)</Label>
          <Input
            id="agendar-duracao"
            inputMode="numeric"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
          />
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        onClick={propose}
      >
        Ver as datas
      </Button>

      {slots ? (
        <div className="grid gap-3">
          <ol className="grid gap-2">
            {slots.map((slot, index) => {
              const mine = problems?.filter((p) => p.index === index) ?? [];
              return (
                <li
                  key={slot.key}
                  className="grid gap-1 rounded-2xl border bg-card px-4 py-3"
                >
                  <div className="flex flex-wrap items-end gap-3">
                    <span className="w-20 text-sm font-medium">
                      Sessão {index + 1}
                    </span>
                    <div className="grid gap-1">
                      <Label
                        htmlFor={`sessao-${slot.key}-data`}
                        className="sr-only"
                      >
                        Data da sessão {index + 1}
                      </Label>
                      <Input
                        id={`sessao-${slot.key}-data`}
                        type="date"
                        value={slot.date}
                        aria-invalid={mine.some((p) => p.kind === "conflict")}
                        onChange={(event) =>
                          setSlots((current) =>
                            current!.map((s) =>
                              s.key === slot.key
                                ? { ...s, date: event.target.value }
                                : s,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label
                        htmlFor={`sessao-${slot.key}-hora`}
                        className="sr-only"
                      >
                        Horário da sessão {index + 1}
                      </Label>
                      <Input
                        id={`sessao-${slot.key}-hora`}
                        type="time"
                        step={300}
                        value={slot.startTime}
                        onChange={(event) =>
                          setSlots((current) =>
                            current!.map((s) =>
                              s.key === slot.key
                                ? { ...s, startTime: event.target.value }
                                : s,
                            ),
                          )
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setSlots((current) =>
                          current!.filter((s) => s.key !== slot.key),
                        )
                      }
                    >
                      Tirar
                    </Button>
                  </div>
                  {mine.map((p) => (
                    <p
                      key={p.message}
                      className={
                        p.kind === "conflict"
                          ? "text-sm text-destructive"
                          : "text-sm"
                      }
                    >
                      {p.message}
                    </p>
                  ))}
                </li>
              );
            })}
          </ol>
          {hasWarnings ? (
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={acknowledge}
                onChange={(event) => setAcknowledge(event.target.checked)}
                className="size-5 accent-primary"
              />
              Agendar mesmo assim nas datas com aviso
            </label>
          ) : null}
          <FormError message={formError} />
          <Button
            type="button"
            className="w-fit"
            disabled={saving || slots.length === 0}
            onClick={() => void save()}
          >
            {saving ? "Agendando..." : `Agendar ${slots.length} sessões`}
          </Button>
        </div>
      ) : (
        <FormError message={formError} />
      )}
    </div>
  );
}

export type ReviseItem = {
  id: string;
  serviceName: string;
  sessionPriceCents: number;
};
export type ReviseService = {
  id: string;
  name: string;
  priceCents: number | null;
};

// Changes an approved sale: more sessions, a new service, fewer sessions, or
// a new plan for what is still owed.
export function ReviseForm({
  saleId,
  items,
  services,
  perSession,
  openInstallments,
}: {
  saleId: string;
  items: ReviseItem[];
  services: ReviseService[];
  perSession: boolean;
  openInstallments: number;
}) {
  const router = useRouter();
  const [action, setAction] = useState<
    "add_sessions" | "add_item" | "remove_sessions" | "replan"
  >("add_sessions");
  const [saleItemId, setSaleItemId] = useState(items[0]?.id ?? "");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [sessions, setSessions] = useState("1");
  const [price, setPrice] = useState(
    items[0] ? toText(items[0].sessionPriceCents) : "",
  );
  const [count, setCount] = useState(String(Math.max(1, openInstallments)));
  const [firstDueDate, setFirstDueDate] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await call(() =>
      reviseSaleAction(saleId, {
        reason,
        action,
        saleItemId,
        serviceId,
        sessions,
        sessionPrice: price,
        installmentsCount: count,
        firstDueDate,
      }),
    );
    setSaving(false);
    if (result.ok) {
      setReason("");
      setErrors({});
      setFormError(null);
      router.refresh();
      return;
    }
    setErrors(result.fieldErrors ?? {});
    setFormError(summaryError(result));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-2">
      <div className="grid content-start gap-1 md:col-span-2">
        <Label htmlFor="alterar-acao">O que mudar</Label>
        <NativeSelect
          id="alterar-acao"
          value={action}
          onChange={(event) => setAction(event.target.value as typeof action)}
        >
          <option value="add_sessions">Acrescentar sessões a um serviço</option>
          <option value="add_item">Acrescentar outro serviço</option>
          <option value="remove_sessions">Retirar sessões não agendadas</option>
          {!perSession ? (
            <option value="replan">Renegociar as parcelas em aberto</option>
          ) : null}
        </NativeSelect>
      </div>

      {action === "add_sessions" || action === "remove_sessions" ? (
        <div className="grid content-start gap-1">
          <Label htmlFor="alterar-item">Serviço da venda</Label>
          <NativeSelect
            id="alterar-item"
            value={saleItemId}
            onChange={(event) => {
              setSaleItemId(event.target.value);
              const it = items.find((i) => i.id === event.target.value);
              if (it) setPrice(toText(it.sessionPriceCents));
            }}
          >
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.serviceName}
              </option>
            ))}
          </NativeSelect>
          <FieldError id="alterar-item-erro" message={errors.saleItemId} />
        </div>
      ) : null}
      {action === "add_item" ? (
        <div className="grid content-start gap-1">
          <Label htmlFor="alterar-servico">Serviço</Label>
          <NativeSelect
            id="alterar-servico"
            value={serviceId}
            onChange={(event) => {
              setServiceId(event.target.value);
              const s = services.find((i) => i.id === event.target.value);
              if (s?.priceCents != null) setPrice(toText(s.priceCents));
            }}
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
          <FieldError id="alterar-servico-erro" message={errors.serviceId} />
        </div>
      ) : null}
      {action !== "replan" ? (
        <div className="grid content-start gap-1">
          <Label htmlFor="alterar-sessoes">Sessões</Label>
          <Input
            id="alterar-sessoes"
            inputMode="numeric"
            value={sessions}
            aria-invalid={Boolean(errors.sessions)}
            onChange={(event) => setSessions(event.target.value)}
          />
          <FieldError id="alterar-sessoes-erro" message={errors.sessions} />
        </div>
      ) : null}
      {action === "add_sessions" || action === "add_item" ? (
        <div className="grid content-start gap-1">
          <Label htmlFor="alterar-preco">Valor por sessão</Label>
          <Input
            id="alterar-preco"
            inputMode="decimal"
            value={price}
            aria-invalid={Boolean(errors.sessionPrice)}
            onChange={(event) => setPrice(event.target.value)}
          />
          <FieldError id="alterar-preco-erro" message={errors.sessionPrice} />
        </div>
      ) : null}
      {!perSession ? (
        <>
          <div className="grid content-start gap-1">
            <Label htmlFor="alterar-parcelas">Parcelas para o que falta</Label>
            <Input
              id="alterar-parcelas"
              inputMode="numeric"
              value={count}
              aria-invalid={Boolean(errors.installmentsCount)}
              onChange={(event) => setCount(event.target.value)}
            />
            <FieldError
              id="alterar-parcelas-erro"
              message={errors.installmentsCount}
            />
          </div>
          <div className="grid content-start gap-1">
            <Label htmlFor="alterar-vencimento">1º vencimento (opcional)</Label>
            <Input
              id="alterar-vencimento"
              type="date"
              value={firstDueDate}
              aria-invalid={Boolean(errors.firstDueDate)}
              onChange={(event) => setFirstDueDate(event.target.value)}
            />
            <FieldError
              id="alterar-vencimento-erro"
              message={errors.firstDueDate}
            />
          </div>
        </>
      ) : null}
      <div className="grid content-start gap-1 md:col-span-2">
        <Label htmlFor="alterar-motivo">Motivo</Label>
        <Input
          id="alterar-motivo"
          value={reason}
          maxLength={200}
          aria-invalid={Boolean(errors.reason)}
          onChange={(event) => setReason(event.target.value)}
        />
        <FieldError id="alterar-motivo-erro" message={errors.reason} />
      </div>
      <p className="text-sm text-muted-foreground md:col-span-2">
        O que já foi pago não muda. As parcelas sem pagamento são refeitas para
        somar o que ainda falta.
      </p>
      <div className="grid gap-2 md:col-span-2">
        <FormError message={formError} />
        <Button type="submit" disabled={saving} className="w-fit">
          {saving ? "Salvando..." : "Salvar alteração"}
        </Button>
      </div>
    </form>
  );
}

export function CancelSaleForm({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [cancelSessions, setCancelSessions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (
      !window.confirm(
        "Cancelar esta venda? O que já foi pago continua registrado.",
      )
    )
      return;
    setSaving(true);
    const result = await call(() =>
      cancelSaleAction(saleId, {
        reason,
        cancelFutureSessions: cancelSessions,
      }),
    );
    setSaving(false);
    if (result.ok) router.refresh();
    else setError(result.fieldErrors?.form ?? summaryError(result));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-3">
      <div className="grid gap-1">
        <Label htmlFor="cancelar-motivo">Motivo do cancelamento</Label>
        <Input
          id="cancelar-motivo"
          value={reason}
          maxLength={200}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={cancelSessions}
          onChange={(event) => setCancelSessions(event.target.checked)}
          className="size-5 accent-primary"
        />
        Cancelar também as sessões futuras na agenda
      </label>
      <FormError message={error} />
      <Button
        type="submit"
        variant="outline"
        disabled={saving}
        className="w-fit"
      >
        {saving ? "Cancelando..." : "Cancelar venda"}
      </Button>
    </form>
  );
}
