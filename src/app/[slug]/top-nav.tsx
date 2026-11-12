"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { Icon } from "./icons";
import { clientNavItems, isActiveNavItem } from "./nav-items";

// The client area's navigation in the header, from the lg breakpoint; below
// it the bottom bar (bottom-nav.tsx) shows the same items. Only one of the two
// is displayed, so both keep the "Navegação" name.
export function TopNav({
  slug,
  signedIn,
}: {
  slug: string;
  signedIn: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegação" className="hidden lg:block">
      <ul className="flex items-center gap-1">
        {clientNavItems(slug, signedIn).map((item) => {
          const active = isActiveNavItem(item, pathname);
          return (
            <li key={item.label}>
              <Link
                href={item.href as Route}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-2 rounded-full px-4 text-sm whitespace-nowrap outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  active
                    ? "bg-accent font-bold text-primary-text"
                    : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon name={item.icon} className="size-5 shrink-0" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
