"use client";

import "./agenda-calendar.css";

import type {
  DatesSetArg,
  DateSpanApi,
  DayHeaderContentArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
  EventInput,
  EventSourceFuncArg,
} from "@fullcalendar/core";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, {
  type DateClickArg,
  type EventResizeDoneArg,
} from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import luxonPlugin from "@fullcalendar/luxon3";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { DateTime } from "luxon";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import { STATUS_LABELS, type Status } from "@/modules/appointments/fields";
import type { Warning } from "@/modules/appointments/rules";
import { CLINIC_TIME_ZONE } from "@/modules/schedule/time";

import { loadCalendarAction, rescheduleAction } from "./actions";
import { AgendaRefreshContext } from "./agenda-refresh";

export type BusinessHoursInterval = {
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
};

const DESKTOP_QUERY = "(min-width: 768px)";
const LOAD_ERROR = "Não foi possível carregar a agenda. Tente novamente.";
const SAVE_ERROR = "Não foi possível remarcar. Tente novamente.";

function subscribeToWidth(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// null on the server and during hydration, so the first render is stable.
function useIsDesktop(): boolean | null {
  return useSyncExternalStore(
    subscribeToWidth,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => null,
  );
}

type Move = {
  id: string;
  startsAt: string;
  endsAt: string;
  revert: () => void;
};

type PendingMove = Move & { warnings: Warning[] };

type ViewName = "timeGridDay" | "timeGridWeek" | "dayGridMonth" | "listWeek";

const VIEWS: { name: ViewName; label: string; phone: boolean }[] = [
  { name: "timeGridDay", label: "Dia", phone: true },
  { name: "timeGridWeek", label: "Semana", phone: false },
  { name: "dayGridMonth", label: "Mês", phone: false },
  { name: "listWeek", label: "Lista", phone: true },
];

// The arrows name the period they move by.
const STEP_LABELS: Record<ViewName, { prev: string; next: string }> = {
  timeGridDay: { prev: "Dia anterior", next: "Próximo dia" },
  timeGridWeek: { prev: "Semana anterior", next: "Próxima semana" },
  dayGridMonth: { prev: "Mês anterior", next: "Próximo mês" },
  listWeek: { prev: "Semana anterior", next: "Próxima semana" },
};

// "08:00": hour labels and event times.
const TIME_FORMAT = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
} as const;

function inClinicZone(date: Date) {
  return DateTime.fromJSDate(date, { zone: CLINIC_TIME_ZONE }).setLocale(
    "pt-BR",
  );
}

const DAY_MONTH = "d 'de' LLLL";
const DAY_MONTH_YEAR = "d 'de' LLLL 'de' yyyy";

// "1 a 7 de novembro de 2026", "26 de outubro a 1 de novembro de 2026",
// "novembro de 2026" or "terça-feira, 3 de novembro de 2026". `end` is
// exclusive, as FullCalendar gives it.
function formatRange(view: ViewName, start: Date, end: Date): string {
  const first = inClinicZone(start);
  if (view === "dayGridMonth") return first.toFormat("LLLL 'de' yyyy");
  if (view === "timeGridDay") return first.toFormat(`cccc, ${DAY_MONTH_YEAR}`);
  const last = inClinicZone(end).minus({ days: 1 });
  const lastText = last.toFormat(DAY_MONTH_YEAR);
  if (!first.hasSame(last, "year")) {
    return `${first.toFormat(DAY_MONTH_YEAR)} a ${lastText}`;
  }
  if (!first.hasSame(last, "month")) {
    return `${first.toFormat(DAY_MONTH)} a ${lastText}`;
  }
  return `${first.toFormat("d")} a ${lastText}`;
}

// "seg." -> "SEG".
function weekdayShort(text: string) {
  return text.replace(".", "").toUpperCase();
}

function renderDayHeader(arg: DayHeaderContentArg) {
  // The list view keeps FullCalendar's full date line.
  if (arg.view.type.startsWith("list")) return true;
  // The month view's header row names only the weekday. Its dates are not
  // real days, so FullCalendar's own text ("seg.") is used.
  if (arg.view.type === "dayGridMonth") {
    return <span className="agenda-day-weekday">{weekdayShort(arg.text)}</span>;
  }
  const weekday = weekdayShort(inClinicZone(arg.date).toFormat("ccc"));
  return (
    <span className="agenda-day">
      <span className="agenda-day-weekday">
        {arg.isToday ? `${weekday} · HOJE` : weekday}
      </span>
      <span className="agenda-day-number">{inClinicZone(arg.date).day}</span>
    </span>
  );
}

