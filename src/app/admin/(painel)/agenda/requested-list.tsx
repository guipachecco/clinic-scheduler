"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { changeStatusAction } from "./actions";
import { useAgendaRefresh } from "./agenda-refresh";

export type RequestedListItem = {
  id: string;
  patientLabel: string;
  detail: string;
  requiresApproval: boolean;
};

const STATUS_ERROR = "Não foi possível mudar o status. Tente novamente.";

// The requests waiting for confirmation, each with Confirmar and Recusar.
// Recusar asks once more before cancelling.
export function RequestedList({ items }: { items: RequestedListItem[] }) {
  const router = useRouter();
  const refreshCalendar = useAgendaRefresh();
  const [refusing, setRefusing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function change(item: RequestedListItem, refuse: boolean) {
    setBusy(item.id);
    setMessage("");
    let result: Awaited<ReturnType<typeof changeStatusAction>>;
    try {
      result = await changeStatusAction(
        refuse
          ? { id: item.id, to: "cancelled", reason: "clinic_unavailable" }
          : { id: item.id, to: "confirmed" },
      );
    } catch {
      result = { ok: false, formError: STATUS_ERROR };
    } finally {
      setBusy(null);
    }
    if (!result.ok) {
      setMessage(
        result.formError ??
          Object.values(result.fieldErrors ?? {})[0] ??
          STATUS_ERROR,
      );
      return;
    }
    setRefusing(null);
    setMessage(refuse ? "Solicitação recusada." : "Agendamento confirmado.");
    refreshCalendar();
    router.refresh();
  }

  return (
    <>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma solicitação pendente.
        </p>
      ) : (
        <ul className="grid gap-2.5">
          {items.map((item) => {
            const disabled = busy !== null;
            return (
              <li
                key={item.id}
                className="grid gap-2.5 rounded-xl bg-background p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="grid min-w-0">
                    <strong className="truncate">{item.patientLabel}</strong>
                    <span className="text-sm text-muted-foreground">
                      {item.detail}
                    </span>
                    {item.requiresApproval ? (
                      <span className="text-[13px] text-status-requested-foreground">
                        Exige confirmação
                      </span>
                    ) : null}
                  </div>
                  <Link
                    href={`/admin/agenda/${item.id}` as Route}
                    className="shrink-0 rounded-md px-1 text-sm font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    Ver
                    <span className="sr-only">
                      {" "}
                      solicitação de {item.patientLabel}
                    </span>
                  </Link>
                </div>
                {refusing === item.id ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      className="flex-1 px-3 text-sm"
                      disabled={disabled}
                      onClick={() => void change(item, true)}
                    >
                      Confirmar recusa
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 bg-card px-3 text-sm"
                      disabled={disabled}
                      onClick={() => setRefusing(null)}
                    >
                      Voltar
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      className="flex-1 bg-highlight px-3 text-sm font-bold text-highlight-foreground hover:bg-highlight/85"
                      disabled={disabled}
                      onClick={() => void change(item, false)}
                    >
                      Confirmar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 bg-card px-3 text-sm"
                      disabled={disabled}
                      onClick={() => setRefusing(item.id)}
                    >
                      Recusar
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p role="status" className="text-sm empty:hidden">
        {message}
      </p>
    </>
  );
}
