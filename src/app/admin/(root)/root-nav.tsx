"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";

// Sections of root's area, under the purple header: a bar of tabs with icons,
// square, the current one filled purple with a yellow edge. Financeiro first.
const ITEMS: { href: Route; label: string; icon: IconName }[] = [
  { href: "/admin/zemana" as Route, label: "Financeiro", icon: "wallet" },
  { href: "/admin/clinicas" as Route, label: "Clínicas", icon: "globe" },
  { href: "/admin/recursos" as Route, label: "Recursos", icon: "box" },
  {
    href: "/admin/monitoramento" as Route,
    label: "Monitoramento",
    icon: "pulse",
  },
  { href: "/admin/mensagens" as Route, label: "Mensagens", icon: "chat" },
];

export function RootNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Administração geral"
      className="-mx-1 overflow-x-auto print:hidden"
    >
      <ul className="flex w-max min-w-full gap-px border bg-border">
        {ITEMS.map((item) => {
          const current =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1 shrink-0">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex h-12 items-center justify-center gap-2 border-b-4 px-5 text-sm font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  current
                    ? "border-highlight bg-primary text-primary-foreground"
                    : "border-transparent bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
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
