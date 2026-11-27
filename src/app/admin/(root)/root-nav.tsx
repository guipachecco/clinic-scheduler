"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";

// Sections of root's area, under the purple header: a bar of tabs with icons,
// the current one filled purple.
const ITEMS: { href: Route; label: string; icon: IconName }[] = [
  { href: "/admin/clinicas" as Route, label: "Clínicas", icon: "globe" },
  { href: "/admin/recursos" as Route, label: "Recursos", icon: "box" },
  {
    href: "/admin/monitoramento" as Route,
    label: "Monitoramento",
    icon: "pulse",
  },
  { href: "/admin/mensagens" as Route, label: "Mensagens", icon: "chat" },
  { href: "/admin/zemana" as Route, label: "Financeiro", icon: "wallet" },
];

export function RootNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Administração geral"
      className="-mx-1 overflow-x-auto print:hidden"
    >
      <ul className="flex w-max min-w-full gap-1 rounded-2xl border bg-card p-1.5 shadow-sm">
        {ITEMS.map((item) => {
          const current =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1 shrink-0">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  current
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon name={item.icon} className="size-[18px]" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
