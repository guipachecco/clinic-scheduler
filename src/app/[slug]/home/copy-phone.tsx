"use client";

import { useState } from "react";

import { Icon } from "../icons";

// The phone number with a button that copies it to the clipboard.
export function CopyPhone({ phone, label }: { phone: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="font-semibold">{label}</span>
      <button
        type="button"
        onClick={copy}
        aria-label="Copiar telefone"
        className="inline-flex size-11 items-center justify-center rounded-full text-primary-text hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Icon name="copy" />
      </button>
      <span role="status" className="text-sm text-muted-foreground">
        {copied ? "Copiado" : ""}
      </span>
    </div>
  );
}
