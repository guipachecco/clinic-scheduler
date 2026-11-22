"use client";

import { Popover } from "radix-ui";
import * as React from "react";

import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

import { NativeSelect } from "./native-select";

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const WEEKDAY_NAMES = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

function parseIso(value: string | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

// Today in the clinic's time zone, as yyyy-MM-dd.
function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

// Sets the input's value the way typing would, so React's onChange and
// react-hook-form's register both see it.
function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

// A date field: the native input (typing dd/mm/aaaa still works, and phones
// keep their own picker) with our calendar in place of the browser's.
export function DateInput({
  ref,
  className,
  inputClassName,
  min,
  max,
  disabled,
  ...props
}: React.ComponentProps<"input"> & { inputClassName?: string }) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<string>("");
  const [view, setView] = React.useState(() => {
    const t = parseIso(todayIso())!;
    return { y: t.y, m: t.m };
  });

  const setRefs = React.useCallback(
    (element: HTMLInputElement | null) => {
      inputRef.current = element;
      if (typeof ref === "function") ref(element);
      else if (ref) ref.current = element;
    },
    [ref],
  );

  function onOpenChange(next: boolean) {
    if (next) {
      const current = inputRef.current?.value ?? "";
      setSelected(current);
      const start =
        parseIso(current) ??
        parseIso(typeof max === "string" && max < todayIso() ? max : "") ??
        parseIso(todayIso())!;
      setView({ y: start.y, m: start.m });
    }
    setOpen(next);
  }

  function pick(value: string) {
    if (inputRef.current) setNativeValue(inputRef.current, value);
    setOpen(false);
    inputRef.current?.focus();
  }

  function shift(months: number) {
    setView(({ y, m }) => {
      const total = y * 12 + m + months;
      return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
    });
  }

  const today = todayIso();
  const minIso = typeof min === "string" ? min : undefined;
  const maxIso = typeof max === "string" ? max : undefined;
  const outOfRange = (value: string) =>
    (minIso !== undefined && value < minIso) ||
    (maxIso !== undefined && value > maxIso);

  // Six weeks starting on the Sunday on or before the 1st.
  const firstWeekday = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(view.y, view.m, 1 - firstWeekday + index));
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth();
    const d = date.getUTCDate();
    return {
      value: iso(y, m, d),
      day: d,
      inMonth: m === view.m,
      weekday: index % 7,
    };
  });

  const thisYear = Number(today.slice(0, 4));
  const firstYear = parseIso(minIso)?.y ?? Math.min(thisYear - 100, view.y);
  const lastYear = parseIso(maxIso)?.y ?? Math.max(thisYear + 10, view.y);
  const years = Array.from(
    { length: lastYear - firstYear + 1 },
    (_, index) => lastYear - index,
  );

  return (
    <div
      data-slot="date-input"
      className={cn("relative w-full min-w-0", className)}
    >
      <input
        ref={setRefs}
        type="date"
        min={min}
        max={max}
        disabled={disabled}
        className={cn(
          "h-11 w-full min-w-0 rounded-lg border border-input bg-card py-1 pr-12 pl-3.5 text-base shadow-xs transition-[color,box-shadow,border-color] outline-none hover:border-muted-foreground/60 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
          inputClassName,
        )}
        {...props}
      />
      <Popover.Root open={open} onOpenChange={onOpenChange}>
        <Popover.Trigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label="Abrir calendário"
            className="absolute top-1/2 right-1.5 inline-flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-primary-text focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 data-[state=open]:bg-accent data-[state=open]:text-primary-text"
          >
            <Icon name="calendar" className="size-[1.125rem]" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={8}
            collisionPadding={12}
            className="z-50 w-[19.5rem] animate-[dialog-in_140ms_ease-out] rounded-2xl border bg-popover p-4 text-popover-foreground shadow-2xl shadow-black/25 outline-none"
          >
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Mês anterior"
                onClick={() => shift(-1)}
                className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Icon name="chevronRight" className="size-4 rotate-180" />
              </button>
              <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
                <NativeSelect
                  aria-label="Mês"
                  value={view.m}
                  onChange={(event) =>
                    setView((v) => ({ ...v, m: Number(event.target.value) }))
                  }
                  className="h-9 w-auto min-w-0 border-transparent bg-transparent [background-position:right_0.375rem_center] pr-7 pl-2 font-heading text-[15px] font-bold capitalize shadow-none hover:border-transparent hover:bg-accent"
                >
                  {MONTHS.map((name, index) => (
                    <option key={name} value={index}>
                      {name}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect
                  aria-label="Ano"
                  value={view.y}
                  onChange={(event) =>
                    setView((v) => ({ ...v, y: Number(event.target.value) }))
                  }
                  className="h-9 w-auto border-transparent bg-transparent [background-position:right_0.375rem_center] pr-7 pl-2 font-heading text-[15px] font-bold tabular-nums shadow-none hover:border-transparent hover:bg-accent"
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <button
                type="button"
                aria-label="Próximo mês"
                onClick={() => shift(1)}
                className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Icon name="chevronRight" className="size-4" />
              </button>
            </div>

            <div
              role="grid"
              aria-label={`${MONTHS[view.m]} de ${view.y}`}
              className="mt-3 grid grid-cols-7 gap-1"
            >
              {WEEKDAYS.map((letter, index) => (
                <span
                  key={index}
                  role="columnheader"
                  aria-label={WEEKDAY_NAMES[index]}
                  className="pb-1 text-center text-[11px] font-bold tracking-wider text-muted-foreground"
                >
                  {letter}
                </span>
              ))}
              {days.map(({ value, day, inMonth }) => {
                const isSelected = value === selected;
                const isToday = value === today;
                return (
                  <button
                    key={value}
                    type="button"
                    role="gridcell"
                    aria-selected={isSelected}
                    aria-current={isToday ? "date" : undefined}
                    aria-label={`${day} de ${MONTHS[Number(value.slice(5, 7)) - 1]} de ${value.slice(0, 4)}`}
                    disabled={outOfRange(value)}
                    onClick={() => pick(value)}
                    className={cn(
                      "relative inline-flex h-9 cursor-pointer items-center justify-center rounded-lg text-sm tabular-nums transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-30",
                      inMonth ? "text-foreground" : "text-muted-foreground/50",
                      isSelected
                        ? "bg-highlight font-bold text-highlight-foreground shadow-sm shadow-highlight/30"
                        : "hover:bg-accent",
                      isToday &&
                        !isSelected &&
                        "font-bold text-primary-text ring-1 ring-primary/50 ring-inset",
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between border-t pt-3">
              <button
                type="button"
                onClick={() => pick("")}
                className="h-8 cursor-pointer rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Limpar
              </button>
              <button
                type="button"
                disabled={outOfRange(today)}
                onClick={() => pick(today)}
                className="h-8 cursor-pointer rounded-lg bg-primary/10 px-3 text-sm font-semibold text-primary-text transition-colors hover:bg-primary/20 disabled:opacity-40"
              >
                Hoje
              </button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
