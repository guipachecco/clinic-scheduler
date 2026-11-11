"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { Icon, type IconName } from "./icons";

type Item = { href: string; label: string; icon: IconName; exact?: boolean };

// The client area's fixed bottom navigation.
export function BottomNav({
  slug,
  signedIn,
}: {
  slug: string;
  signedIn: boolean;
}) {
  const pathname = usePathname();
  const base = `/${slug}`;
  const items: Item[] = [
    { href: base, label: "Início", icon: "home", exact: true },
    { href: `${base}/marcar`, label: "Agendar", icon: "calendar" },
    { href: `${base}/meus-horarios`, label: "Meus horários", icon: "clock" },
    {
      href: signedIn ? `${base}/perfil` : `${base}/entrar`,
      label: "Perfil",
      icon: "person",
    },
  ];

  return (
    <nav
      aria-label="Navegação"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-card pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.label}>
              <Link
                href={item.href as Route}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  active
                    ? "font-bold text-primary-text"
                    : "font-medium text-muted-foreground",
                )}
              >
                <Icon name={item.icon} className="size-6 shrink-0" />
                <span className="max-w-full truncate px-1">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
