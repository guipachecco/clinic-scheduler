"use client";

import { DateTime } from "luxon";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";

import {
  book,
  type Confirmation,
  type DepositOffer,
  type DepositPayload,
  loadDays,
  loadDepositOffer,
  loadSlots,
} from "./actions";
import { ConfirmSheet } from "./confirm-sheet";
import { DayStrip, dayLabel, STRIP_SPAN, stripDays } from "./day-strip";
import { PixStep } from "./pix-step";
import { SlotGroups } from "./slot-groups";

// Service → day strip → times by period → confirm sheet, then the
// confirmation (through the Pix step when the clinic takes a deposit). Dates are local to the clinic (yyyy-mm-dd); slots are ISO
// strings carrying the clinic's offset, so their HH:mm is already the
// clinic's time.

export type ServiceOption = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: string | null;
};

type Step = "service" | "day" | "pix" | "done";

const TAKEN = "Esse horário acabou de ser preenchido";
const FAILURES = {
  taken: TAKEN,
  unavailable:
    "Não foi possível marcar esse horário. Escolha outro ou tente mais tarde.",
  unverified: "Confirme seu e-mail para marcar horários.",
  cpf_required: "Informe o CPF de quem vai pagar o sinal.",
  cpf_invalid: "Confira o CPF: ele não parece válido.",
} as const;
const PIX_FAILED = "Não conseguimos gerar o Pix agora, tente de novo.";
const GENERIC_ERROR = "Não foi possível carregar. Tente novamente.";

const monthOf = (date: string) => date.slice(0, 7);

export function BookingFlow({
  slug,
  services,
  today,
  lastDay,
  initialServiceId,
}: {
  slug: string;
  services: ServiceOption[];
  today: string;
  lastDay: string;
  initialServiceId?: string;
}) {
  const initial = services.find((item) => item.id === initialServiceId) ?? null;
  const [step, setStep] = useState<Step>(initial ? "day" : "service");
  const [service, setService] = useState<ServiceOption | null>(initial);
  const [start, setStart] = useState(today);
  // Days with free times, by month (yyyy-mm) already fetched.
  const [available, setAvailable] = useState<Record<string, string[]>>({});
  const [day, setDay] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [slot, setSlot] = useState<string | null>(null);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [offer, setOffer] = useState<DepositOffer | null>(null);
  const [cpf, setCpf] = useState("");
  const [deposit, setDeposit] = useState<DepositPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const markPaid = useCallback(() => setStep("done"), []);

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
    target: ServiceOption,
    from: string,
    known: Record<string, string[]>,
  ) {
    const days = stripDays(from);
    const months = [monthOf(days[0]!), monthOf(days[STRIP_SPAN - 1]!)].filter(
      (value, index, all) => all.indexOf(value) === index && !(value in known),
    );
    const fetched = await Promise.all(
      months.map(
        async (value) =>
          [value, await loadDays(slug, target.id, value)] as const,
      ),
    );
    setAvailable({ ...known, ...Object.fromEntries(fetched) });
    setStart(from);
  }

  // Its first week and the deposit it takes, if any.
  async function openService(target: ServiceOption) {
    const [quote] = await Promise.all([
      loadDepositOffer(slug, target.id),
      loadWeek(target, today, {}),
    ]);
    setOffer(quote);
  }

  function chooseService(target: ServiceOption) {
    run(async () => {
      setService(target);
      setDay(null);
      setSlot(null);
      setSlots([]);
      setOffer(null);
      await openService(target);
      setStep("day");
    });
  }

  // A service preselected by the link: load its first week once.
  useEffect(() => {
    // Fetch-on-mount: the state is set after the request, not in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initial) run(() => openService(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function shift(delta: number) {
    if (!service) return;
    const target = DateTime.fromISO(start)
      .plus({ days: delta })
      .toFormat("yyyy-MM-dd");
    // Never before today; the strip may end past the last day (dimmed).
    run(() => loadWeek(service, target < today ? today : target, available));
  }

  function chooseDay(value: string) {
    if (!service) return;
    run(async () => {
      setDay(value);
      setSlot(null);
      setSlots(await loadSlots(slug, service.id, value));
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

  function restart() {
    setDeposit(null);
    setConfirmation(null);
    setSlot(null);
    setStep("day");
    if (day) chooseDay(day);
  }

  function confirm() {
    if (!service || !slot || !day) return;
    run(async () => {
      const result = await book(slug, {
        serviceId: service.id,
        startsAt: slot,
        ...(offer?.needsCpf ? { cpf } : {}),
      });
      if (result.ok) {
        setConfirmation(result.confirmation);
        setDeposit(result.deposit);
        setCpf("");
        setStep(result.deposit?.status === "pending" ? "pix" : "done");
        return;
      }
      if (result.reason === "cpf_required") {
        setOffer(await loadDepositOffer(slug, service.id));
      }
      if (result.reason === "unavailable" && offer) {
        setError(PIX_FAILED);
        return;
      }
      if (result.reason === "taken") {
        // Back to the refreshed list of that day.
        setSlots(await loadSlots(slug, service.id, day));
        const month = monthOf(day);
        const fresh = await loadDays(slug, service.id, month);
        setAvailable((known) => ({ ...known, [month]: fresh }));
        setSlot(null);
      }
      setError(FAILURES[result.reason]);
    });
  }

  if (step === "pix" && deposit && confirmation && service) {
    return (
      <PixStep
        slug={slug}
        deposit={deposit}
        onPaid={markPaid}
        onRestart={restart}
      />
    );
  }

  if (step === "done" && confirmation && service) {
    return (
      <Done
        slug={slug}
        confirmation={confirmation}
        serviceName={confirmation.serviceName || service.name}
        title={deposit ? "Horário confirmado" : "Horário marcado"}
      />
    );
  }

  const open = new Set(Object.values(available).flat());

  return (
    <div className="grid gap-6" aria-busy={pending}>
      {step === "service" || !service ? (
        <section aria-labelledby="passo-servico" className="grid gap-3">
          <h2 id="passo-servico" className="font-heading text-lg font-semibold">
            Escolha o serviço
          </h2>
          <ul className="grid gap-3">
            {services.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => chooseService(item)}
                  className="grid w-full gap-1 rounded-2xl border bg-card p-4 text-left outline-none hover:border-primary-text focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
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
          <FormError message={error} />
        </section>
      ) : (
        <>
          <Summary label="Serviço" onChange={() => setStep("service")}>
            {service.name}
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
              serviceName={service.name}
              dayText={dayLabel(day)}
              slot={slot}
              minutes={service.durationMinutes}
              price={service.price}
              deposit={offer}
              cpf={cpf}
              onCpf={setCpf}
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
  title,
}: {
  slug: string;
  confirmation: Confirmation;
  serviceName: string;
  title: string;
}) {
  return (
    <section
      aria-labelledby="horario-marcado"
      className="grid gap-4 rounded-2xl border bg-card p-4"
    >
      <h2 id="horario-marcado" className="font-heading text-xl font-semibold">
        {title}
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
