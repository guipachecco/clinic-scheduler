"use client";

import { DateTime } from "luxon";
import Link from "next/link";
import { useState, useTransition } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { book, type Confirmation, loadDays, loadSlots } from "./actions";

// Service → day → time → confirm, then the confirmation. Dates are local to
// the clinic (yyyy-mm-dd); slots are ISO strings carrying the clinic's
// offset, so their HH:mm is already the clinic's time.

export type ServiceOption = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: string | null;
};

type Step = "service" | "day" | "time" | "confirm" | "done";

const TAKEN = "Esse horário acabou de ser preenchido";
const FAILURES = {
  taken: TAKEN,
  limit:
    "Você já tem o número máximo de horários marcados nesta clínica. Para marcar outro, fale com a clínica.",
  unavailable:
    "Não foi possível marcar esse horário. Escolha outro ou tente mais tarde.",
  unverified: "Confirme seu e-mail para marcar horários.",
} as const;
const GENERIC_ERROR = "Não foi possível carregar. Tente novamente.";
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

const timeOf = (slot: string) => slot.slice(11, 16);
const monthOf = (date: string) => date.slice(0, 7);
const local = (date: string) => DateTime.fromISO(date).setLocale("pt-BR");

function dayLabel(date: string) {
  return local(date).toFormat("cccc, d 'de' LLLL");
}

