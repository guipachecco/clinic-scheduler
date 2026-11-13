"use client";

import { DateTime } from "luxon";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";

import { book, type Confirmation, loadDays, loadSlots } from "./actions";
import { ConfirmSheet } from "./confirm-sheet";
import { DayStrip, dayLabel, STRIP_SPAN, stripDays } from "./day-strip";
import { Icon } from "../icons";
import { visitPriceLabel } from "../ui";
import { SlotGroups } from "./slot-groups";

// Services (one or more, done one after the other in the same visit) → day strip → times by period → confirm sheet, then the
// confirmation. Dates are local to the clinic (yyyy-mm-dd); slots are ISO
// strings carrying the clinic's offset, so their HH:mm is already the
// clinic's time.

export type ServiceOption = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: string | null;
  priceCents: number | null;
  priceDisplay: "fixed" | "starting_at" | "on_request" | "hidden";
};

type Step = "service" | "day" | "done";

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

const monthOf = (date: string) => date.slice(0, 7);

export function BookingFlow({
  slug,
  services,
  today,
  lastDay,
  maxServices,
  initialServiceId,
}: {
  slug: string;
  services: ServiceOption[];
  today: string;
  lastDay: string;
  maxServices: number;
  initialServiceId?: string;
}) {
  const initial = services.find((item) => item.id === initialServiceId) ?? null;
  const [step, setStep] = useState<Step>(initial ? "day" : "service");
  // The ids she ticked; `chosen` keeps them in the clinic's order.
  const [selected, setSelected] = useState<string[]>(
    initial ? [initial.id] : [],
  );
  const chosen = services.filter((item) => selected.includes(item.id));
  const minutes = chosen.reduce((sum, item) => sum + item.durationMinutes, 0);
  const price = visitPriceLabel(
    chosen.map((item) => ({
      display: item.priceDisplay,
      cents: item.priceCents,
    })),
  );
  const [start, setStart] = useState(today);
  // Days with free times, by month (yyyy-mm) already fetched.
  const [available, setAvailable] = useState<Record<string, string[]>>({});
  const [day, setDay] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [slot, setSlot] = useState<string | null>(null);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
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

  // Fetches the months a week of the strip touches that are not loaded yet.
  async function loadWeek(
    ids: string[],
    from: string,
    known: Record<string, string[]>,
  ) {
    const days = stripDays(from);
    const months = [monthOf(days[0]!), monthOf(days[STRIP_SPAN - 1]!)].filter(
      (value, index, all) => all.indexOf(value) === index && !(value in known),
    );
    const fetched = await Promise.all(
      months.map(
        async (value) => [value, await loadDays(slug, ids, value)] as const,
      ),
    );
    setAvailable({ ...known, ...Object.fromEntries(fetched) });
    setStart(from);
  }

  function toggleService(id: string) {
    setError(null);
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id],
    );
  }

  function continueToDay() {
    if (selected.length === 0) return;
    run(async () => {
      setDay(null);
      setSlot(null);
      setSlots([]);
      await loadWeek(selected, today, {});
      setStep("day");
    });
  }

  // A service preselected by the link: load its first week once.
  useEffect(() => {
    // Fetch-on-mount: the state is set after the request, not in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initial) run(() => loadWeek([initial.id], today, {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function shift(delta: number) {
    if (selected.length === 0) return;
    const target = DateTime.fromISO(start)
      .plus({ days: delta })
      .toFormat("yyyy-MM-dd");
    // Never before today; the strip may end past the last day (dimmed).
    run(() => loadWeek(selected, target < today ? today : target, available));
  }

  function chooseDay(value: string) {
    if (selected.length === 0) return;
    run(async () => {
      setDay(value);
      setSlot(null);
      setSlots(await loadSlots(slug, selected, value));
    });
  }

  function chooseSlot(value: string, from: HTMLElement) {
    setError(null);
    setTrigger(from);
    setSlot(value);
  }

  function closeSheet() {
    if (pending) return;
    setSlot(null);
    setError(null);
  }

  function confirm() {
    if (selected.length === 0 || !slot || !day) return;
    run(async () => {
      const result = await book(slug, {
        serviceIds: selected,
        startsAt: slot,
      });
      if (result.ok) {
        setConfirmation(result.confirmation);
        setStep("done");
        return;
      }
      if (result.reason === "taken") {
        // Back to the refreshed list of that day.
        setSlots(await loadSlots(slug, selected, day));
        const month = monthOf(day);
        const fresh = await loadDays(slug, selected, month);
        setAvailable((known) => ({ ...known, [month]: fresh }));
        setSlot(null);
      }
      setError(FAILURES[result.reason]);
    });
  }

  if (step === "done" && confirmation) {
    return (
      <Done
        slug={slug}
        confirmation={confirmation}
        serviceName={
          confirmation.serviceName ||
          chosen.map((item) => item.name).join(" + ")
        }
      />
    );
  }

  const open = new Set(Object.values(available).flat());

  return (
    <div className="grid gap-6" aria-busy={pending}>
      {step === "service" || chosen.length === 0 ? (
        <section aria-labelledby="passo-servico" className="grid gap-3">
          <h2 id="passo-servico" className="font-heading text-lg font-semibold">
            Escolha o serviço
          </h2>
          {services.length > 1 ? (
            <p className="text-sm text-muted-foreground">
              Quer fazer mais de um na mesma visita? Marque todos: eles ficam em
              um horário só, um depois do outro.
            </p>
          ) : null}
          <ul className="grid gap-3">
            {services.map((item) => {
              const on = selected.includes(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={
                      pending || (!on && selected.length >= maxServices)
                    }
                    onClick={() => toggleService(item.id)}
                    className={`flex w-full items-start gap-3 rounded-2xl border bg-card p-4 text-left outline-none hover:border-primary-text focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 ${on ? "border-primary-text" : ""}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border ${on ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}
                    >
                      {on ? <Icon name="check" className="size-4" /> : null}
                    </span>
                    <span className="grid min-w-0 gap-1">
                      <span className="font-semibold">{item.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {item.durationMinutes} min
                        {item.price ? ` · ${item.price}` : ""}
                      </span>
                      {item.description ? (
                        <span className="text-sm">{item.description}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {selected.length >= maxServices ? (
            <p className="text-sm text-muted-foreground">
              Dá para marcar até {maxServices} serviços por visita.
            </p>
          ) : null}
          <FormError message={error} />
          <div className="sticky bottom-24 grid gap-2 rounded-2xl border bg-card p-3 shadow-lg lg:bottom-4">
            <p className="text-sm" aria-live="polite">
              {chosen.length === 0
                ? "Nenhum serviço escolhido"
                : `${chosen.length} ${chosen.length === 1 ? "serviço" : "serviços"} · ${minutes} min${price ? ` · ${price}` : ""}`}
            </p>
            <Button
              type="button"
              size="lg"
              disabled={pending || chosen.length === 0}
              onClick={continueToDay}
            >
              {pending ? "Carregando..." : "Continuar"}
            </Button>
          </div>
        </section>
      ) : (
        <>
          <Summary
            label={chosen.length > 1 ? "Serviços" : "Serviço"}
            onChange={() => setStep("service")}
          >
            {chosen.map((item) => item.name).join(" + ")}
          </Summary>
          <section aria-labelledby="passo-dia" className="grid gap-3">
            <h2 id="passo-dia" className="font-heading text-lg font-semibold">
              Escolha o dia
            </h2>
            <DayStrip
              start={start}
              today={today}
              lastDay={lastDay}
              open={open}
              selected={day}
              disabled={pending}
              onShift={shift}
              onDay={chooseDay}
            />
            {day || slot ? null : <FormError message={error} />}
            {Object.keys(available).length > 0 &&
            !stripDays(start).some((date) => open.has(date)) ? (
              <p className="text-sm text-muted-foreground">
                Nenhum dia livre nesta semana. Veja os próximos dias.
              </p>
            ) : null}
          </section>
          {day ? (
            <section aria-labelledby="passo-horario" className="grid gap-3">
              <h2
                id="passo-horario"
                className="font-heading text-lg font-semibold"
              >
                Escolha o horário
              </h2>
              {slot ? null : <FormError message={error} />}
              {slots.length === 0 ? (
                <p className="text-muted-foreground">
                  Nenhum horário livre neste dia. Escolha outro dia.
                </p>
              ) : (
                <SlotGroups
                  slots={slots}
                  disabled={pending}
                  onSlot={chooseSlot}
                />
              )}
            </section>
          ) : null}
          {slot && day ? (
            <ConfirmSheet
              serviceNames={chosen.map((item) => item.name)}
              dayText={dayLabel(day)}
              slot={slot}
              minutes={minutes}
              price={price}
              error={error}
              pending={pending}
              onConfirm={confirm}
              onClose={closeSheet}
              returnFocus={trigger}
            />
          ) : null}
        </>
      )}
    </div>
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
                    className="font-semibold text-primary-text underline underline-offset-4"
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
