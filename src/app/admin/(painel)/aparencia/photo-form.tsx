"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  removeOwnerPhotoAction,
  uploadOwnerPhotoAction,
  type BrandingActionResult,
} from "./actions";

const ERROR = "Não foi possível salvar. Tente novamente.";

export function PhotoForm({
  photoId,
  initial,
}: {
  photoId: string | null;
  initial: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(work: () => Promise<BrandingActionResult>) {
    setBusy(true);
    setError(null);
    let result: BrandingActionResult;
    try {
      result = await work();
    } catch {
      result = { ok: false, formError: ERROR };
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (result.ok) router.refresh();
    else setError(result.formError ?? ERROR);
  }

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("A foto deve ter até 10 MB.");
      event.target.value = "";
      return;
    }
    const data = new FormData();
    data.set("foto", file);
    void send(() => uploadOwnerPhotoAction(data));
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      {photoId ? (
        // eslint-disable-next-line @next/next/no-img-element -- session-scoped route, not optimizable
        <img
          src={`/admin/foto/${photoId}`}
          alt="Foto atual"
          className="size-20 rounded-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="inline-flex size-20 items-center justify-center rounded-full bg-brand-accent text-2xl font-bold text-brand-accent-foreground"
        >
          {initial}
        </span>
      )}
      <div className="grid gap-2">
        <div className="grid gap-1">
          <Label htmlFor="aparencia-foto">Escolher foto</Label>
          <Input
            id="aparencia-foto"
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={onPick}
          />
          <p className="text-sm text-muted-foreground">
            JPEG, PNG ou WebP, até 10 MB.
          </p>
        </div>
        {photoId ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            className="w-fit"
            onClick={() => send(() => removeOwnerPhotoAction())}
          >
            Remover foto
          </Button>
        ) : null}
        <FormError message={error} />
      </div>
    </div>
  );
}
