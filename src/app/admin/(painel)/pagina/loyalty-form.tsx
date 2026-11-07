"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FieldError, FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveLoyaltyAction } from "./actions";

const SAVE_ERROR = "Não foi possível salvar. Tente novamente.";

export type LoyaltyDefaults = {
  enabled: boolean;
  visits: string;
  reward: string;
};

export function LoyaltyForm({ defaults }: { defaults: LoyaltyDefaults }) {
  const router = useRouter();
  const [values, setValues] = useState(defaults);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  function set<K extends keyof LoyaltyDefaults>(
    key: K,
    value: LoyaltyDefaults[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setErrors({});
    setSaved(false);
    try {
      const result = await saveLoyaltyAction(values);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setErrors(result.fieldErrors);
        const hasFieldErrors = Object.keys(result.fieldErrors).length > 0;
        setFormError(result.formError ?? (hasFieldErrors ? null : SAVE_ERROR));
      }
    } catch {
      setFormError(SAVE_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <label className="flex min-h-11 items-center gap-3 rounded-lg border bg-card px-3 text-sm font-medium">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={values.enabled}
          onChange={(event) => set("enabled", event.target.checked)}
        />
        Ativar cartão fidelidade
      </label>
      <div className="grid gap-2">
        <Label htmlFor="loyalty-visits">Visitas para ganhar o prêmio</Label>
        <Input
          id="loyalty-visits"
          type="number"
          inputMode="numeric"
          min={2}
          max={50}
          value={values.visits}
          aria-invalid={Boolean(errors.visits)}
          aria-describedby={errors.visits ? "loyalty-visits-erro" : undefined}
          onChange={(event) => set("visits", event.target.value)}
        />
        <FieldError id="loyalty-visits-erro" message={errors.visits} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="loyalty-reward">Prêmio</Label>
        <Input
          id="loyalty-reward"
          value={values.reward}
          aria-invalid={Boolean(errors.reward)}
          aria-describedby={errors.reward ? "loyalty-reward-erro" : undefined}
          onChange={(event) => set("reward", event.target.value)}
        />
        <FieldError id="loyalty-reward-erro" message={errors.reward} />
      </div>
      <FormError message={formError} />
      <p role="status" className="text-sm font-medium text-primary">
        {saved ? "Cartão salvo." : ""}
      </p>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Salvando..." : "Salvar cartão fidelidade"}
      </Button>
    </form>
  );
}
