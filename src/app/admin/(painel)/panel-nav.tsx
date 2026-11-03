"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type NavIcon = "home" | "calendar" | "person" | "services" | "clock";

type NavItem = {
  href: Route;
  label: string;
  icon: NavIcon;
  // A count shown beside the label when it is above zero.
  badge?: number;
  badgeLabel?: string;
};

// Stroke icons from the approved mockup (the clock follows the same style).
const ICON_PATHS: Record<NavIcon, React.ReactNode> = {
  home: <path d="M4 11.5 12 5l8 6.5V20H4z" />,
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1-4 4-6 7-6s6 2 7 6" />
    </>
  ),
  services: (
    <>
      <circle cx="7" cy="16" r="2.5" />
      <circle cx="17" cy="16" r="2.5" />
      <circle cx="12" cy="7" r="2.5" />
      <path d="M8.5 14 11 9.2M15.5 14 13 9.2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
};

// "/admin" is the panel root, so it only matches exactly; other items also
// match their sub-pages.
function isActive(pathname: string, href: string) {
  return href === "/admin"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function PanelNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Menu principal" className="w-full md:w-auto">
      <ul className="flex gap-1 overflow-x-auto p-1 md:flex-col md:overflow-visible">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const badge = item.badge ?? 0;
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand",
                  active
                    ? "bg-highlight font-bold text-highlight-foreground"
                    : "font-medium text-white hover:bg-white/10",
                )}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="size-5 shrink-0"
                >
                  {ICON_PATHS[item.icon]}
                </svg>
                {item.label}
                {badge > 0 ? (
                  <span className="ml-auto inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-highlight-foreground px-1.5 text-xs font-bold text-highlight">
                    <span aria-hidden="true">{badge}</span>
                    <span className="sr-only">
                      , {badge} {item.badgeLabel}
                    </span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
