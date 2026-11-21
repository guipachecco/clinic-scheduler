"use client";

import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { markRemindedAction } from "./actions";

export type QueueItem = {
  id: string;
  time: string;
  patientName: string;
  serviceName: string;
  // wa.me link with the message; null without a usable phone.
  link: string | null;
  reminded: boolean;
};

const MARK_FAILED =
  "Não conseguimos marcar como avisada. A mensagem abriu normalmente; tente marcar de novo.";

// The queue: one big button that always points to the next patient not yet
// reminded, and the full list with a button per patient. A tap opens the
// clinic's WhatsApp with the text ready (a plain link, so the browser treats
// it as her own click) and marks the reminder as sent; the big button moves
// on to the next one. Sending still needs her tap inside WhatsApp.
export function ReminderQueue({ items }: { items: QueueItem[] }) {
  const [reminded, setReminded] = useState<Set<string>>(
    () => new Set(items.filter((item) => item.reminded).map((item) => item.id)),
  );
  const [error, setError] = useState<string | null>(null);
  const next = useRef<HTMLAnchorElement>(null);

  const sendable = items.filter((item) => item.link);
  const pending = sendable.filter((item) => !reminded.has(item.id));
  const upcoming = pending[0] ?? null;
  const done = sendable.length - pending.length;

  // Opens the conversation from the link as it is now: marking re-renders
  // the big button with the next patient, which must not change where this
  // click goes.
  function send(
    event: React.MouseEvent,
    link: string,
    id: string,
    markIt = true,
  ) {
    event.preventDefault();
    window.open(link, "_blank", "noopener,noreferrer");
    if (markIt) void mark(id);
  }

  async function mark(id: string) {
    setError(null);
    setReminded((current) => new Set(current).add(id));
    const result = await markRemindedAction(id).catch(() => ({ ok: false }));
    if (!result.ok) {
      setReminded((current) => {
        const copy = new Set(current);
        copy.delete(id);
        return copy;
      });
      setError(MARK_FAILED);
      return;
    }
    // Back from WhatsApp, the next one is already under her finger.
    requestAnimationFrame(() => next.current?.focus({ preventScroll: true }));
  }

  if (items.length === 0) {
    return (
      <p className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
        Nenhum horário confirmado neste dia.
      </p>
    );
  }

  return (
    <section aria-labelledby="fila-titulo" className="grid gap-4">
      <div className="grid gap-3 rounded-2xl border bg-card p-4 md:p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="fila-titulo" className="font-heading text-lg font-semibold">
            {pending.length === 0 ? "Todas avisadas" : "Avisar todas"}
          </h2>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {done} de {sendable.length} avisadas
          </p>
        </div>
        <div
          aria-hidden="true"
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{
              width: `${sendable.length ? (done / sendable.length) * 100 : 0}%`,
            }}
          />
        </div>
        {upcoming?.link ? (
          <a
            ref={next}
            href={upcoming.link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => send(event, upcoming.link!, upcoming.id)}
            className="flex min-h-13 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-center font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Enviar para {upcoming.patientName.split(/\s+/)[0]} ({upcoming.time})
          </a>
        ) : sendable.length > 0 ? (
          <p className="text-sm">
            Pronto! Todas as clientes com WhatsApp deste dia foram avisadas.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <ul className="grid gap-2">
        {items.map((item) => {
          const isDone = reminded.has(item.id);
          return (
            <li
              key={item.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border bg-card p-3",
                upcoming?.id === item.id && "border-primary",
              )}
            >
              <span className="w-14 shrink-0 font-semibold tabular-nums">
                {item.time}
              </span>
              <span className="grid min-w-0 flex-1">
                <span className="truncate font-medium">{item.patientName}</span>
                <span className="truncate text-sm text-muted-foreground">
                  {item.serviceName}
                </span>
              </span>
              {!item.link ? (
                <span className="text-sm text-muted-foreground">
                  Sem WhatsApp
                </span>
              ) : (
                <>
                  {isDone ? (
                    <span className="text-sm font-semibold text-primary">
                      Avisada ✓
                    </span>
                  ) : null}
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) =>
                      send(event, item.link!, item.id, !isDone)
                    }
                    aria-label={`${isDone ? "Enviar de novo para" : "Enviar para"} ${item.patientName}`}
                    className="shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    {isDone ? "De novo" : "Enviar"}
                  </a>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
