"use client";

import { DateTime } from "luxon";
import { useEffect, useRef } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";

import { Icon, type IconName } from "../icons";

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled])";

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
      <Icon name={icon} className="mt-0.5 size-5 shrink-0 text-primary" />
      <div>
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="font-semibold">{children}</dd>
      </div>
    </div>
  );
}

// A bottom sheet above the bottom navigation: traps focus, closes on Escape
// and on the close icon, and gives focus back to the slot that opened it.
export function ConfirmSheet({
  serviceName,
  dayText,
  slot,
  minutes,
  price,
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
  error: string | null;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
  returnFocus: HTMLElement | null;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const node = sheet.current;
    node?.querySelector<HTMLElement>("[data-confirm]")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
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
    <div className="fixed inset-0 z-40 flex items-end justify-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="folha-titulo"
        className="relative grid max-h-full w-full max-w-md gap-4 overflow-y-auto rounded-t-3xl border-t bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="folha-titulo" className="font-heading text-lg font-semibold">
            Confirme seu horário
          </h2>
          <button
            type="button"
            aria-label="Fechar"
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
        <FormError message={error} />
        <Button
          type="button"
          size="lg"
          data-confirm
          disabled={pending}
          onClick={onConfirm}
        >
          {pending ? "Marcando..." : "Confirmar agendamento"}
        </Button>
      </div>
    </div>
  );
}
