"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";

import { handOverAllAction } from "../../actions";

const ERROR = "Não foi possível salvar. Tente novamente.";

// "Dar baixa em tudo": every product of the sale still to hand over goes out
// of the stock at once, or none does.
export function HandOverAllButton({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const result = await handOverAllAction(saleId);
      if (result.ok) router.refresh();
      else setError(result.formError ?? ERROR);
    } catch {
      setError(ERROR);
    }
    setPending(false);
  }

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        className="w-fit"
        disabled={pending}
        onClick={onClick}
      >
        {pending ? "Salvando..." : "Dar baixa em tudo"}
      </Button>
      <FormError message={error} />
    </div>
  );
}
