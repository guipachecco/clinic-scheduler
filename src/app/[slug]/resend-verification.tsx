"use client";

import { useState } from "react";

import { FormError } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/modules/auth/error-messages";

// Sends the confirmation e-mail again, through Better Auth's endpoint (rate
// limited). The link opens this clinic's confirmation page.
export function ResendVerification({
  slug,
  email,
}: {
  slug: string;
  email: string;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setState("sending");
    setError(null);
    const result = await authClient.sendVerificationEmail({
      email,
      callbackURL: `/${slug}/confirmar-email`,
    });
    if (result.error) {
      setError(authErrorMessage(result.error));
      setState("idle");
      return;
    }
    setState("sent");
  }

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={state === "sending"}
        onClick={resend}
      >
        {state === "sending" ? "Enviando..." : "Reenviar e-mail"}
      </Button>
      {state === "sent" ? (
        <p role="status" className="text-sm">
          Enviamos um novo link para {email}.
        </p>
      ) : null}
      <FormError message={error} />
    </div>
  );
}
