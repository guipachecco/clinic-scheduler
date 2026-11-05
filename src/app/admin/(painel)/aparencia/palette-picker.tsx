"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormError } from "@/components/form-message";
import type { Palette } from "@/modules/branding/palettes";

import { choosePaletteAction } from "./actions";

// Mini panel and phone drawn with the palette's own light values, so the
// choice is seen before it is made.
function Preview({ palette }: { palette: Palette }) {
  const t = palette.light;
  return (
    <div
      aria-hidden="true"
      className="flex h-28 overflow-hidden rounded-lg border"
      style={{ backgroundColor: "#f7f5f8" }}
    >
      <div
        className="grid w-1/3 content-start gap-1.5 p-2"
        style={{ backgroundColor: t.brand, color: t["brand-foreground"] }}
      >
        <span
          className="size-4 rounded-full"
          style={{ backgroundColor: t["brand-accent"] }}
        />
        <span
          className="h-2 rounded"
          style={{ backgroundColor: t.highlight }}
        />
        <span className="h-2 rounded bg-white/30" />
        <span className="h-2 rounded bg-white/30" />
      </div>
      <div className="flex flex-1 items-center justify-center">
        <div className="grid w-20 gap-1.5 rounded-lg border bg-white p-2">
          <span className="h-1.5 w-10 rounded bg-black/15" />
          <span
            className="rounded px-1 py-1 text-center text-[8px] leading-none font-semibold"
            style={{
              backgroundColor: t.primary,
              color: t["primary-foreground"],
            }}
          >
            Agendar horário
          </span>
        </div>
      </div>
    </div>
  );
}

export function PalettePicker({
  palettes,
  currentId,
}: {
  palettes: Palette[];
  currentId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function choose(id: string) {
    if (id === currentId || pending) return;
    setPending(id);
    setError(null);
    try {
      const result = await choosePaletteAction(id);
      if (result.ok) router.refresh();
      else setError(result.formError ?? "Não foi possível salvar.");
    } catch {
      setError("Não foi possível salvar. Tente novamente.");
    }
    setPending(null);
  }

  return (
    <div className="grid gap-3">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {palettes.map((palette) => {
          const selected = palette.id === currentId;
          return (
            <li key={palette.id}>
              <button
                type="button"
                aria-pressed={selected}
                disabled={pending !== null}
                onClick={() => choose(palette.id)}
                className={`grid w-full gap-3 rounded-2xl border bg-card p-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 ${
                  selected ? "border-2 border-primary" : "hover:bg-accent"
                }`}
              >
                <Preview palette={palette} />
                <span className="grid gap-0.5">
                  <span className="font-semibold">
                    {palette.name}
                    {selected ? " (em uso)" : ""}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {palette.description}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <FormError message={error} />
    </div>
  );
}
