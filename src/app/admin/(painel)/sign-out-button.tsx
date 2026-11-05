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
    <Button
      variant="outline"
      onClick={signOut}
      disabled={isPending}
      className="border-white/50 bg-transparent text-white shadow-none hover:bg-white/10 hover:text-white focus-visible:border-white focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand"
    >
      Sair
    </Button>
  );
}
