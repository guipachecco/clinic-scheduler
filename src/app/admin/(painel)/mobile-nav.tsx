"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

import { isActive, NavIconSvg, type NavItem } from "./panel-nav";
import { SignOutButton } from "./sign-out-button";

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Phone navigation: a fixed bottom bar plus a "Mais" sheet with the other
// sections, the theme switch and sign-out. Below md only.
export function MobileNav({
  items,
  moreItems,
  agendaBadge = 0,
  theme,
}: {
  items: NavItem[];
  moreItems: NavItem[];
  agendaBadge?: number;
  theme: Theme;
}) {
  const pathname = usePathname();
  // The sheet remembers the page it was opened on, so any navigation closes it.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const moreActive = moreItems.some((item) => isActive(pathname, item.href));
  const moreButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const button = moreButton.current;
    const sheet = dialog.current;
    sheet?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    // Escape closes; Tab stays inside the sheet.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenedOn(null);
        return;
      }
      if (event.key !== "Tab" || !sheet) return;
      const focusable = Array.from(
        sheet.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      const outside = !sheet.contains(current);
      if (event.shiftKey && (current === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      button?.focus();
    };
  }, [open]);

  return (
    <>
      <nav
        aria-label="Navegação do painel"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            const badge =
              item.href === "/admin/agenda" ? agendaBadge : (item.badge ?? 0);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <BarIcon item={item} active={active} badge={badge} />
                  <span
                    className={
                      active
                        ? "font-bold text-foreground"
                        : "font-medium text-muted-foreground"
                    }
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              ref={moreButton}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={() => setOpenedOn(pathname)}
              className="flex h-16 w-full flex-col items-center justify-center gap-0.5 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <BarIcon
                item={{ href: "/admin", label: "Mais", icon: "more" }}
                active={open || moreActive}
                badge={0}
              />
              <span
                className={
                  open || moreActive
                    ? "font-bold text-foreground"
                    : "font-medium text-muted-foreground"
                }
              >
                Mais
              </span>
            </button>
          </li>
        </ul>
      </nav>

      {open ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            aria-hidden="true"
            onClick={() => setOpenedOn(null)}
            className="absolute inset-0 animate-[sheet-fade_150ms_ease-out] bg-black/40 motion-reduce:animate-none"
          />
          <div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-label="Mais"
            className="absolute inset-x-0 bottom-0 animate-[sheet-up_200ms_ease-out] rounded-t-3xl border-t bg-card px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-card-foreground shadow-2xl motion-reduce:animate-none"
          >
            <div
              aria-hidden="true"
              className="mx-auto mb-3 h-1 w-10 rounded-full bg-border"
            />
            <ul className="grid grid-cols-2 gap-2">
              {moreItems.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-14 items-center gap-3 rounded-xl border px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "border-transparent bg-highlight font-bold text-highlight-foreground"
                          : "bg-card font-medium hover:bg-muted",
                      )}
                    >
                      <NavIconSvg
                        icon={item.icon}
                        active={active}
                        className="size-5 shrink-0"
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
              <li>
                <ThemeToggle
                  initialTheme={theme}
                  showLabel
                  className="h-14 w-full justify-start gap-3 rounded-xl border-border px-3 text-[15px] font-medium text-foreground hover:bg-muted focus-visible:ring-ring focus-visible:ring-offset-0"
                />
              </li>
              <li>
                <SignOutButton className="h-14 w-full justify-start rounded-xl border-border px-3 text-[15px] font-medium text-foreground hover:bg-muted hover:text-foreground focus-visible:border-border focus-visible:ring-ring focus-visible:ring-offset-0" />
              </li>
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}

function BarIcon({
  item,
  active,
  badge,
}: {
  item: NavItem;
  active: boolean;
  badge: number;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex h-7 w-12 items-center justify-center rounded-full",
        active
          ? "bg-highlight text-highlight-foreground"
          : "text-muted-foreground",
      )}
    >
      <NavIconSvg
        icon={item.icon}
        active={active}
        className="size-[22px] shrink-0"
      />
      {badge > 0 ? (
        <span className="absolute -top-1 right-0 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-foreground">
          <span aria-hidden="true">{badge}</span>
          <span className="sr-only">
            , {badge} {item.badgeLabel}
          </span>
        </span>
      ) : null}
    </span>
  );
}
