import { DateTime } from "luxon";
import type { Metadata, Route } from "next";
import Link from "next/link";

import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";
import { requireRoot } from "@/modules/auth/session";
import { listClinics } from "@/modules/clinics/clinics";
import { ledgerHistory, listLedger } from "@/modules/platform/ledger";
import { ledgerSummary } from "@/modules/platform/ledger-summary";
import { formatCents } from "@/modules/services/fields";

import { PrintButton } from "../print-button";
import { BalanceCard, CountUp, MonthBars3D } from "./finance-3d";
import { LedgerForm, LedgerRowActions } from "./ledger-forms";

export const metadata: Metadata = { title: "Financeiro Zemana" };

const ZONE = "America/Sao_Paulo";
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const HISTORY_MONTHS = 6;
const br = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

// Root only: Zemana's own money. A dashboard of the month (balance, what came
// in and went out, what is still open), the last 6 months in 3D, and the
// entries to tick off.
export default async function ZemanaFinancePage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  await requireRoot();
  const { mes } = await searchParams;
  const now = DateTime.now().setZone(ZONE);
  const today = now.toISODate()!;
  const month = mes && MONTH.test(mes) ? mes : now.toFormat("yyyy-MM");
  const monthStart = DateTime.fromISO(`${month}-01`, { zone: ZONE }).setLocale(
    "pt-BR",
  );
  const monthLink = (offset: number) =>
    `/admin/zemana?mes=${monthStart.plus({ months: offset }).toFormat("yyyy-MM")}` as Route;
  const months = Array.from({ length: HISTORY_MONTHS }, (_, i) =>
    monthStart.minus({ months: HISTORY_MONTHS - 1 - i }),
  );

  const [rows, clinics, history] = await Promise.all([
    listLedger(month),
    listClinics(),
    ledgerHistory(months[0]!.toFormat("yyyy-MM"), month),
  ]);
  const entries = rows.map((r) => ({
    ...r,
    direction: r.direction as "in" | "out",
  }));
  const s = ledgerSummary(entries, month, today);
  const nameOf = new Map(clinics.map((c) => [c.id, c.name]));
  const open = entries.filter((e) => !e.paidOn);
  const done = entries.filter((e) => e.paidOn?.startsWith(month));
  const byMonth = new Map(history.map((h) => [h.month, h]));
  const bars = months.map((m) => {
    const key = m.toFormat("yyyy-MM");
    return {
      month: key,
      label: m.toFormat("LLL").replace(".", ""),
      inCents: byMonth.get(key)?.inCents ?? 0,
      outCents: byMonth.get(key)?.outCents ?? 0,
    };
  });
  // "novembro de 2026" -> "Novembro de 2026" (CSS capitalize would also do "De").
  const monthLabel = monthStart.toFormat("LLLL 'de' yyyy");
  const monthName = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-0.5">
          <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            Financeiro da Zemana
          </p>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight md:text-4xl">
            {monthName}
          </h1>
        </div>
        <div className="flex items-stretch gap-px bg-border print:hidden">
          <MonthLink href={monthLink(-1)} label="Mês anterior">
            ←
          </MonthLink>
          {month !== now.toFormat("yyyy-MM") ? (
            <MonthLink href={"/admin/zemana" as Route} label="Mês atual">
              Hoje
            </MonthLink>
          ) : null}
          <MonthLink href={monthLink(1)} label="Próximo mês">
            →
          </MonthLink>
          <PrintButton />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <BalanceCard
          monthName={monthName}
          balanceCents={s.balanceCents}
          receivedCents={s.receivedCents}
          paidCents={s.paidCents}
        />
        <div className="grid grid-cols-2 gap-px border bg-border">
          <Kpi
            icon="clock"
            label="Falta pagar"
            cents={s.toPayCents}
            detail={
              s.overdueBills > 0
                ? `${s.overdueBills} vencida${s.overdueBills > 1 ? "s" : ""} · ${formatCents(s.overdueCents)}`
                : "nada vencido"
            }
            alert={s.overdueBills > 0}
          />
          <Kpi
            icon="arrowIn"
            label="A receber"
            cents={s.toReceiveCents}
            detail="entradas em aberto"
          />
          <Kpi
            icon="wallet"
            label="Contas abertas"
            value={String(open.filter((e) => e.direction === "out").length)}
            detail="para pagar"
          />
          <Kpi
            icon="alert"
            label="Vencidas"
            cents={s.overdueCents}
            detail={s.overdueBills > 0 ? "pague primeiro" : "tudo em dia"}
            alert={s.overdueBills > 0}
          />
        </div>
      </div>

      <section
        aria-labelledby="seis-meses"
        className="grid gap-4 border bg-card p-5 md:p-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="seis-meses" className="font-heading text-lg font-bold">
            Últimos {HISTORY_MONTHS} meses
          </h2>
          <div className="flex gap-4 text-xs font-semibold">
            <span className="flex items-center gap-1.5">
              <span className="size-3 bg-highlight" aria-hidden="true" />
              Entrou
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 bg-primary" aria-hidden="true" />
              Paguei
            </span>
          </div>
        </div>
        <MonthBars3D bars={bars} />
      </section>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="grid gap-4">
          <EntryList
            title="Em aberto"
            empty="Nada em aberto."
            rows={open}
            nameOf={nameOf}
            today={today}
          />
          <EntryList
            title="Pago e recebido no mês"
            empty="Nada pago ou recebido neste mês ainda."
            rows={done}
            nameOf={nameOf}
            today={today}
          />
        </div>
        <section
          aria-labelledby="novo-lancamento"
          className="grid gap-3 border-t-4 border-highlight bg-card p-5 shadow-sm lg:sticky lg:top-4 print:hidden"
        >
          <h2 id="novo-lancamento" className="font-heading text-lg font-bold">
            Novo lançamento
          </h2>
          <LedgerForm
            clinics={clinics.map((c) => ({ id: c.id, name: c.name }))}
            today={today}
          />
        </section>
      </div>
    </div>
  );
}

