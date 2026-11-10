"use client";

import "@fontsource-variable/bricolage-grotesque/wdth.css";
import "./cookie-notice.css";

import { useAnimate, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

import { displayClass, TornEdge } from "../ui";

import { BigCookie, Zema } from "./characters";
import {
  COOKIE_NOTICE_ACCEPTED,
  COOKIE_NOTICE_COOKIE,
  COOKIE_NOTICE_MAX_AGE,
} from "./cookie";

const linkClass =
  "font-bold underline underline-offset-2 outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-[#2a0081]";

// The yellow strip fixed at the bottom of the screen, with Zema running from
// the giant cookie along its torn top edge. "Entendi" saves the choice in a
// cookie, then Zema leaps away, the cookie rolls past and the strip drops.
export function CookieNoticeBar() {
  const [hidden, setHidden] = useState(false);
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLElement>();
  // Height of the strip, kept as blank space at the end of the page so its
  // last links can scroll out from under the fixed strip.
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const strip = scope.current;
    if (hidden || !strip) return;
    const observer = new ResizeObserver(() =>
      setHeight(strip.getBoundingClientRect().height),
    );
    observer.observe(strip);
    return () => observer.disconnect();
  }, [hidden, scope]);

  async function accept() {
    document.cookie = `${COOKIE_NOTICE_COOKIE}=${COOKIE_NOTICE_ACCEPTED}; path=/; max-age=${COOKIE_NOTICE_MAX_AGE}; samesite=lax`;
    if (reduce || !scope.current) {
      setHidden(true);
      return;
    }
    scope.current.classList.add("cn-leaving");
    await Promise.all([
      animate(
        ".cn-zema-exit",
        { x: [0, 40, 280], y: [0, -80, -40], rotate: [0, -12, 10] },
        { duration: 0.6, ease: [0.3, 0, 0.6, 1] },
      ),
      animate(
        ".cn-cookie-exit",
        { x: "100vw" },
        { duration: 0.7, ease: "easeIn" },
      ),
      animate(
        scope.current,
        { y: "120%" },
        { duration: 0.5, delay: 0.55, ease: [0.5, 0, 0.75, 0] },
      ),
    ]);
    setHidden(true);
  }

  if (hidden) return null;

  return (
    <>
      <div aria-hidden="true" className="shrink-0" style={{ height }} />
      <section
        ref={scope}
        aria-label="Aviso de cookies"
        className="fixed inset-x-0 bottom-0 z-40"
      >
        {/* The chase: decoration only, never in the way of clicks. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-full z-10 h-48 overflow-hidden"
        >
          <div className="cn-chase absolute bottom-1.5 h-28 w-[200px] sm:bottom-2.5 sm:w-[230px]">
            <div className="cn-cookie-exit absolute bottom-0 left-0 w-24 sm:w-28">
              <div className="cn-cookie">
                <BigCookie />
              </div>
            </div>
            <div className="cn-zema-exit absolute bottom-0.5 left-[114px] w-[68px] sm:left-[134px] sm:w-[78px]">
              <div className="cn-zema">
                <Zema />
              </div>
            </div>
          </div>
        </div>

        <div className="relative bg-[#f5c700] px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-[#2a0081] sm:px-7">
          {/* A purple copy 3px higher outlines the torn edge, so the strip
            stands out on the yellow sections of the landing too. */}
          <TornEdge className="bottom-[calc(100%+2px)] text-[#2a0081]" />
          <TornEdge className="text-[#f5c700]" />
          <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <p className="flex-1 text-[15px] leading-snug">
              <strong
                className={cn(
                  displayClass,
                  "mb-1 block text-2xl sm:text-[1.7rem]",
                )}
              >
                Só cookies do bem
              </strong>
              Usamos apenas o necessário: manter você conectada e lembrar o tema
              claro ou escuro. Nada de rastrear.{" "}
              <Link href="/privacidade" className={linkClass}>
                Privacidade
              </Link>
              {" · "}
              <Link href="/termos" className={linkClass}>
                Termos
              </Link>
            </p>
            <button
              type="button"
              onClick={accept}
              className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full border-[3px] border-[#2a0081] bg-[#ffd3f0] px-8 font-heading text-lg font-extrabold text-[#2a0081] shadow-[4px_4px_0_0_#2a0081] transition-[transform,box-shadow] duration-100 outline-none focus-visible:ring-4 focus-visible:ring-[#2a0081]/40 active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_0_#2a0081]"
            >
              Entendi
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
