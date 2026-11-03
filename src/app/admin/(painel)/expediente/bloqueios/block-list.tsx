"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";

import { deleteTimeBlockAction } from "../actions";

export type BlockRow = {
  id: string;
  typeLabel: string;
  title: string | null;
  when: string;
  deletable: boolean;
};

const DELETE_ERROR = "Não foi possível excluir. Tente novamente.";

// Upcoming blocks with an inline two-step delete (no window.confirm).
export function BlockList({ blocks }: { blocks: BlockRow[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    setDeleted(false);
    try {
      const result = await deleteTimeBlockAction(id);
      if (result.ok) {
        setConfirming(null);
        setDeleted(true);
        router.refresh();
      } else {
        setConfirming(null);
        setError(result.formError ?? DELETE_ERROR);
        // The block may be gone or already started: refresh the list.
        router.refresh();
      }
    } catch {
      setError(DELETE_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      {blocks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum bloqueio previsto.
        </p>
      ) : (
        <ul className="grid gap-2">
          {blocks.map((block) => (
            <li
              key={block.id}
              className="grid gap-2 rounded-2xl border bg-card p-4"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {block.typeLabel}
                </span>
                {block.title ? (
                  <span className="font-medium">{block.title}</span>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">{block.when}</p>
              {block.deletable ? (
                confirming === block.id ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => remove(block.id)}
                    >
                      Confirmar exclusão
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirming(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-fit"
                    onClick={() => {
                      setConfirming(block.id);
                      setError(null);
                      setDeleted(false);
                    }}
                  >
                    Excluir
                  </Button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <FormError message={error} />
      <p role="status" className="text-sm font-medium text-primary">
        {deleted ? "Bloqueio excluído." : ""}
      </p>
    </div>
  );
}
