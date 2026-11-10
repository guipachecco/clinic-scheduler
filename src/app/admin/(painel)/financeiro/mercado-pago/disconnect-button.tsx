"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";

import { disconnectMercadoPagoAction } from "../actions";

export function DisconnectButton() {
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
          const sure = window.confirm(
            "Desconectar o Mercado Pago? Os links já enviados deixam de dar baixa sozinhos aqui.",
          );
          if (!sure) return;
          setSaving(true);
          const result = await disconnectMercadoPagoAction().catch(() => ({
            ok: false,
            formError: "Não foi possível desconectar. Tente novamente.",
          }));
          setSaving(false);
          if (result.ok) router.refresh();
          else setError(result.formError ?? "Não foi possível desconectar.");
        }}
      >
        Desconectar
      </Button>
      <FormError message={error} />
    </span>
  );
}
