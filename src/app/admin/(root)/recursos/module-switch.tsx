"use client";

import { useOptimistic, useState, useTransition } from "react";

import { cn } from "@/lib/utils";
import type { ClinicModule } from "@/modules/clinics/modules";

import { setModuleAction } from "./actions";

// One module of one clinic, switched in place. Shows the new state at once
// and goes back if the server refuses.
export function ModuleSwitch({
  clinicId,
  clinicName,
  module,
  label,
  on,
  compact = false,
}: {
  clinicId: string;
  clinicName: string;
  module: ClinicModule;
  label: string;
  on: boolean;
  compact?: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(on);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function toggle() {
    const next = !optimistic;
    setFailed(false);
    startTransition(async () => {
      setOptimistic(next);
      const result = await setModuleAction({
        clinicId,
        module,
        on: next,
      }).catch(() => ({ ok: false }));
      if (!result.ok) setFailed(true);
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={optimistic}
      aria-label={`${label} em ${clinicName}`}
      title={failed ? "Não foi possível salvar. Tente de novo." : undefined}
      disabled={pending}
      onClick={toggle}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70",
        compact ? "justify-center px-2" : "w-full justify-between px-3",
        failed && "ring-2 ring-destructive",
      )}
    >
      {compact ? null : <span className="text-left">{label}</span>}
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
          optimistic ? "border-primary bg-primary" : "border-border bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute size-4.5 rounded-full shadow-sm transition-transform",
            optimistic
              ? "translate-x-[1.375rem] bg-highlight"
              : "translate-x-0.5 bg-card",
          )}
        />
      </span>
    </button>
  );
}
