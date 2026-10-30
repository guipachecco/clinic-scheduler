"use client";

import { useState } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { anonymizePatientAction } from "../actions";

const CONFIRMATION = "ANONIMIZAR";

export function AnonymizeForm({ id }: { id: string }) {
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (typed !== CONFIRMATION) return;
    setPending(true);
    setError(null);
    // On success the action redirects to the list.
    try {
      const result = await anonymizePatientAction(id, typed);
      if (result) setError(result.message);
    } catch {
      setError("Não foi possível anonimizar. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="anonymize-confirmation">
          Digite {CONFIRMATION} para confirmar
        </Label>
        <Input
          id="anonymize-confirmation"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          aria-describedby="anonymize-hint"
        />
        <p id="anonymize-hint" className="text-sm text-muted-foreground">
          Apaga nome, contatos e demais dados do cadastro. Não dá para desfazer.
        </p>
      </div>
      <FormError message={error} />
      <Button
        type="submit"
        variant="destructive"
        disabled={typed !== CONFIRMATION || pending}
        className="sm:w-fit"
      >
        {pending ? "Anonimizando..." : "Anonimizar paciente"}
      </Button>
    </form>
  );
}
