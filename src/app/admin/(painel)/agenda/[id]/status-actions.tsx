"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  CANCELLATION_REASON_LABELS,
  type CancellationReason,
  type Status,
} from "@/modules/appointments/fields";

import { changeStatusAction } from "../actions";

const STATUS_ERROR = "Não foi possível mudar o status. Tente novamente.";

const ACTION_LABELS: Record<Exclude<Status, "requested">, string> = {
  confirmed: "Confirmar",
  completed: "Marcar como concluído",
  no_show: "Marcar falta",
  cancelled: "Cancelar agendamento",
};

const REASONS = Object.entries(CANCELLATION_REASON_LABELS) as [
  CancellationReason,
  string,
][];

// Stays mounted across refreshes, so its status message survives the
// transition that removes every button (a cancellation).
export function StatusActions({
  id,
  allowedTransitions,
}: {
  id: string;
  allowedTransitions: Status[];
}) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState<CancellationReason | "">("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const messageRef = useRef<HTMLParagraphElement>(null);
  const focusMessage = useRef(false);

  // After a refresh the clicked button may be gone (a cancellation removes
  // them all), so focus moves to the message instead of dropping to <body>.
  useEffect(() => {
    if (message && focusMessage.current) messageRef.current?.focus();
    focusMessage.current = false;
  }, [message]);

  useEffect(() => {
    if (cancelling) document.getElementById("cancellation-reason")?.focus();
  }, [cancelling]);

  async function change(to: Status) {
    if (to === "cancelled" && !reason) {
      setReasonError("Escolha o motivo do cancelamento.");
      document.getElementById("cancellation-reason")?.focus();
      return;
    }
    setPending(true);
    setFormError(null);
    setReasonError(null);
    setMessage("");
    let result;
    try {
      result = await changeStatusAction(
        to === "cancelled" ? { id, to, reason } : { id, to },
      );
    } catch {
      setFormError(STATUS_ERROR);
      return;
    } finally {
      setPending(false);
    }
    if (!result.ok) {
      const fieldError = result.fieldErrors?.reason;
      if (fieldError) setReasonError(fieldError);
      else setFormError(result.formError ?? STATUS_ERROR);
      return;
    }
    focusMessage.current = true;
    setCancelling(false);
    setReason("");
    setMessage(
      to === "cancelled" ? "Agendamento cancelado." : "Status atualizado.",
    );
    router.refresh();
  }

  const buttons = allowedTransitions.filter(
    (to): to is Exclude<Status, "requested"> => to !== "requested",
  );

  return (
    <div className="grid gap-4">
      {buttons.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {buttons.map((to) => (
            <Button
              key={to}
              type="button"
              variant={to === "cancelled" ? "outline" : "default"}
              disabled={pending || (to === "cancelled" && cancelling)}
              onClick={() => {
                if (to === "cancelled") {
                  setCancelling(true);
                  return;
                }
                void change(to);
              }}
            >
              {ACTION_LABELS[to]}
            </Button>
          ))}
        </div>
      ) : null}

      {cancelling && buttons.includes("cancelled") ? (
        <div className="grid gap-3 rounded-lg border p-4">
          <div className="grid gap-2 sm:max-w-sm">
            <Label htmlFor="cancellation-reason">Motivo do cancelamento</Label>
            <NativeSelect
              id="cancellation-reason"
              value={reason}
              aria-invalid={Boolean(reasonError)}
              aria-describedby={
                reasonError ? "cancellation-reason-error" : undefined
              }
              onChange={(event) =>
                setReason(event.target.value as CancellationReason | "")
              }
            >
              <option value="">Escolha o motivo</option>
              {REASONS.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </NativeSelect>
            <FieldError
              id="cancellation-reason-error"
              message={reasonError ?? undefined}
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => void change("cancelled")}
            >
              {pending ? "Salvando..." : "Confirmar cancelamento"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setCancelling(false);
                setReasonError(null);
              }}
            >
              Voltar
            </Button>
          </div>
        </div>
      ) : null}

      <FormError message={formError} />
      <p
        ref={messageRef}
        tabIndex={-1}
        role="status"
        className="min-h-5 text-sm outline-none"
      >
        {message}
      </p>
    </div>
  );
}
