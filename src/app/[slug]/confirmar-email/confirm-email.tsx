"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

import { ResendVerification } from "../resend-verification";
import { PageTitle } from "../ui";

// Confirms the e-mail through Better Auth's endpoint (rate limited) once the
// page is open in a browser; link previews that do not run scripts confirm
// nothing.
export function ConfirmEmail({
  slug,
  token,
  // Her e-mail when she is signed in and still unconfirmed (to resend).
  email,
}: {
  slug: string;
  token: string;
  email: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "done" | "failed">(
    token ? "checking" : "failed",
  );
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    authClient
      .verifyEmail({ query: { token } })
      .then(({ error }) => {
        setState(error ? "failed" : "done");
        if (!error) router.refresh();
      })
      .catch(() => setState("failed"));
  }, [token, router]);

  if (state === "checking") {
    return <PageTitle>Confirmando seu e-mail...</PageTitle>;
  }

  if (state === "done") {
    return (
      <>
        <PageTitle description="Agora você já pode marcar seus horários.">
          E-mail confirmado
        </PageTitle>
        <Button asChild size="lg">
          <Link href={`/${slug}/marcar`}>Marcar horário</Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <PageTitle description="O link venceu ou já foi usado.">
        Não foi possível confirmar
      </PageTitle>
      {email ? (
        <ResendVerification slug={slug} email={email} />
      ) : (
        <Button asChild size="lg" variant="outline">
          <Link href={`/${slug}/entrar`}>Entrar</Link>
        </Button>
      )}
    </>
  );
}
