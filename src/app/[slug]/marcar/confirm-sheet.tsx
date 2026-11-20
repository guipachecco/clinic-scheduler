"use client";

import { DateTime } from "luxon";
import { useEffect, useRef } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Icon, type IconName } from "../icons";

import type { DepositOffer } from "./actions";

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled])";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const formatCents = (cents: number) => money.format(cents / 100);

// "HH:mm – HH:mm": the slot's own clock (it carries the clinic's offset) plus
// the service's duration.
function range(slot: string, minutes: number) {
  const start = DateTime.fromISO(slot, { setZone: true });
  return `${start.toFormat("HH:mm")} – ${start
    .plus({ minutes })
    .toFormat("HH:mm")}`;
}

function Row({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon name={icon} className="mt-0.5 size-5 shrink-0 text-primary-text" />
      <div>
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="font-semibold">{children}</dd>
      </div>
    </div>
  );
}

// A bottom sheet above the bottom navigation (a centered dialog from lg): traps focus, closes on Escape
// and on the close icon, and gives focus back to the slot that opened it.
export function ConfirmSheet({
  serviceName,
  dayText,
  slot,
  minutes,
  price,
  deposit,
  cpf,
  onCpf,
  reminder,
  error,
  pending,
  onConfirm,
  onClose,
  returnFocus,
}: {
  serviceName: string;
  dayText: string;
  slot: string;
  minutes: number;
  price: string | null;
  // The Pix deposit this booking takes; null books as before.
  deposit: DepositOffer | null;
  cpf: string;
  onCpf: (value: string) => void;
  // The WhatsApp reminder checkbox; null hides it.
  reminder: { checked: boolean; onChange: (value: boolean) => void } | null;
  error: string | null;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
  returnFocus: HTMLElement | null;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const busy = useRef(pending);
  useEffect(() => {
    close.current = onClose;
    busy.current = pending;
  });

  useEffect(() => {
    const node = sheet.current;
    node?.querySelector<HTMLElement>("[data-confirm]")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busy.current) close.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (!firstItem || !lastItem) return;
      const active = document.activeElement;
      if (!node.contains(active)) {
        event.preventDefault();
        firstItem.focus();
      } else if (event.shiftKey && active === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && active === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      returnFocus?.focus();
    };
  }, [returnFocus]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center lg:items-center lg:p-6">
      <div
        aria-hidden="true"
        className="absolute inset-0 animate-[sheet-fade_150ms_ease-out] bg-black/50 motion-reduce:animate-none lg:backdrop-blur-sm"
        onClick={() => {
          if (!pending) onClose();
        }}
      />
      <div
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="folha-titulo"
        className="relative grid max-h-full w-full max-w-md animate-[sheet-up_220ms_ease-out] gap-4 overflow-y-auto rounded-t-3xl border-t bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl motion-reduce:animate-none lg:max-h-[calc(100dvh-3rem)] lg:max-w-lg lg:animate-[dialog-in_200ms_ease-out] lg:rounded-3xl lg:border lg:p-7"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="folha-titulo" className="font-heading text-lg font-semibold">
            Confirme seu horário
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            disabled={pending}
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-full outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Icon name="close" className="size-5" />
          </button>
        </div>
        <dl className="grid gap-3 rounded-2xl bg-muted p-4">
          <Row icon="check" label="Serviço">
            {serviceName}
          </Row>
          <Row icon="calendar" label="Dia">
            <span className="capitalize">{dayText}</span>
          </Row>
          <Row icon="clock" label="Horário">
            {range(slot, minutes)}
          </Row>
          {price ? (
            <Row icon="bag" label="Valor">
              {price}
            </Row>
          ) : null}
        </dl>
        {deposit ? (
          <div className="grid gap-1 rounded-2xl border p-4">
            <p className="font-semibold">
              Sinal de {formatCents(deposit.amountCents)} por Pix para garantir
              o horário
            </p>
            {deposit.restCents !== null && deposit.restCents > 0 ? (
              <p className="text-sm text-muted-foreground">
                Falta {formatCents(deposit.restCents)}, pago no dia.
              </p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              Devolvido se você desmarcar com mais de 24h de antecedência.
            </p>
          </div>
        ) : null}
        {deposit?.needsCpf ? (
          <div className="grid gap-2">
            <Label htmlFor="cpf-sinal">CPF de quem vai pagar</Label>
            <Input
              id="cpf-sinal"
              name="cpf"
              inputMode="numeric"
              autoComplete="off"
              maxLength={18}
              placeholder="000.000.000-00"
              value={cpf}
              disabled={pending}
              onChange={(event) => onCpf(event.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              O Pix pede um CPF. Ele fica só com o Asaas, que gera a cobrança.
            </p>
          </div>
        ) : null}
        {reminder ? (
          <label
            htmlFor="lembrete-whatsapp"
            className="flex min-h-11 items-center gap-3 text-sm font-semibold"
          >
            <input
              id="lembrete-whatsapp"
              name="lembrete"
              type="checkbox"
              className="size-5 shrink-0 accent-primary"
              checked={reminder.checked}
              disabled={pending}
              onChange={(event) => reminder.onChange(event.target.checked)}
            />
            Me avise 1 dia antes pelo WhatsApp
          </label>
        ) : null}
        <FormError message={error} />
        <Button
          type="button"
          size="lg"
          data-confirm
          disabled={pending}
          onClick={onConfirm}
        >
          {deposit
            ? pending
              ? "Gerando Pix..."
              : "Pagar sinal com Pix"
            : pending
              ? "Marcando..."
              : "Confirmar agendamento"}
        </Button>
      </div>
    </div>
  );
}
