import type { Route } from "next";
import Link from "next/link";

import { Icon, type IconName } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { MERCADO_PAGO_VISIBLE } from "@/modules/mercado-pago/visible";
import { formatCents } from "@/modules/services/fields";

// Display helpers shared by the financial pages. Server-safe and client-safe.

export const money = (cents: number) => formatCents(cents);

// Signed amounts for the cash report: "+ R$ 10,00" / "− R$ 10,00".
export const signedMoney = (cents: number) =>
  `${cents < 0 ? "−" : "+"} ${formatCents(Math.abs(cents))}`;

// "2026-11-04" -> "04/11/2026"
export function formatDay(date: string | null): string {
  if (!date) return "—";
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

const TABS = [
  { href: "/admin/financeiro", label: "Resumo" },
  { href: "/admin/financeiro/orcamentos", label: "Orçamentos" },
  { href: "/admin/financeiro/vendas", label: "Vendas" },
  { href: "/admin/financeiro/receber", label: "A receber" },
  { href: "/admin/financeiro/caixa", label: "Caixa" },
  { href: "/admin/financeiro/despesas", label: "Despesas" },
  { href: "/admin/financeiro/mercado-pago", label: "Mercado Pago" },
] as const;

export function FinanceTabs({
  current,
}: {
  current: (typeof TABS)[number]["href"];
}) {
  return (
    <nav aria-label="Financeiro" className="-mx-1 overflow-x-auto">
      <ul className="flex gap-1 p-1">
        {TABS.filter(
          (tab) =>
            MERCADO_PAGO_VISIBLE || tab.href !== "/admin/financeiro/mercado-pago",
        ).map((tab) => (
          <li key={tab.href} className="shrink-0">
            <Link
              href={tab.href as Route}
              aria-current={tab.href === current ? "page" : undefined}
              className={cn(
                "inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab.href === current
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground hover:bg-muted/70",
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const STATE_STYLES = {
  paid: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  partial:
    "bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100",
  open: "bg-muted text-foreground",
  overdue: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
  cancelled: "bg-muted text-muted-foreground line-through",
} as const;

export const STATE_LABELS = {
  paid: "Paga",
  partial: "Paga em parte",
  open: "Em aberto",
  overdue: "Atrasada",
  cancelled: "Cancelada",
} as const;

export function StateBadge({ state }: { state: keyof typeof STATE_STYLES }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold",
        STATE_STYLES[state],
      )}
    >
      {STATE_LABELS[state]}
    </span>
  );
}

export function PageTitle({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return <PageHeader title={title}>{children}</PageHeader>;
}

const ICON_TONES = {
  blue: "bg-primary text-primary-foreground",
  pink: "bg-brand-accent text-brand-accent-foreground",
  muted: "bg-muted text-muted-foreground",
  alert: "bg-destructive text-destructive-foreground",
} as const;

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  icon,
  iconTone = "muted",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "alert";
  icon?: IconName;
  iconTone?: keyof typeof ICON_TONES;
}) {
  return (
    <div className="grid content-start gap-1 rounded-2xl border bg-card p-4">
      {icon ? (
        <span
          className={cn(
            "mb-2 inline-flex size-9 items-center justify-center rounded-xl",
            ICON_TONES[tone === "alert" ? "alert" : iconTone],
          )}
        >
          <Icon name={icon} className="size-5" />
        </span>
      ) : null}
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "font-heading text-2xl font-bold tabular-nums",
          tone === "alert" && "text-destructive",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

// The figure a screen is about, in Zemana yellow (the month's balance).
export function HighlightStat({
  label,
  value,
  details,
}: {
  label: string;
  value: string;
  details?: { label: string; value: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-highlight p-5 text-highlight-foreground">
      <div className="grid gap-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="font-heading text-3xl font-extrabold tabular-nums md:text-4xl">
          {value}
        </p>
      </div>
      {details && details.length > 0 ? (
        <dl className="grid gap-1 text-sm font-semibold sm:text-right">
          {details.map((detail) => (
            <div key={detail.label} className="flex gap-2 sm:justify-end">
              <dt>{detail.label}</dt>
              <dd className="tabular-nums">{detail.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

// Month boundaries for a "YYYY-MM" string (or the month of `today`).
export function monthRange(month: string | undefined, today: string) {
  const valid =
    month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : today.slice(0, 7);
  const [y, m] = valid.split("-").map(Number) as [number, number];
  const next =
    m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const prev =
    m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return {
    month: valid,
    from: `${valid}-01`,
    to: `${next}-01`,
    next,
    prev,
    label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
}
