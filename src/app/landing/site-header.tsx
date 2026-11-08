"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { BrandImage } from "@/components/brand-image";
import { ThemeToggle } from "@/components/theme-toggle";
import { authClient } from "@/lib/auth-client";

const subscribeNothing = () => () => {};

// True once the page runs in the browser (false while server rendering and
// hydrating), so client-only bits never mismatch the static HTML.
function useIsBrowser() {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}

// The landing page header. The page is static, so the session is read here in
// the browser: a signed-in client sees "Suas clínicas"; everyone else (and
// everyone while the session loads or if it fails) sees "Entrar".
export function SiteHeader() {
  const isBrowser = useIsBrowser();
  const { data } = authClient.useSession();
  const isClient = isBrowser && data?.user.role === "client";

  return (
    <header className="sticky top-0 z-40 h-(--site-header-h) border-b-[3px] border-foreground/10 bg-background">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          aria-label="Zemana, página inicial"
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrandImage kind="horizontal" size={124} />
        </Link>
        <div className="flex items-center gap-2">
          {isClient ? (
            <Link href="/minhas-clinicas" className={pillClass}>
              Suas clínicas
            </Link>
          ) : (
            <Link href="/entrar" className={pillClass}>
              Entrar
            </Link>
          )}
          {isBrowser ? (
            <ThemeToggle
              initialTheme="light"
              className="rounded-full border-2 border-foreground/80 text-foreground hover:bg-accent focus-visible:ring-ring focus-visible:ring-offset-background"
            />
          ) : (
            <span aria-hidden="true" className="size-11 shrink-0" />
          )}
        </div>
      </div>
    </header>
  );
}

const pillClass =
  "inline-flex min-h-11 items-center rounded-full border-2 border-foreground/80 px-5 font-heading font-bold text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring";
