"use client";

import { useId, useRef, useState } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { uploadImageAction } from "../actions";
import { mediaSrc } from "../page-preview";

import type { StepProps } from "./shared";

const UPLOAD_ERROR = "Não foi possível enviar a imagem. Tente novamente.";
const MAX_BYTES = 10 * 1024 * 1024;

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";

// Sends one file; the error is the action's Portuguese message.
export async function sendImage(
  slot: "logo" | "ownerPhoto" | "cover" | "gallery",
  file: File,
): Promise<{ ok: true; mediaId: string } | { ok: false; error: string }> {
  // Checked here too: a body above the server limit never reaches the action.
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "A foto deve ter no máximo 10 MB." };
  }
  const data = new FormData();
  data.set("slot", slot);
  data.set("file", file);
  try {
    const result = await uploadImageAction(data);
    return result.ok
      ? result
      : { ok: false, error: result.formError ?? UPLOAD_ERROR };
  } catch {
    return { ok: false, error: UPLOAD_ERROR };
  }
}

const SLOTS = {
  logo: {
    field: "logoMediaId",
    choose: "Escolher logo",
    hint: "De preferência com fundo transparente (PNG).",
    round: false,
  },
  ownerPhoto: {
    field: "ownerPhotoMediaId",
    choose: "Escolher foto",
    hint: "Uma foto sua ou da equipe, de rosto. Sem foto, aparecem as iniciais.",
    round: true,
  },
  cover: {
    field: "coverMediaId",
    choose: "Escolher foto de capa",
    hint: "Uma foto deitada do seu espaço. Sem capa, usamos a primeira foto da galeria.",
    round: false,
  },
} as const;

// Logo, profile photo and cover: pick a file (sent right away into the
// draft) or remove the image.
export function ImageStep({
  slot,
  saved,
  patch,
  setPatch,
  setBusy,
}: StepProps & { slot: keyof typeof SLOTS }) {
  const config = SLOTS[slot];
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const local = patch[config.field];
  const current = local === undefined ? saved[config.field] : local;

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setSending(true);
    setBusy(true);
    setError(null);
    const result = await sendImage(slot, file);
    if (result.ok) setPatch({ [config.field]: result.mediaId });
    else setError(result.error);
    setSending(false);
    setBusy(false);
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">{config.hint}</p>
      {current ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by the panel media route
        <img
          src={mediaSrc(current)}
          alt="Imagem escolhida"
          className={cn(
            "border bg-muted object-cover",
            config.round
              ? "size-28 rounded-full"
              : slot === "logo"
                ? "h-20 w-auto max-w-56 rounded-lg object-contain p-2"
                : "h-36 w-full rounded-xl",
          )}
        />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {/* The visible button opens the hidden file field. */}
        <label htmlFor={inputId} className="sr-only">
          {config.choose}
        </label>
        <input
          ref={input}
          id={inputId}
          type="file"
          accept={IMAGE_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          onChange={onFile}
          disabled={sending}
        />
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={sending}
          onClick={() => input.current?.click()}
        >
          {sending ? "Enviando..." : current ? "Trocar imagem" : config.choose}
        </Button>
        {current && !sending ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={() => setPatch({ [config.field]: null })}
          >
            Remover
          </Button>
        ) : null}
      </div>
      <p role="status" className="sr-only">
        {sending ? "Enviando..." : ""}
      </p>
      <FormError message={error} />
    </div>
  );
}
