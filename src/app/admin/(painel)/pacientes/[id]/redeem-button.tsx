"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";

import { redeemLoyaltyAction } from "../../pagina/actions";

export function RedeemButton({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const result = await redeemLoyaltyAction(patientId);
      if (result.ok) router.refresh();
      else setError(result.formError ?? "Não foi possível salvar.");
    } catch {
      setError("Não foi possível salvar. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid justify-items-start gap-1">
      <Button type="button" disabled={pending} onClick={onClick}>
        Prêmio usado
      </Button>
      <FormError message={error} />
    </div>
  );
}