function MonthLink({
  href,
  label,
  children,
}: {
  href: Route;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex h-11 min-w-11 items-center justify-center bg-card px-3 text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Link>
  );
}

function Kpi({
  icon,
  label,
  cents,
  value,
  detail,
  alert,
}: {
  icon: IconName;
  label: string;
  cents?: number;
  value?: string;
  detail: string;
  alert?: boolean;
}) {
  return (
    <div className="grid min-w-0 content-between gap-3 bg-card p-4 md:p-5">
      <span
        className={cn(
          "flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase",
          alert && "text-destructive",
        )}
      >
        <Icon name={icon} className="size-4" />
        {label}
      </span>
      <div className="grid gap-0.5">
        {cents !== undefined ? (
          <CountUp
            cents={cents}
            className={cn(
              "font-heading text-2xl font-extrabold break-words",
              alert && "text-destructive",
            )}
          />
        ) : (
          <span className="font-heading text-2xl font-extrabold tabular-nums">
            {value}
          </span>
        )}
        <span className="text-xs text-muted-foreground">{detail}</span>
      </div>
    </div>
  );
}

function EntryList({
  title,
  empty,
  rows,
  nameOf,
  today,
}: {
  title: string;
  empty: string;
  rows: {
    id: string;
    direction: "in" | "out";
    description: string;
    amountCents: number;
    dueOn: string;
    paidOn: string | null;
    clinicId: string | null;
  }[];
  nameOf: Map<string, string>;
  today: string;
}) {
  return (
    <section className="grid gap-2 border bg-card p-5">
      <h2 className="font-heading text-lg font-bold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="grid divide-y">
          {rows.map((r) => {
            const overdue =
              !r.paidOn && r.direction === "out" && r.dueOn < today;
            return (
              <li
                key={r.id}
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-1 border-l-4 py-2.5 pl-3",
                  r.direction === "in" ? "border-highlight" : "border-primary",
                  overdue && "border-destructive",
                )}
              >
                <div className="grid min-w-0 flex-1">
                  <span className="font-semibold break-words">
                    {r.description}
                  </span>
                  <span
                    className={cn(
                      "text-xs",
                      overdue
                        ? "font-semibold text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {r.paidOn
                      ? `${r.direction === "in" ? "Recebido" : "Pago"} em ${br(r.paidOn)}`
                      : `${overdue ? "Venceu" : "Vence"} ${br(r.dueOn)}`}
                    {r.clinicId && nameOf.has(r.clinicId)
                      ? ` · ${nameOf.get(r.clinicId)}`
                      : ""}
                  </span>
                </div>
                <span className="font-heading font-bold tabular-nums">
                  {r.direction === "in" ? "+" : "−"}{" "}
                  {formatCents(r.amountCents)}
                </span>
                <LedgerRowActions
                  id={r.id}
                  paid={Boolean(r.paidOn)}
                  direction={r.direction}
                  today={today}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
