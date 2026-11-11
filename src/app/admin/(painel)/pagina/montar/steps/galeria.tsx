"use client";

import { useId, useRef, useState } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { MAX_CLINIC_PHOTOS } from "@/modules/clinic-page/limits";

import { saveStepAction } from "../actions";
import { mediaSrc } from "../page-preview";
import { moveItem } from "../wizard";

import { IMAGE_ACCEPT, sendImage } from "./image-step";
import type { StepProps } from "./shared";

function same(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

// Add (several at once), remove and reorder the photos of the page. The
// whole list goes in the patch.
export function GaleriaStep({ saved, patch, setPatch, setBusy }: StepProps) {
  const list = patch.gallery ?? saved.gallery;
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  // The list as the draft has it on the server; uploads append to it there.
  const stored = useRef(saved.gallery);
  const [sending, setSending] = useState<{ done: number; total: number }>();
  const [error, setError] = useState<string | null>(null);
  const full = list.length >= MAX_CLINIC_PHOTOS;

  async function onFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length === 0) return;
    setError(null);
    setBusy(true);
    let next = list;
    try {
      // Removals and moves not saved yet go first, so that the server
      // appends to the same list the owner sees.
      if (!same(next, stored.current)) {
        const result = await saveStepAction({ gallery: next });
        if (!result.ok) {
          setError(
            result.formError ?? "Não foi possível salvar. Tente novamente.",
          );
          return;
        }
        stored.current = next;
      }
      // One at a time: Server Actions run one after the other anyway.
      for (const [index, file] of files.entries()) {
        if (next.length >= MAX_CLINIC_PHOTOS) {
          setError(`A página pode ter no máximo ${MAX_CLINIC_PHOTOS} fotos.`);
          break;
        }
        setSending({ done: index, total: files.length });
        const result = await sendImage("gallery", file);
        if (!result.ok) {
          setError(result.error);
          break;
        }
        next = [...next, result.mediaId];
        stored.current = next;
        setPatch({ gallery: next });
      }
    } finally {
      setSending(undefined);
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Até {MAX_CLINIC_PHOTOS} fotos do seu espaço e do seu trabalho. Use as
        setas para mudar a ordem.
      </p>
      {list.length > 0 ? (
        <ol className="grid gap-2" aria-label="Fotos da galeria">
          {list.map((id, index) => (
            <li
              key={id}
              className="flex items-center gap-3 rounded-xl border bg-card p-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- served by the panel media route */}
              <img
                src={mediaSrc(id)}
                alt={`Foto ${index + 1}`}
                className="size-16 shrink-0 rounded-lg bg-muted object-cover"
              />
              <span className="min-w-0 flex-1 text-sm font-medium">
                Foto {index + 1}
              </span>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Subir foto ${index + 1}`}
                  disabled={index === 0 || sending !== undefined}
                  onClick={() =>
                    setPatch({ gallery: moveItem(list, index, -1) })
                  }
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Descer foto ${index + 1}`}
                  disabled={index === list.length - 1 || sending !== undefined}
                  onClick={() =>
                    setPatch({ gallery: moveItem(list, index, 1) })
                  }
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover foto ${index + 1}`}
                  disabled={sending !== undefined}
                  onClick={() =>
                    setPatch({ gallery: list.filter((other) => other !== id) })
                  }
                >
                  ✕
                </Button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          Nenhuma foto ainda.
        </p>
      )}
      <div>
        <label htmlFor={inputId} className="sr-only">
          Adicionar fotos
        </label>
        <input
          ref={input}
          id={inputId}
          type="file"
          multiple
          accept={IMAGE_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          onChange={onFiles}
          disabled={sending !== undefined || full}
        />
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={sending !== undefined || full}
          onClick={() => input.current?.click()}
        >
          {sending
            ? `Enviando... (${sending.done + 1} de ${sending.total})`
            : full
              ? "Galeria cheia"
              : "Adicionar fotos"}
        </Button>
      </div>
      <p role="status" className="sr-only">
        {sending ? "Enviando..." : ""}
      </p>
      <FormError message={error} />
    </div>
  );
}
