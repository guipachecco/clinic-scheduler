"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";

import { setReviewHiddenAction } from "../actions";

export function ReviewVisibilityButton({
  id,
  hidden,
}: {
  id: string;
  hidden: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const result = await setReviewHiddenAction(id, !hidden);
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
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={onClick}
      >
        {hidden ? "Mostrar" : "Esconder"}
      </Button>
      <FormError message={error} />
    </div>
  );
}
