"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type NavIcon =
  | "home"
  | "calendar"
  | "person"
  | "services"
  | "clock"
  | "money"
  | "page"
  | "more";

export type NavItem = {
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
  money: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6.5 9.5v5M17.5 9.5v5" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18" cy="12" r="1.2" />
    </>
  ),
  page: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
    </>
  ),
};

export function NavIconSvg({
  icon,
  active = false,
  className,
}: {
  icon: NavIcon;
  active?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {ICON_PATHS[icon]}
    </svg>
  );
}

// "/admin" is the panel root, so it only matches exactly; other items also
// match their sub-pages.
export function isActive(pathname: string, href: string) {
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
                <NavIconSvg
                  icon={item.icon}
                  active={active}
                  className="size-5 shrink-0"
                />
                {item.label}
                {badge > 0 ? (
                  <span
                    className={cn(
                      "ml-auto inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-xs font-bold",
                      active
                        ? "bg-highlight-foreground text-highlight"
                        : "bg-highlight text-highlight-foreground",
                    )}
                  >
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
