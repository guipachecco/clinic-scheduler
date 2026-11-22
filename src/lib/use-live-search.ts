"use client";

import { useCallback, useEffect, useRef } from "react";

// Search as you type: runs `run` once the person pauses for `delay` ms, from
// `min` characters on. Returns a function for an immediate search (a button,
// Enter). Only the latest search may show its answer: `isLatest` turns false
// as soon as another one starts, so a slow early reply never overwrites it.
export function useLiveSearch(
  term: string,
  run: (term: string, isLatest: () => boolean) => Promise<void>,
  { delay = 250, min = 2 }: { delay?: number; min?: number } = {},
) {
  const latest = useRef(0);
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  const searchNow = useCallback((value: string) => {
    const id = ++latest.current;
    void runRef.current(value, () => id === latest.current);
  }, []);

  useEffect(() => {
    const value = term.trim();
    if (value.length < min) {
      // A reply still on its way is for a term that is gone.
      latest.current++;
      return;
    }
    const timer = setTimeout(() => searchNow(value), delay);
    return () => clearTimeout(timer);
  }, [term, delay, min, searchNow]);

  return searchNow;
}
