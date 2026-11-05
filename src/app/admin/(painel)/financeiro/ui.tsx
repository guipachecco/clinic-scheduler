import type { Route } from "next";
import Link from "next/link";

import { cn } from "@/lib/utils";
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
] as const;

export function FinanceTabs({
  current,
}: {
  current: (typeof TABS)[number]["href"];
}) {
  return (
    <nav aria-label="Financeiro" className="-mx-1 overflow-x-auto">
      <ul className="flex gap-1 p-1">
        {TABS.map((tab) => (
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
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        {title}
      </h1>
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "alert";
}) {
  return (
    <div className="grid gap-1 rounded-2xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "font-heading text-2xl font-semibold tabular-nums",
          tone === "alert" && "text-destructive",
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
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
