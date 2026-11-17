"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";

import { setDepositEnabledAction } from "./actions";

export function DepositToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          const result = await setDepositEnabledAction(!enabled).catch(() => ({
            ok: false,
            formError: "Não foi possível salvar. Tente novamente.",
          }));
          setSaving(false);
          if (result.ok) {
            setError(null);
            router.refresh();
          } else setError(result.formError ?? "Não foi possível salvar.");
        }}
      >
        {enabled ? "Desligar o sinal" : "Ligar o sinal"}
      </Button>
      <FormError message={error} />
    </span>
  );
}
