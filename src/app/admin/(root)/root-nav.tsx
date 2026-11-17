"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

// Sections of root's area, under the purple header. Same look as the
// financial tabs: the current one is filled purple.
const ITEMS: { href: Route; label: string }[] = [
  { href: "/admin/clinicas" as Route, label: "Clínicas" },
  { href: "/admin/recursos" as Route, label: "Recursos" },
  { href: "/admin/monitoramento" as Route, label: "Monitoramento" },
];

export function RootNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Administração geral" className="-mx-1 overflow-x-auto">
      <ul className="flex gap-1 p-1">
        {ITEMS.map((item) => {
          const current =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center rounded-lg px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  current
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground hover:bg-muted/70",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
