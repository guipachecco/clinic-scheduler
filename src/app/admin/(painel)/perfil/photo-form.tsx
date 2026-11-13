"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { initials } from "@/components/avatar";
import { FormError } from "@/components/form-message";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";

import { removeProfilePhotoAction, saveProfilePhotoAction } from "./actions";

const UPLOAD_ERROR = "Não foi possível enviar a foto. Tente novamente.";
const REMOVE_ERROR = "Não foi possível remover a foto. Tente novamente.";
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp";

// The profile photo: pick a file (saved right away) or remove it. Without a
// photo the circle shows the initials, as everywhere else.
export function PhotoForm({
  photoId,
  name,
}: {
  photoId: string | null;
  name: string;
}) {
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"sending" | "removing" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setMessage("");
    // Checked here too: a body above the server limit never reaches the action.
    if (file.size > MAX_BYTES) {
      setError("A foto deve ter no máximo 10 MB.");
      return;
    }
    setBusy("sending");
    const data = new FormData();
    data.set("file", file);
    try {
      const result = await saveProfilePhotoAction(data);
      if (result.ok) {
        setMessage("Foto atualizada.");
        router.refresh();
      } else {
        setError(result.formError);
      }
    } catch {
      setError(UPLOAD_ERROR);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setError(null);
    setMessage("");
    setBusy("removing");
    try {
      const result = await removeProfilePhotoAction();
      if (result.ok) {
        setMessage("Foto removida.");
        router.refresh();
      } else {
        setError(result.formError);
      }
    } catch {
      setError(REMOVE_ERROR);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-5">
        {photoId ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by the panel photo route handler
          <img
            src={`/admin/foto/${photoId}`}
            alt="Sua foto de perfil"
            className="size-24 shrink-0 rounded-full bg-muted object-cover ring-1 ring-border"
          />
        ) : (
          <span
            aria-hidden="true"
            className="inline-flex size-24 shrink-0 items-center justify-center rounded-full bg-brand-accent font-heading text-3xl font-extrabold text-brand-accent-foreground"
          >
            {initials(name)}
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          {/* The visible button opens the hidden file field. */}
          <label htmlFor={inputId} className="sr-only">
            Escolher foto
          </label>
          <input
            ref={input}
            id={inputId}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            onChange={onFile}
            disabled={busy !== null}
          />
          <Button
            type="button"
            disabled={busy !== null}
            onClick={() => input.current?.click()}
          >
            <Icon name="camera" />
            {busy === "sending"
              ? "Enviando..."
              : photoId
                ? "Trocar foto"
                : "Escolher foto"}
          </Button>
          {photoId ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={remove}
            >
              <Icon name="trash" />
              {busy === "removing" ? "Removendo..." : "Remover"}
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        De rosto, em JPG, PNG ou WebP, com até 10 MB. Sem foto, aparecem as suas
        iniciais.
      </p>
      <FormError message={error} />
      <p role="status" className="min-h-5 text-sm font-medium text-primary">
        {message}
      </p>
    </div>
  );
}
