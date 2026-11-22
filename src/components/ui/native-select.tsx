"use client";

import { Popover } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

type MenuItem =
  | { kind: "group"; label: string }
  | {
      kind: "option";
      value: string;
      label: string;
      disabled: boolean;
      grouped: boolean;
    };

// The options of the real <select>, groups included, read when the menu opens.
function readItems(select: HTMLSelectElement): MenuItem[] {
  const items: MenuItem[] = [];
  const pushOption = (option: HTMLOptionElement, grouped: boolean) => {
    if (option.hidden) return;
    items.push({
      kind: "option",
      value: option.value,
      label: option.text,
      disabled: option.disabled,
      grouped,
    });
  };
  for (const child of Array.from(select.children)) {
    if (child instanceof HTMLOptGroupElement) {
      items.push({ kind: "group", label: child.label });
      for (const option of Array.from(child.children)) {
        if (option instanceof HTMLOptionElement) pushOption(option, true);
      }
    } else if (child instanceof HTMLOptionElement) {
      pushOption(child, false);
    }
  }
  return items;
}

// Sets the value the way the browser's own list would, so React's onChange
// and react-hook-form's register both see it.
function chooseValue(select: HTMLSelectElement, value: string) {
  if (select.value === value) return;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

// Mouse and trackpad get our menu; touch screens keep the phone's picker.
const FINE_POINTER = "(pointer: fine)";
function subscribePointer(onChange: () => void) {
  const query = window.matchMedia(FINE_POINTER);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
function useFinePointer() {
  return React.useSyncExternalStore(
    subscribePointer,
    () => window.matchMedia(FINE_POINTER).matches,
    () => false,
  );
}

// A real <select> (labels, forms, autofill and tests keep working) whose
// list opens as a themed menu instead of the browser's grey box.
function NativeSelect({
  className,
  ref,
  onMouseDown,
  onKeyDown,
  ...props
}: React.ComponentProps<"select">) {
  const selectRef = React.useRef<HTMLSelectElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const listId = React.useId();
  const fine = useFinePointer();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<MenuItem[]>([]);
  const [selected, setSelected] = React.useState("");
  const [active, setActive] = React.useState(-1);
  const typed = React.useRef({ text: "", at: 0 });

  const setRefs = React.useCallback(
    (element: HTMLSelectElement | null) => {
      selectRef.current = element;
      if (typeof ref === "function") ref(element);
      else if (ref) ref.current = element;
    },
    [ref],
  );

  const enabled = (index: number) => {
    const item = items[index];
    return item?.kind === "option" && !item.disabled;
  };

  function openMenu() {
    const select = selectRef.current;
    if (!select || select.disabled) return;
    const next = readItems(select);
    setItems(next);
    setSelected(select.value);
    const current = next.findIndex(
      (item) => item.kind === "option" && item.value === select.value,
    );
    setActive(
      current >= 0
        ? current
        : next.findIndex((item) => item.kind === "option" && !item.disabled),
    );
    setOpen(true);
  }

  function choose(index: number) {
    const item = items[index];
    if (item?.kind !== "option" || item.disabled) return;
    if (selectRef.current) chooseValue(selectRef.current, item.value);
    setOpen(false);
  }

  function move(from: number, step: 1 | -1) {
    for (let i = from + step; i >= 0 && i < items.length; i += step) {
      if (enabled(i)) return i;
    }
    return from;
  }

  // Opens centred on the chosen option (1977 in a list of years), then
  // keeps the active one in view while moving with the keyboard. One frame
  // later: the menu is positioned and sized by then.
  const justOpened = React.useRef(true);
  React.useEffect(() => {
    if (!open) {
      justOpened.current = true;
      return;
    }
    if (active < 0) return;
    const centre = justOpened.current;
    justOpened.current = false;
    const frame = requestAnimationFrame(() => {
      listRef.current
        ?.querySelector(`[data-index="${active}"]`)
        ?.scrollIntoView({ block: centre ? "center" : "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, active]);

  function onListKeyDown(event: React.KeyboardEvent) {
    const last = items.length - 1;
    if (event.key === "ArrowDown") setActive((i) => move(i, 1));
    else if (event.key === "ArrowUp") setActive((i) => move(i, -1));
    else if (event.key === "Home") setActive(move(-1, 1));
    else if (event.key === "End") setActive(move(last + 1, -1));
    else if (event.key === "Enter" || event.key === " ") choose(active);
    else if (event.key === "Tab") setOpen(false);
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      // Type to jump: "sk" goes to "Skinbooter".
      const now = event.timeStamp;
      const text =
        (now - typed.current.at < 700 ? typed.current.text : "") +
        event.key.toLowerCase();
      typed.current = { text, at: now };
      const match = items.findIndex(
        (item, index) =>
          enabled(index) &&
          item.kind === "option" &&
          item.label.toLowerCase().startsWith(text),
      );
      if (match >= 0) setActive(match);
      return;
    } else return;
    event.preventDefault();
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <select
          ref={setRefs}
          data-slot="native-select"
          aria-expanded={fine ? open : undefined}
          aria-controls={fine && open ? listId : undefined}
          className={cn(
            "h-11 w-full min-w-0 cursor-pointer rounded-lg border border-input bg-card py-1 pl-3.5 text-base shadow-xs transition-[color,box-shadow,border-color] outline-none hover:border-muted-foreground/60 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
            open && "border-ring ring-[3px] ring-ring/50",
            className,
          )}
          onMouseDown={(event) => {
            onMouseDown?.(event);
            if (!fine || event.defaultPrevented || event.button !== 0) return;
            // Our menu instead of the browser's list.
            event.preventDefault();
            event.currentTarget.focus();
            if (open) setOpen(false);
            else openMenu();
          }}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (!fine || event.defaultPrevented) return;
            const opens =
              event.key === " " ||
              event.key === "Enter" ||
              event.key === "F4" ||
              (event.altKey &&
                (event.key === "ArrowDown" || event.key === "ArrowUp"));
            if (!opens) return;
            event.preventDefault();
            openMenu();
          }}
          {...props}
        />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            listRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            selectRef.current?.focus();
          }}
          style={{ minWidth: "var(--radix-popover-trigger-width)" }}
          className="z-50 max-h-[min(22rem,var(--radix-popover-content-available-height))] max-w-[calc(100vw-1.5rem)] animate-[dialog-in_120ms_ease-out] [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-2xl shadow-black/30 outline-none"
        >
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={
              active >= 0 ? `${listId}-${active}` : undefined
            }
            onKeyDown={onListKeyDown}
            className="grid outline-none"
          >
            {items.map((item, index) =>
              item.kind === "group" ? (
                <div
                  key={`g${index}`}
                  role="presentation"
                  className={cn(
                    "px-3 pt-3 pb-1 text-[11px] font-bold tracking-wider text-muted-foreground uppercase",
                    index > 0 && "mt-1.5 border-t",
                  )}
                >
                  {item.label}
                </div>
              ) : (
                <div
                  key={`o${index}`}
                  id={`${listId}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={item.value === selected}
                  aria-disabled={item.disabled || undefined}
                  onPointerMove={() => {
                    if (!item.disabled && active !== index) setActive(index);
                  }}
                  onClick={() => choose(index)}
                  className={cn(
                    "flex min-h-9 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors select-none",
                    index === active && "bg-accent",
                    item.value === selected &&
                      "font-semibold text-primary-text",
                    item.disabled && "cursor-not-allowed opacity-45",
                  )}
                >
                  <span className="min-w-0 flex-1 break-words">
                    {item.label || " "}
                  </span>
                  {item.value === selected ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    >
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  ) : null}
                </div>
              ),
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export { NativeSelect };
