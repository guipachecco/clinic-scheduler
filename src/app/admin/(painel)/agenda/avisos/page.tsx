import { DateTime } from "luxon";
import type { Metadata, Route } from "next";
import Link from "next/link";

import { requireAdmin } from "@/modules/auth/session";
import { listDayReminders } from "@/modules/reminders/manual";
import { CLINIC_TIME_ZONE, todayLocal } from "@/modules/schedule/time";

import { ReminderQueue } from "./reminder-queue";

export const metadata: Metadata = { title: "Avisar pelo WhatsApp" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const dayHref = (date: string) => `/admin/agenda/avisos?dia=${date}` as Route;

// The day's confirmed appointments, each one a tap away from a WhatsApp
// conversation with the reminder already typed. Opens on tomorrow.
export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string | string[] }>;
}) {
  const { clinicId } = await requireAdmin();
  const { dia } = await searchParams;
  const today = DateTime.fromISO(todayLocal(), { zone: CLINIC_TIME_ZONE });
  const picked =
    typeof dia === "string" && DATE.test(dia)
      ? DateTime.fromISO(dia, { zone: CLINIC_TIME_ZONE })
      : null;
  const day = picked?.isValid ? picked : today.plus({ days: 1 });
  const date = day.toFormat("yyyy-MM-dd");
  const now = new Date();
  const result = await listDayReminders(clinicId, date, now);
  const offset = Math.round(day.diff(today, "days").days);
  const label =
    offset === 0
      ? "Hoje"
      : offset === 1
        ? "Amanhã"
        : offset === -1
          ? "Ontem"
          : day.setLocale("pt-BR").toFormat("cccc");

  return (
    <div className="grid max-w-3xl gap-6">
      <div className="grid gap-1">
        <Link
          href="/admin/agenda"
          className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          ← Agenda
        </Link>
        <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">
          Avisar pelo WhatsApp
        </h1>
        <p className="text-muted-foreground">
          Cada &quot;Enviar&quot; abre o WhatsApp da clínica com a mensagem
          pronta. É só tocar em enviar lá e voltar para a próxima.
        </p>
      </div>

      <nav
        aria-label="Dia"
        className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3"
      >
        <Link
          href={dayHref(day.minus({ days: 1 }).toFormat("yyyy-MM-dd"))}
          aria-label="Dia anterior"
          className="flex size-10 items-center justify-center rounded-lg border hover:bg-muted"
        >
          ‹
        </Link>
        <p className="min-w-40 flex-1 text-center">
          <span className="font-semibold capitalize">{label}</span>{" "}
          <span className="text-muted-foreground">
            {day.toFormat("dd/MM/yyyy")}
          </span>
        </p>
        <Link
          href={dayHref(day.plus({ days: 1 }).toFormat("yyyy-MM-dd"))}
          aria-label="Próximo dia"
          className="flex size-10 items-center justify-center rounded-lg border hover:bg-muted"
        >
          ›
        </Link>
        <form action="/admin/agenda/avisos" className="flex gap-2">
          <label htmlFor="avisos-dia" className="sr-only">
            Escolher dia
          </label>
          <input
            id="avisos-dia"
            type="date"
            name="dia"
            defaultValue={date}
            className="h-10 rounded-lg border bg-background px-3 text-sm"
          />
          <button
            type="submit"
            className="h-10 rounded-lg border px-3 text-sm font-semibold hover:bg-muted"
          >
            Ir
          </button>
        </form>
      </nav>

      <ReminderQueue
        key={date}
        items={(result?.items ?? []).map((item) => ({
          id: item.id,
          time: DateTime.fromJSDate(item.startsAt, {
            zone: CLINIC_TIME_ZONE,
          }).toFormat("HH:mm"),
          patientName: item.patientName,
          serviceName: item.serviceName,
          link: item.link,
          reminded: item.reminded,
        }))}
      />
    </div>
  );
}