// Name on the first line, "service · status" on the second. The hidden time
// and separator keep the text starting like the title for screen readers.
// A block is a hatched card: "Bloqueado" over its title.
function renderEvent(arg: EventContentArg) {
  if (arg.view.type.startsWith("list")) return true;
  if (arg.event.display === "background") {
    if (!arg.event.classNames.includes("fc-block")) return true;
    return (
      <span className="agenda-block">
        <strong>Bloqueado</strong>
        <span>{arg.event.title}</span>
      </span>
    );
  }
  const { patientLabel, serviceLabel, status } = arg.event.extendedProps as {
    patientLabel?: string;
    serviceLabel?: string;
    status?: Status;
  };
  if (!patientLabel) return true;
  const statusText = status ? ` · ${STATUS_LABELS[status].toLowerCase()}` : "";
  return (
    <span className="agenda-event">
      {arg.timeText ? <span className="sr-only">{arg.timeText} </span> : null}
      <strong className="agenda-event-name">{patientLabel}</strong>
      <span className="sr-only"> · </span>
      <span className="agenda-event-service">
        {serviceLabel}
        {statusText}
      </span>
    </span>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-[18px]"
    >
      <path d={direction === "left" ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"} />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
      className="size-[18px]"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function AgendaCalendar({
  slotMinTime,
  slotMaxTime,
  slotStepMinutes,
  businessHours,
  canCreate,
  notice,
  aside,
}: {
  slotMinTime: string;
  slotMaxTime: string;
  slotStepMinutes: number;
  businessHours: BusinessHoursInterval[];
  canCreate: boolean;
  notice?: ReactNode;
  aside?: ReactNode;
}) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const calendarRef = useRef<FullCalendar>(null);
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPendingState] = useState<PendingMove | null>(null);
  const [busy, setBusyState] = useState(false);
  const [view, setView] = useState<ViewName | null>(null);
  const [rangeTitle, setRangeTitle] = useState("");
  // Mirrors of busy/pending for FullCalendar callbacks, updated in the same
  // handler as the state so a second drop right after the first sees them.
  const busyRef = useRef(false);
  const pendingRef = useRef<PendingMove | null>(null);

  function setBusy(value: boolean) {
    busyRef.current = value;
    setBusyState(value);
  }

  function setPending(value: PendingMove | null) {
    pendingRef.current = value;
    setPendingState(value);
  }

  // The server is the source of truth: after any decision the visible range
  // is reloaded instead of trusting local reverts.
  function refetch() {
    calendarRef.current?.getApi().refetchEvents();
  }

  const loadEvents = useCallback(
    (
      info: EventSourceFuncArg,
      success: (events: EventInput[]) => void,
      failure: (error: Error) => void,
    ) => {
      loadCalendarAction({
        from: info.startStr,
        to: info.endStr,
        includeCancelled,
      }).then(
        (result) => {
          if (!result.ok) {
            setMessage(result.formError);
            failure(new Error(result.formError));
            return;
          }
          const appointments: EventInput[] = result.events.map((event) => {
            return {
              id: event.id,
              title: event.title,
              start: event.start,
              end: event.end,
              classNames: [`fc-status-${event.status}`],
              extendedProps: {
                patientLabel: event.patientLabel,
                serviceLabel: event.serviceLabel,
                status: event.status,
              },
              // Editable events inherit the calendar's `editable`, which is
              // off on phones and while a move is saving or undecided. The
              // keys must be absent there: FullCalendar reads a present
              // `undefined` as false.
              ...(event.editable
                ? {}
                : { editable: false, durationEditable: false }),
            };
          });
          const blocks: EventInput[] = result.blocks.map((block) => ({
            id: `block-${block.id}`,
            title: block.title,
            start: block.start,
            end: block.end,
            allDay: block.allDay,
            display: "background",
            classNames: ["fc-block"],
            editable: false,
          }));
          success([...appointments, ...blocks]);
        },
        () => {
          setMessage(LOAD_ERROR);
          failure(new Error(LOAD_ERROR));
        },
      );
    },
    [includeCancelled],
  );

  async function submitMove(move: Move, acknowledgeWarnings: boolean) {
    setBusy(true);
    let result: Awaited<ReturnType<typeof rescheduleAction>>;
    try {
      result = await rescheduleAction({
        id: move.id,
        startsAt: move.startsAt,
        endsAt: move.endsAt,
        acknowledgeWarnings,
      });
    } catch {
      result = { ok: false, formError: SAVE_ERROR };
    } finally {
      setBusy(false);
    }

    if (result.ok) {
      setPending(null);
      setMessage("Agendamento remarcado.");
      refetch();
      // The side panel's lists come from the server.
      router.refresh();
      return;
    }
    if (!acknowledgeWarnings && result.warnings && result.warnings.length > 0) {
      // The event stays in its new spot until the admin decides.
      setPending({ ...move, warnings: result.warnings });
      setMessage("Confira os avisos para concluir a remarcação.");
      return;
    }
    // Refused: instant feedback, then the server's positions.
    move.revert();
    setPending(null);
    setMessage(
      result.formError ??
        Object.values(result.fieldErrors ?? {})[0] ??
        SAVE_ERROR,
    );
    refetch();
  }

  // Guarded cases (no e2e yet; they need appointments, which Task 4 adds):
  // - a second drag, of the same or another event, while a move is saving or
  //   its warnings are undecided: refused here and `editable` is off;
  // - a timed appointment dropped into the all-day row (it would send a date
  //   without a time or offset): refused here.
  // Only appointments are editable (blocks never are), and they are timed.
  function allowMove(span: DateSpanApi) {
    if (busyRef.current || pendingRef.current) return false;
    return !span.allDay;
  }

  function handleMove(info: EventDropArg | EventResizeDoneArg) {
    // Defensive: allowMove already refuses this.
    if (busyRef.current || pendingRef.current) {
      info.revert();
      return;
    }
    void submitMove(
      {
        id: info.event.id,
        startsAt: info.event.startStr,
        endsAt: info.event.endStr,
        revert: info.revert,
      },
      false,
    );
  }

  function undoPending() {
    if (!pending) return;
    pending.revert();
    setPending(null);
    setMessage("Remarcação desfeita.");
    refetch();
  }

  // Guarded case: prev/next or a view change while warnings are undecided.
  // The old revert snapshot belongs to the previous range, so it is dropped
  // (not applied) and the new range is reloaded from the server.
  function handleDatesSet(arg: DatesSetArg) {
    const type = arg.view.type as ViewName;
    setView(type);
    setRangeTitle(
      formatRange(type, arg.view.currentStart, arg.view.currentEnd),
    );
    if (!pendingRef.current) return;
    setPending(null);
    setMessage("Remarcação desfeita.");
    refetch();
  }

  function handleDateClick(info: DateClickArg) {
    if (info.allDay) {
      // A day cell (month view) opens that day; a time slot opens the form.
      calendarRef.current?.getApi().changeView("timeGridDay", info.date);
      return;
    }
    // dateStr is in the clinic zone, e.g. "2026-11-03T09:00:00-03:00".
    const inicio = info.dateStr.slice(0, 16);
    router.push(`/admin/agenda/novo?inicio=${inicio}` as Route);
  }

  function handleEventClick(info: EventClickArg) {
    info.jsEvent.preventDefault();
    if (info.event.display === "background") return;
    router.push(`/admin/agenda/${info.event.id}` as Route);
  }

  function api() {
    return calendarRef.current?.getApi();
  }

  const slotStep = { minutes: slotStepMinutes };
  const steps = STEP_LABELS[view ?? "timeGridWeek"];
  const ready = isDesktop !== null;
  const visibleViews = VIEWS.filter((item) => isDesktop || item.phone);

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-0.5">
          <h1 className="font-heading text-[32px] leading-tight font-extrabold">
            Agenda
          </h1>
          <p className="min-h-[1.45em] text-muted-foreground">{rangeTitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="bg-card"
              aria-label={steps.prev}
              disabled={!ready}
              onClick={() => api()?.prev()}
            >
              <ChevronIcon direction="left" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="bg-card px-4"
              disabled={!ready}
              onClick={() => api()?.today()}
            >
              Hoje
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="bg-card"
              aria-label={steps.next}
              disabled={!ready}
              onClick={() => api()?.next()}
            >
              <ChevronIcon direction="right" />
            </Button>
          </div>
          <div
            role="group"
            aria-label="Visualização"
            className="flex h-11 gap-1 rounded-xl bg-muted p-1"
          >
            {visibleViews.map((item) => {
              const active = view === item.name;
              return (
                <button
                  key={item.name}
                  type="button"
                  aria-pressed={active}
                  disabled={!ready}
                  onClick={() => api()?.changeView(item.name)}
                  className={
                    active
                      ? "h-9 rounded-lg bg-card px-3.5 text-sm font-bold text-primary shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      : "h-9 rounded-lg px-3.5 text-sm font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  }
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          {canCreate ? (
            <Button asChild>
              <Link href={"/admin/agenda/novo" as Route}>
                <PlusIcon />
                Novo agendamento
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      {notice}

      <label className="-my-2 flex h-11 w-fit items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={includeCancelled}
          onChange={(event) => {
            // The new source reloads every event from the server, which
            // also drops an undecided move.
            if (pendingRef.current) setMessage("Remarcação desfeita.");
            setPending(null);
            setIncludeCancelled(event.target.checked);
          }}
        />
        Mostrar cancelados
      </label>

      {pending ? (
        <div className="grid gap-3 rounded-lg border border-status-requested-border bg-status-requested p-4 text-status-requested-foreground">
          <p className="font-semibold">Este horário tem avisos:</p>
          <ul className="list-disc pl-5 text-sm">
            {pending.warnings.map((warning) => (
              <li key={warning.code}>{warning.message}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy}
              onClick={() => void submitMove(pending, true)}
            >
              Agendar mesmo assim
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={undoPending}
            >
              Desfazer
            </Button>
          </div>
        </div>
      ) : null}

      <p role="status" className="text-sm empty:hidden">
        {message}
      </p>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section
          aria-label="Agenda"
          className={
            slotStepMinutes >= 30
              ? "agenda-calendar agenda-calendar-roomy"
              : "agenda-calendar"
          }
        >
          {isDesktop === null ? (
            <div
              aria-hidden="true"
              className="h-[480px] animate-pulse rounded-2xl bg-muted"
            />
          ) : (
            <FullCalendar
              // Switching between phone and desktop rebuilds the calendar
              // with the matching default view and drag settings.
              key={isDesktop ? "desktop" : "phone"}
              ref={calendarRef}
              plugins={[
                dayGridPlugin,
                timeGridPlugin,
                listPlugin,
                interactionPlugin,
                luxonPlugin,
              ]}
              locale={ptBrLocale}
              timeZone={CLINIC_TIME_ZONE}
              firstDay={1}
              initialView={isDesktop ? "timeGridWeek" : "listWeek"}
              // The header and toolbar above drive the calendar.
              headerToolbar={false}
              footerToolbar={false}
              height="auto"
              allDaySlot={false}
              noEventsText="Nenhum atendimento neste período."
              nowIndicator
              slotMinTime={slotMinTime}
              slotMaxTime={slotMaxTime}
              slotDuration={slotStep}
              snapDuration={slotStep}
              slotLabelFormat={TIME_FORMAT}
              eventTimeFormat={TIME_FORMAT}
              dayHeaderContent={renderDayHeader}
              eventContent={renderEvent}
              // Filled blocks in the month view too, not dots.
              eventDisplay="block"
              // Up to a 30-minute appointment: name and service on one line.
              eventShortHeight={40}
              businessHours={businessHours}
              editable={isDesktop && !busy && pending === null}
              eventAllow={allowMove}
              datesSet={handleDatesSet}
              events={loadEvents}
              dateClick={handleDateClick}
              eventClick={handleEventClick}
              eventDrop={handleMove}
              eventResize={handleMove}
            />
          )}
        </section>
        <AgendaRefreshContext value={refetch}>{aside}</AgendaRefreshContext>
      </div>
    </div>
  );
}
