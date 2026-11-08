import type { Route } from "next";
import Link from "next/link";
import { DateTime } from "luxon";

import type { DayAgenda } from "@/modules/dashboard/dashboard";
import { nextItem } from "@/modules/dashboard/day";

import { FloatingAgendar } from "../../home/agendar-fab";
import { DayList } from "../../home/day-list";
import { RequestedList, type RequestedListItem } from "../requested-list";

import { DayStrip } from "./day-strip";

// The phone agenda: the chosen day as a list with free intervals between the
// appointments. Rendered on the server from `?dia`; the calendar is for
// computers.
export function PhoneAgenda({
  agenda,
  marks,
  requested,
  now,
  canCreate,
}: {
  agenda: DayAgenda;
  marks: string[];
  requested: RequestedListItem[];
  now: Date;
  canCreate: boolean;
}) {
  const { date, zone, items, free, closed, blocks } = agenda;
  const blockedAllDay = blocks.find((block) => block.allDay);
  const status = closed
    ? "Fechado"
    : blockedAllDay
      ? `Bloqueado: ${blockedAllDay.title ?? "dia bloqueado"}`
      : null;

  return (
    <div className="grid gap-4 pb-24">
      <h1 className="sr-only">Agenda</h1>
      {requested.length > 0 ? (
        <Link
          href={"#pedidos" as Route}
          className="flex min-h-11 items-center justify-between gap-2 rounded-2xl border border-status-requested-border bg-status-requested px-4 py-2 text-sm font-semibold text-status-requested-foreground"
        >
          {requested.length === 1
            ? "1 pedido para confirmar"
            : `${requested.length} pedidos para confirmar`}
        </Link>
      ) : null}

      <DayStrip date={date} zone={zone} marks={marks} />
      {canCreate ? null : (
        <p className="rounded-2xl border bg-card p-4 text-sm">
          Para agendar, você precisa de um serviço ativo.{" "}
          <Link
            href="/admin/servicos"
            className="font-semibold text-primary underline underline-offset-4"
          >
            Cadastrar serviço
          </Link>
        </p>
      )}

      {status ? (
        <p className="rounded-2xl border border-dashed bg-card px-4 py-4 text-center text-sm font-semibold">
          {status}
        </p>
      ) : null}
      {items.length > 0 || (!status && free.length > 0) ? (
        <DayList
          label="Atendimentos do dia"
          items={items}
          free={status ? [] : free}
          date={date}
          highlightId={
            date === DateTime.fromJSDate(now, { zone }).toISODate()
              ? (nextItem(items, now)?.id ?? null)
              : null
          }
          zone={zone}
        />
      ) : status ? null : (
        <p className="rounded-2xl border border-dashed bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhum atendimento neste dia.
        </p>
      )}

      {requested.length > 0 ? (
        <section
          id="pedidos"
          aria-label="Aguardando confirmação"
          className="grid scroll-mt-4 gap-3 rounded-2xl border bg-card p-4"
        >
          <h2 className="font-heading text-base font-bold">
            Aguardando confirmação
          </h2>
          <RequestedList items={requested} />
        </section>
      ) : null}

      {canCreate ? <FloatingAgendar /> : null}
    </div>
  );
}