export function BookingFlow({
  slug,
  services,
  today,
  lastDay,
}: {
  slug: string;
  services: ServiceOption[];
  today: string;
  lastDay: string;
}) {
  const [step, setStep] = useState<Step>("service");
  const [service, setService] = useState<ServiceOption | null>(null);
  const [month, setMonth] = useState(monthOf(today));
  const [days, setDays] = useState<string[]>([]);
  const [day, setDay] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [slot, setSlot] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(task: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await task();
      } catch {
        setError(GENERIC_ERROR);
      }
    });
  }

  async function showMonth(target: ServiceOption, value: string) {
    let list = await loadDays(slug, target.id, value);
    // Nothing left this month: open the next one, when it is still bookable.
    const next = local(`${value}-01`).plus({ months: 1 }).toFormat("yyyy-MM");
    if (
      list.length === 0 &&
      value === monthOf(today) &&
      next <= monthOf(lastDay)
    ) {
      const later = await loadDays(slug, target.id, next);
      if (later.length > 0) {
        value = next;
        list = later;
      }
    }
    setMonth(value);
    setDays(list);
  }

  function chooseService(target: ServiceOption) {
    run(async () => {
      setService(target);
      setDay(null);
      setSlot(null);
      await showMonth(target, monthOf(today));
      setStep("day");
    });
  }

  function changeMonth(delta: number) {
    if (!service) return;
    const value = local(`${month}-01`)
      .plus({ months: delta })
      .toFormat("yyyy-MM");
    run(async () => {
      setDays(await loadDays(slug, service.id, value));
      setMonth(value);
    });
  }

  function chooseDay(value: string) {
    if (!service) return;
    run(async () => {
      setDay(value);
      setSlot(null);
      setSlots(await loadSlots(slug, service.id, value));
      setStep("time");
    });
  }

  function chooseSlot(value: string) {
    setError(null);
    setSlot(value);
    setStep("confirm");
  }

  function confirm() {
    if (!service || !slot || !day) return;
    run(async () => {
      const result = await book(slug, {
        serviceId: service.id,
        startsAt: slot,
      });
      if (result.ok) {
        setConfirmation(result.confirmation);
        setStep("done");
        return;
      }
      if (result.reason === "taken") {
        // Back to the refreshed list of that day.
        setSlots(await loadSlots(slug, service.id, day));
        setDays(await loadDays(slug, service.id, monthOf(day)));
        setSlot(null);
        setStep("time");
      }
      setError(FAILURES[result.reason]);
    });
  }

  if (step === "done" && confirmation && service && slot) {
    return (
      <Done
        slug={slug}
        confirmation={confirmation}
        serviceName={confirmation.serviceName || service.name}
      />
    );
  }

  return (
    <div className="grid gap-6" aria-busy={pending}>
      {step === "service" ? (
        <section aria-labelledby="passo-servico" className="grid gap-3">
          <StepTitle id="passo-servico" number={1}>
            Escolha o serviço
          </StepTitle>
          <ul className="grid gap-3">
            {services.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => chooseService(item)}
                  className="grid w-full gap-1 rounded-2xl border bg-card p-4 text-left outline-none hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
                >
                  <span className="font-semibold">{item.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {item.durationMinutes} min
                    {item.price ? ` · ${item.price}` : ""}
                  </span>
                  {item.description ? (
                    <span className="text-sm">{item.description}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <Summary label="Serviço" onChange={() => setStep("service")}>
          {service?.name}
        </Summary>
      )}

      {step === "day" && service ? (
        <section aria-labelledby="passo-dia" className="grid gap-3">
          <StepTitle id="passo-dia" number={2}>
            Escolha o dia
          </StepTitle>
          <Calendar
            month={month}
            days={days}
            canGoBack={month > monthOf(today)}
            canGoForward={month < monthOf(lastDay)}
            disabled={pending}
            onMonth={changeMonth}
            onDay={chooseDay}
          />
        </section>
      ) : null}

      {(step === "time" || step === "confirm") && day ? (
        <Summary label="Dia" onChange={() => setStep("day")}>
          {dayLabel(day)}
        </Summary>
      ) : null}

      {step === "time" && day ? (
        <section aria-labelledby="passo-horario" className="grid gap-3">
          <StepTitle id="passo-horario" number={3}>
            Escolha o horário
          </StepTitle>
          <FormError message={error} />
          {slots.length === 0 ? (
            <p className="text-muted-foreground">
              Nenhum horário livre neste dia. Escolha outro dia.
            </p>
          ) : (
            <div
              role="group"
              aria-label="Horários livres"
              className="grid grid-cols-3 gap-2"
            >
              {slots.map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => chooseSlot(value)}
                >
                  {timeOf(value)}
                </Button>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {step === "confirm" && service && day && slot ? (
        <section
          aria-labelledby="passo-confirmar"
          className="grid gap-4 rounded-2xl border bg-card p-4"
        >
          <StepTitle id="passo-confirmar" number={4}>
            Confirme o horário
          </StepTitle>
          <dl className="grid gap-1">
            <dt className="text-sm text-muted-foreground">Serviço</dt>
            <dd className="font-semibold">{service.name}</dd>
            <dt className="text-sm text-muted-foreground">Quando</dt>
            <dd className="font-semibold">
              {dayLabel(day)}, às {timeOf(slot)}
            </dd>
            <dt className="text-sm text-muted-foreground">Duração</dt>
            <dd>{service.durationMinutes} min</dd>
            {service.price ? (
              <>
                <dt className="text-sm text-muted-foreground">Valor</dt>
                <dd>{service.price}</dd>
              </>
            ) : null}
          </dl>
          <FormError message={error} />
          <Button type="button" size="lg" disabled={pending} onClick={confirm}>
            {pending ? "Marcando..." : "Confirmar horário"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => setStep("time")}
          >
            Escolher outro horário
          </Button>
        </section>
      ) : null}

      {step === "day" || step === "service" ? (
        <FormError message={error} />
      ) : null}
    </div>
  );
}

function StepTitle({
  id,
  number,
  children,
}: {
  id: string;
  number: number;
  children: React.ReactNode;
}) {
  return (
    <h2 id={id} className="font-heading text-lg font-semibold">
      <span className="text-muted-foreground">{number}. </span>
      {children}
    </h2>
  );
}

function Summary({
  label,
  children,
  onChange,
}: {
  label: string;
  children: React.ReactNode;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-3">
      <div className="grid min-w-0 gap-0.5">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="font-semibold break-words">{children}</span>
      </div>
      <Button type="button" variant="link" size="sm" onClick={onChange}>
        Trocar
      </Button>
    </div>
  );
}

function Calendar({
  month,
  days,
  canGoBack,
  canGoForward,
  disabled,
  onMonth,
  onDay,
}: {
  month: string;
  days: string[];
  canGoBack: boolean;
  canGoForward: boolean;
  disabled: boolean;
  onMonth: (delta: number) => void;
  onDay: (date: string) => void;
}) {
  const first = local(`${month}-01`);
  const open = new Set(days);
  // Sunday first, as on Brazilian calendars (Luxon: Monday 1 ... Sunday 7).
  const blanks = first.weekday % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: blanks }, () => null),
    ...Array.from({ length: first.daysInMonth ?? 30 }, (_, index) =>
      first.plus({ days: index }).toFormat("yyyy-MM-dd"),
    ),
  ];

  return (
    <div className="grid gap-3 rounded-2xl border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!canGoBack || disabled}
          onClick={() => onMonth(-1)}
          aria-label="Mês anterior"
        >
          ‹
        </Button>
        <p className="font-semibold capitalize" aria-live="polite">
          {first.toFormat("LLLL 'de' yyyy")}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!canGoForward || disabled}
          onClick={() => onMonth(1)}
          aria-label="Próximo mês"
        >
          ›
        </Button>
      </div>
      <div
        aria-hidden="true"
        className="grid grid-cols-7 text-center text-xs text-muted-foreground"
      >
        {WEEKDAYS.map((name, index) => (
          <span key={index}>{name}</span>
        ))}
      </div>
      <div role="group" aria-label="Dias" className="grid grid-cols-7 gap-1">
        {cells.map((date, index) =>
          date ? (
            <button
              key={date}
              type="button"
              disabled={!open.has(date) || disabled}
              onClick={() => onDay(date)}
              aria-label={dayLabel(date)}
              className={cn(
                "flex aspect-square min-h-10 items-center justify-center rounded-lg text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                open.has(date)
                  ? "bg-primary/10 text-foreground hover:bg-primary hover:text-primary-foreground"
                  : "text-muted-foreground/50",
              )}
            >
              {Number(date.slice(8))}
            </button>
          ) : (
            <span key={`blank-${index}`} />
          ),
        )}
      </div>
      {days.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum dia livre neste mês.
        </p>
      ) : null}
    </div>
  );
}

function Done({
  slug,
  confirmation,
  serviceName,
}: {
  slug: string;
  confirmation: Confirmation;
  serviceName: string;
}) {
  return (
    <section
      aria-labelledby="horario-marcado"
      className="grid gap-4 rounded-2xl border bg-card p-4"
    >
      <h2 id="horario-marcado" className="font-heading text-xl font-semibold">
        Horário marcado
      </h2>
      <dl className="grid gap-1">
        <dt className="text-sm text-muted-foreground">Serviço</dt>
        <dd className="font-semibold">{serviceName}</dd>
        <dt className="text-sm text-muted-foreground">Dia</dt>
        <dd className="font-semibold">{confirmation.dateLabel}</dd>
        <dt className="text-sm text-muted-foreground">Horário</dt>
        <dd className="font-semibold">{confirmation.timeLabel}</dd>
        {confirmation.address ? (
          <>
            <dt className="text-sm text-muted-foreground">Endereço</dt>
            <dd>
              {confirmation.address}
              {confirmation.mapsUrl ? (
                <>
                  {" "}
                  <a
                    href={confirmation.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-primary underline underline-offset-4"
                  >
                    Ver no mapa
                  </a>
                </>
              ) : null}
            </dd>
          </>
        ) : null}
      </dl>
      {confirmation.preparationInstructions ? (
        <div className="grid gap-1 rounded-xl bg-muted p-3">
          <p className="text-sm font-semibold">Como se preparar</p>
          <p className="text-sm whitespace-pre-line">
            {confirmation.preparationInstructions}
          </p>
        </div>
      ) : null}
      <Button asChild size="lg">
        <Link href={`/${slug}/meus-horarios`}>Ver meus horários</Link>
      </Button>
    </section>
  );
}
