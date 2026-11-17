"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { connectAction, type SinalActionResult } from "./actions";

const ERROR = "Não foi possível enviar. Tente novamente.";

// The owner pastes the API key of her own Asaas account. The key is never
// shown back: the field is cleared as soon as the server answers.
export function ConnectForm({ onConnected }: { onConnected?: () => void }) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    let result: SinalActionResult;
    try {
      result = await connectAction({ apiKey });
    } catch {
      result = { ok: false, formError: ERROR };
    }
    setSaving(false);
    if (result.ok) {
      setError(undefined);
      setFormError(null);
      setApiKey("");
      router.refresh();
      onConnected?.();
      return;
    }
    setError(result.fieldErrors?.apiKey);
    setFormError(result.formError ?? null);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="grid content-start gap-1">
        <Label htmlFor="sinal-apiKey">Chave de API do Asaas</Label>
        <Input
          id="sinal-apiKey"
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={apiKey}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "sinal-apiKey-erro" : undefined}
          onChange={(event) => setApiKey(event.target.value)}
        />
        <FieldError id="sinal-apiKey-erro" message={error} />
      </div>
      <div className="grid gap-2">
        <FormError message={formError} />
        <Button type="submit" disabled={saving} className="w-fit">
          {saving ? "Conectando..." : "Conectar conta"}
        </Button>
      </div>
    </form>
  );
}
