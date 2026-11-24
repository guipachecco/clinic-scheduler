"use client";

import { useEffect } from "react";

import { cleanSource, withSource } from "./quote-link";

const KEY = "zemana-utm-source";

// Remembers the ad source of the visit (?utm_source=instagram) for the tab and,
// on a click on any WhatsApp button, adds it to the typed message. No cookie,
// no tracker: the owner reads the source in the chat.
export function SourceTag() {
  useEffect(() => {
    const fromUrl = cleanSource(
      new URLSearchParams(location.search).get("utm_source"),
    );
    if (fromUrl) sessionStorage.setItem(KEY, fromUrl);
    const source = fromUrl ?? cleanSource(sessionStorage.getItem(KEY));
    if (!source) return;
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (link instanceof HTMLAnchorElement) {
        link.href = withSource(link.href, source);
      }
    };
    // Capture phase: the href changes before the browser follows the link.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
