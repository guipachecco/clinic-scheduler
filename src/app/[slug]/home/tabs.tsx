"use client";

import { useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type TabItem = { id: string; label: string; content: React.ReactNode };

// Accessible tabs (WAI-ARIA tabs pattern): arrows, Home and End move between
// them. The panels come already rendered by the server; only one is shown.
export function Tabs({ tabs }: { tabs: TabItem[] }) {
  const base = useId();
  const [active, setActive] = useState(tabs[0]?.id);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function move(index: number) {
    const next = tabs[(index + tabs.length) % tabs.length];
    if (!next) return;
    setActive(next.id);
    refs.current[next.id]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key === "ArrowRight") move(index + 1);
    else if (event.key === "ArrowLeft") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(tabs.length - 1);
    else return;
    event.preventDefault();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Seções da clínica"
        className="flex [scrollbar-width:none] gap-1 overflow-x-auto border-b [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                refs.current[tab.id] = element;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "-mb-px h-11 shrink-0 border-b-[3px] px-3 font-heading text-[15px] font-bold whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                selected
                  ? "border-highlight text-foreground"
                  : "border-transparent text-muted-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${base}-panel-${tab.id}`}
          aria-labelledby={`${base}-tab-${tab.id}`}
          hidden={tab.id !== active}
          className="pt-4"
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
