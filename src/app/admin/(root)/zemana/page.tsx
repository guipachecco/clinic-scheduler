import { DateTime } from "luxon";
import type { Metadata, Route } from "next";
import Link from "next/link";

import { Icon, type IconName } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { requireRoot } from "@/modules/auth/session";
import { listClinics } from "@/modules/clinics/clinics";
import { listLedger } from "@/modules/platform/ledger";
import { ledgerSummary } from "@/modules/platform/ledger-summary";
import { formatCents } from "@/modules/services/fields";

import { PrintButton } from "../print-button";
import { LedgerForm, LedgerRowActions } from "./ledger-forms";

export const metadata: Metadata = { title: "Financeiro Zemana" };

const ZONE = "America/Sao_Paulo";
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const br = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

// Root only: Zemana's own money. What came in, what was paid, the bills still
// open and the overdue ones, month by month.
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
  const monthStart = DateTime.fromISO(`${month}-01`, { zone: ZONE });
  const monthLink = (offset: number) =>
    `/admin/zemana?mes=${monthStart.plus({ months: offset }).toFormat("yyyy-MM")}` as Route;

  const [rows, clinics] = await Promise.all([listLedger(month), listClinics()]);
  const entries = rows.map((r) => ({
    ...r,
    direction: r.direction as "in" | "out",
  }));
  const s = ledgerSummary(entries, month, today);
  const nameOf = new Map(clinics.map((c) => [c.id, c.name]));
  const open = entries.filter((e) => !e.paidOn);
  const done = entries.filter((e) => e.paidOn?.startsWith(month));
  const monthName = monthStart.setLocale("pt-BR").toFormat("LLLL 'de' yyyy");

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        title="Financeiro da Zemana"
        eyebrow="Seu dinheiro, mês a mês"
      >
        <PrintButton />
      </PageHeader>

      <nav
        aria-label="Mês"
        className="flex items-center justify-between gap-2 rounded-2xl border bg-card p-2 shadow-xs"
      >
        <Link
          href={monthLink(-1)}
          className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium hover:bg-muted print:hidden"
        >
          ← Anterior
        </Link>
        <span className="font-heading text-lg font-bold capitalize">
          {monthName}
        </span>
        <Link
          href={monthLink(1)}
          className="inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium hover:bg-muted print:hidden"
        >
          Próximo →
        </Link>
      </nav>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Money
          icon="arrowIn"
          label="Entrou"
          cents={s.receivedCents}
          detail={`${formatCents(s.toReceiveCents)} ainda a receber`}
          tone="good"
        />
        <Money
          icon="arrowOut"
          label="Paguei"
          cents={s.paidCents}
          detail="contas pagas no mês"
        />
        <Money
          icon="wallet"
          label="Saldo do mês"
          cents={s.balanceCents}
          detail="entrou menos paguei"
          tone={s.balanceCents < 0 ? "bad" : "good"}
          strong
        />
        <Money
          icon={s.overdueBills > 0 ? "alert" : "clock"}
          label="Falta pagar"
          cents={s.toPayCents}
          detail={
            s.overdueBills > 0
              ? `${s.overdueBills} vencida${s.overdueBills > 1 ? "s" : ""} · ${formatCents(s.overdueCents)}`
              : "nada vencido"
          }
          tone={s.overdueBills > 0 ? "bad" : undefined}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="grid gap-4">
          <EntryList
            title="Em aberto"
            empty="Nada em aberto. 🎉"
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
          className="grid gap-3 rounded-2xl border bg-card p-5 shadow-sm lg:sticky lg:top-4 print:hidden"
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

function Money({
  icon,
  label,
  cents,
  detail,
  tone,
  strong,
}: {
  icon: IconName;
  label: string;
  cents: number;
  detail: string;
  tone?: "good" | "bad";
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 gap-1 rounded-2xl border px-4 py-3 shadow-xs",
        strong ? "bg-brand text-brand-foreground" : "bg-card",
      )}
    >
      <span
        className={cn(
          "flex items-center gap-1.5 text-xs font-medium",
          strong ? "opacity-85" : "text-muted-foreground",
        )}
      >
        <Icon name={icon} className="size-4" />
        {label}
      </span>
      <span
        className={cn(
          "font-heading text-2xl font-extrabold break-words tabular-nums",
          !strong && tone === "good" && "text-primary-text",
          !strong && tone === "bad" && "text-destructive",
        )}
      >
        {formatCents(cents)}
      </span>
      <span
        className={cn(
          "text-xs",
          strong ? "opacity-85" : "text-muted-foreground",
        )}
      >
        {detail}
      </span>
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
    <section className="grid gap-2 rounded-2xl border bg-card p-5 shadow-xs">
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
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"
              >
                <span
                  className={cn(
                    "grid size-8 place-items-center rounded-full",
                    r.direction === "in"
                      ? "bg-status-confirmed text-status-confirmed-foreground"
                      : "bg-muted",
                  )}
                >
                  <Icon
                    name={r.direction === "in" ? "arrowIn" : "arrowOut"}
                    className="size-4"
                  />
                </span>
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
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    r.direction === "in" && "text-primary-text",
                  )}
                >
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
