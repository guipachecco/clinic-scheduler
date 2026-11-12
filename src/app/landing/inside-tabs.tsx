"use client";

import Image from "next/image";
import { useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { Sticker } from "./ui";

type Shot = { src: string; alt: string };

export type InsideTab = {
  id: string;
  label: string;
  caption: string;
  desktop?: Shot;
  phone?: Shot;
};

// The desktop screenshots are 1280x800 and the phone ones 780x1688 (2x of a
// 390x844 screen).
const DESKTOP_SIZE = { width: 1280, height: 800 };
const PHONE_SIZE = { width: 780, height: 1688 };

// Tabbed gallery following the WAI-ARIA tabs pattern: arrows move between the
// tabs (wrapping), Home and End jump to the ends, and focus follows the
// selection. Every panel is in the server HTML, so without JavaScript the
// first tab shows.
export function InsideTabs({ tabs }: { tabs: InsideTab[] }) {
  const [active, setActive] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function select(index: number) {
    setActive(index);
    buttons.current[index]?.focus();
  }

  function targetFor(key: string, index: number) {
    const last = tabs.length - 1;
    if (key === "ArrowRight") return index === last ? 0 : index + 1;
    if (key === "ArrowLeft") return index === 0 ? last : index - 1;
    if (key === "Home") return 0;
    if (key === "End") return last;
    return null;
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const target = targetFor(event.key, index);
    if (target === null) return;
    event.preventDefault();
    select(target);
  }

  return (
    <div className="mt-8">
      <div
        role="tablist"
        aria-label="Telas do sistema"
        className="flex flex-wrap gap-3"
      >
        {tabs.map((tab, index) => {
          const selected = index === active;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`inside-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`inside-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "min-h-11 rounded-full border-[3px] border-[#2a0081] px-5 font-heading text-base font-extrabold transition-transform duration-100 outline-none focus-visible:ring-4 focus-visible:ring-[#2a0081]/40",
                selected
                  ? "-rotate-2 bg-[#2a0081] text-white shadow-[3px_3px_0_0_#f5c700]"
                  : "bg-white text-[#2a0081] shadow-[3px_3px_0_0_#2a0081]",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`inside-panel-${tab.id}`}
          aria-labelledby={`inside-tab-${tab.id}`}
          hidden={index !== active}
          tabIndex={0}
          className="mt-10 outline-none focus-visible:ring-4 focus-visible:ring-[#2a0081]/40"
        >
          <div className="flex flex-wrap items-end justify-center gap-8 lg:gap-10">
            {tab.desktop ? (
              <div className="w-full min-w-0 -rotate-1 overflow-hidden rounded-[20px] border-[3px] border-[#2a0081] bg-white shadow-[8px_8px_0_0_#2a0081] md:flex-1">
                <div className="flex h-7 items-center gap-1.5 border-b-[3px] border-[#2a0081] bg-[#ffd3f0] pl-3">
                  {[0, 1, 2].map((dot) => (
                    <i
                      key={dot}
                      aria-hidden="true"
                      className="size-2.5 rounded-full border-2 border-[#2a0081] bg-white"
                    />
                  ))}
                </div>
                <Image
                  src={tab.desktop.src}
                  alt={tab.desktop.alt}
                  {...DESKTOP_SIZE}
                  sizes={
                    tab.phone
                      ? "(min-width: 1152px) 860px, (min-width: 768px) calc(100vw - 280px), 100vw"
                      : "(min-width: 1152px) 1104px, 100vw"
                  }
                  className="block h-auto w-full"
                />
              </div>
            ) : null}
            {tab.phone ? (
              <div
                className={cn(
                  "w-44 shrink-0 rotate-3 overflow-hidden rounded-[30px] border-4 border-[#2a0081] bg-white shadow-[8px_8px_0_0_#2a0081]",
                  tab.desktop ? "sm:w-52" : "sm:w-60",
                )}
              >
                <Image
                  src={tab.phone.src}
                  alt={tab.phone.alt}
                  {...PHONE_SIZE}
                  sizes="(min-width: 640px) 240px, 176px"
                  className="block h-auto w-full"
                />
              </div>
            ) : null}
          </div>
          <div className="mt-8 flex justify-center">
            <Sticker className="-rotate-2 bg-[#f5c700]">{tab.caption}</Sticker>
          </div>
        </div>
      ))}
    </div>
  );
}
