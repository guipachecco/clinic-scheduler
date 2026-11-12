"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

import { Icon } from "./icons";
import { clientNavItems, isActiveNavItem } from "./nav-items";

// The client area's fixed bottom navigation, on phones and tablets. From the
// lg breakpoint the same items are links in the header (top-nav.tsx).
export function BottomNav({
  slug,
  signedIn,
}: {
  slug: string;
  signedIn: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {clientNavItems(slug, signedIn).map((item) => {
          const active = isActiveNavItem(item, pathname);
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
