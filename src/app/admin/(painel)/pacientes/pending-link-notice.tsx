"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import type { PendingLink } from "@/modules/patients/links";

import { confirmLinkAction, rejectLinkAction } from "./actions";

// A client signed up online with the phone of an existing patient: the owner
// says whether it is the same person. Shown at the top of the panel and on
// the existing patient's record (showExisting off there).
export function PendingLinkNotice({
  link,
  showExisting = true,
}: {
  link: PendingLink;
  showExisting?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(action: typeof confirmLinkAction) {
    setPending(true);
    setError(null);
    try {
      const result = await action(link.provisionalId);
      // The notice is gone after the refresh.
      if (result.ok) router.refresh();
      else setError(result.message);
    } catch {
      setError("Não foi possível salvar. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      aria-label="Cadastro online pendente"
      className="grid gap-3 rounded-2xl border border-l-4 border-l-primary bg-card p-4"
    >
      <p className="font-medium">
        {link.provisionalName} se cadastrou online. É a mesma pessoa desta
        ficha?
      </p>
      <ul className="grid gap-1 text-sm text-muted-foreground">
        {showExisting ? (
          <li>
            Ficha:{" "}
            <Link
              href={`/admin/pacientes/${link.existingId}`}
              className="font-medium text-foreground underline underline-offset-4"
            >
              {link.existingName}
            </Link>
          </li>
        ) : null}
        <li>
          Cadastro online:{" "}
          <Link
            href={`/admin/pacientes/${link.provisionalId}`}
            className="font-medium text-foreground underline underline-offset-4"
          >
            ver a ficha nova
          </Link>
        </li>
        {link.existingHasAccount ? (
          <li>Esta ficha já está ligada a outra conta online.</li>
        ) : null}
      </ul>
      <FormError message={error} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          disabled={pending || link.existingHasAccount}
          onClick={() => answer(confirmLinkAction)}
        >
          É a mesma
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => answer(rejectLinkAction)}
        >
          Não é
        </Button>
      </div>
    </section>
  );
}
