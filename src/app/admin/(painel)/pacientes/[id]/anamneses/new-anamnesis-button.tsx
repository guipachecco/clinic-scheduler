"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";

import { createAnamnesisAction } from "./actions";

// Creates the anamnesis (prefilled from the latest one) and opens it.
export function NewAnamnesisButton({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid justify-items-end gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            let result;
            try {
              result = await createAnamnesisAction(patientId);
            } catch {
              result = {
                ok: false as const,
                message: "Não foi possível criar a anamnese. Tente novamente.",
              };
            }
            if (!result.ok) {
              setError(result.message);
              return;
            }
            router.push(
              `/admin/pacientes/${patientId}/anamneses/${result.id}` as Route,
            );
          })
        }
      >
        Nova anamnese
      </Button>
      <FormError message={error} />
    </div>
  );
}
