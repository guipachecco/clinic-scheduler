"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function signOut() {
    setIsPending(true);
    await authClient.signOut();
    router.replace("/admin/entrar");
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={signOut} disabled={isPending}>
      Sair
    </Button>
  );
}
